// Unit tests for server-graded Flashcards Check submissions (docs/plans/FLASHCARDS.md §7).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  WINDOW_GRACE_MS,
  handleSubmitFlashcardCheck,
  type FlashcardCheckCaller,
} from './flashcardCheck';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleSubmitFlashcardCheck>[0];

function makeDb(docs: Record<string, Doc>) {
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    set: (data: Doc, opts?: { merge?: boolean }) => {
      docs[path] = opts?.merge ? { ...(docs[path] ?? {}), ...data } : data;
    },
  });
  const docRef = (path: string) => ({
    ...refFor(path),
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => docRef(`${c}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: ReturnType<typeof refFor>) => ref.get(),
        set: (
          ref: ReturnType<typeof refFor>,
          d: Doc,
          o?: { merge?: boolean }
        ) => ref.set(d, o),
      }),
  } as unknown as Db;
}

const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
const UID = 'student-1';
const SESSION_PATH = 'flashcard_sessions/a1';
const POINTER_PATH = `student_assignments/${UID}/items/a1`;
const PROGRESS_PATH = `${SESSION_PATH}/progress/${UID}`;

const CARDS = [
  { id: 'c1', term: 'el perro', definition: 'dog' },
  { id: 'c2', term: 'la canción', definition: 'song' },
  { id: 'c3', term: 'el gato', definition: 'cat' },
  { id: 'c4', term: 'la casa', definition: 'house' },
];

const student: FlashcardCheckCaller = {
  uid: UID,
  studentRole: true,
  classIds: ['class-1'],
};

function session(over: Doc = {}): Doc {
  return {
    teacherUid: 'teacher-1',
    kind: 'check',
    checkMode: 'write',
    status: 'active',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    classIds: ['class-1'],
    cards: CARDS,
    lockedSettings: {
      showFirst: 'definition',
      strict: false,
      testTypes: ['mc', 'fib'],
      testCount: 'all',
    },
    ...over,
  };
}

const writeLog = (responses: Record<string, string>) =>
  CARDS.map((card) => ({
    cardId: card.id,
    response: responses[card.id] ?? card.term,
  }));

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('handleSubmitFlashcardCheck access', () => {
  it('rejects unauthenticated and non-student callers', async () => {
    const db = makeDb({ [SESSION_PATH]: session() });
    const input = { assignmentId: 'a1', answerLog: writeLog({}) };
    await expectCode(
      handleSubmitFlashcardCheck(db, null, input, NOW),
      'unauthenticated'
    );
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        { ...student, studentRole: false },
        input,
        NOW
      ),
      'permission-denied'
    );
  });

  it('denies a student outside the session classes without a pointer', async () => {
    const db = makeDb({ [SESSION_PATH]: session() });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        { ...student, classIds: ['class-9'] },
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      ),
      'permission-denied'
    );
  });

  it('lets a pointer grant access and records its classId', async () => {
    const docs: Record<string, Doc> = {
      [SESSION_PATH]: session({ classIds: [] }),
      [POINTER_PATH]: { kind: 'flashcards', classId: 'class-7' },
    };
    const result = await handleSubmitFlashcardCheck(
      makeDb(docs),
      { ...student, classIds: [] },
      { assignmentId: 'a1', answerLog: writeLog({}) },
      NOW
    );
    expect(result).toEqual({ score: 4, total: 4, submittedAt: NOW });
    expect(docs[PROGRESS_PATH]).toMatchObject({
      classId: 'class-7',
      cards: {},
      starred: [],
      round: 1,
      studyMs: 0,
      modesUsed: ['write'],
      tests: [],
      submittedAt: NOW,
      lastActiveAt: NOW,
    });
  });

  it('denies an excluded pointer even inside the class', async () => {
    const db = makeDb({
      [SESSION_PATH]: session(),
      [POINTER_PATH]: { excluded: true },
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      ),
      'permission-denied'
    );
  });

  it('rejects submissions after the close window and grace', async () => {
    const db = makeDb({
      [SESSION_PATH]: session({ closeAt: NOW - WINDOW_GRACE_MS - 1 }),
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      ),
      'failed-precondition'
    );
  });

  it('accepts inside the grace window and honours a pointer closeAt override', async () => {
    const docs: Record<string, Doc> = {
      [SESSION_PATH]: session({ closeAt: NOW - 60_000 }),
    };
    await expect(
      handleSubmitFlashcardCheck(
        makeDb(docs),
        student,
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      )
    ).resolves.toMatchObject({ score: 4 });

    const overridden = makeDb({
      [SESSION_PATH]: session({ closeAt: NOW - 10 * WINDOW_GRACE_MS }),
      [POINTER_PATH]: { classId: 'class-1', closeAt: NOW + 60_000 },
    });
    await expect(
      handleSubmitFlashcardCheck(
        overridden,
        student,
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      )
    ).resolves.toMatchObject({ total: 4 });
  });

  it('rejects a second submission', async () => {
    const db = makeDb({
      [SESSION_PATH]: session(),
      [PROGRESS_PATH]: { submittedAt: NOW - 1000, score: 1, total: 4 },
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        { assignmentId: 'a1', answerLog: writeLog({}) },
        NOW
      ),
      'already-exists'
    );
  });

  it('rejects study sessions, ended sessions and unknown modes', async () => {
    const input = { assignmentId: 'a1', answerLog: writeLog({}) };
    for (const over of [
      { kind: 'study' },
      { status: 'ended' },
      { checkMode: undefined },
    ]) {
      await expectCode(
        handleSubmitFlashcardCheck(
          makeDb({ [SESSION_PATH]: session(over) }),
          student,
          input,
          NOW
        ),
        'failed-precondition'
      );
    }
  });

  it('rejects oversized input', async () => {
    const db = makeDb({ [SESSION_PATH]: session() });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        {
          assignmentId: 'a1',
          answerLog: [{ cardId: 'c1', response: 'x'.repeat(2001) }],
        },
        NOW
      ),
      'invalid-argument'
    );
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        { assignmentId: '', answerLog: [] },
        NOW
      ),
      'invalid-argument'
    );
  });
});

describe('handleSubmitFlashcardCheck flashcards mode', () => {
  const flashSession = session({
    checkMode: 'flashcards',
    masteryThreshold: 2,
  });
  const streaks = (s: number) =>
    Object.fromEntries(CARDS.map((c) => [c.id, { s, due: 1, c: s, w: 0 }]));

  it('submits once every card meets the threshold', async () => {
    const docs: Record<string, Doc> = {
      [SESSION_PATH]: flashSession,
      [PROGRESS_PATH]: { classId: 'class-1', cards: streaks(2), round: 5 },
    };
    const result = await handleSubmitFlashcardCheck(
      makeDb(docs),
      student,
      {
        assignmentId: 'a1',
        answerLog: [],
        flags: [{ cardId: 'c1', response: 'x' }],
      },
      NOW
    );
    expect(result).toEqual({ score: 4, total: 4, submittedAt: NOW });
    expect(docs[PROGRESS_PATH]).toMatchObject({
      round: 5,
      answerLog: [],
      flags: [],
      score: 4,
    });
  });

  it('rejects when a card is below the threshold', async () => {
    const cards = { ...streaks(2), c3: { s: 1, due: 1, c: 1, w: 0 } };
    const db = makeDb({
      [SESSION_PATH]: flashSession,
      [PROGRESS_PATH]: { cards },
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        { assignmentId: 'a1', answerLog: [] },
        NOW
      ),
      'failed-precondition'
    );
  });
});

describe('handleSubmitFlashcardCheck write mode', () => {
  it('accepts an accent typo when strict is off', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: session() };
    const result = await handleSubmitFlashcardCheck(
      makeDb(docs),
      student,
      {
        assignmentId: 'a1',
        answerLog: writeLog({ c2: 'la cancion', c3: 'el raton' }).map(
          (entry) => ({
            ...entry,
            attempts: entry.cardId === 'c3' ? 2.7 : undefined,
          })
        ),
      },
      NOW
    );
    expect(result.score).toBe(3);
    const log = docs[PROGRESS_PATH].answerLog as Doc[];
    expect(log.find((e) => e.cardId === 'c2')).toEqual({
      cardId: 'c2',
      response: 'la cancion',
      attempts: 1,
      correct: true,
    });
    expect(log.find((e) => e.cardId === 'c3')).toMatchObject({
      attempts: 2,
      correct: false,
    });
  });

  it('rejects the accent typo when strict is on', async () => {
    const db = makeDb({
      [SESSION_PATH]: session({
        lockedSettings: { showFirst: 'definition', strict: true },
      }),
    });
    const result = await handleSubmitFlashcardCheck(
      db,
      student,
      { assignmentId: 'a1', answerLog: writeLog({ c2: 'la cancion' }) },
      NOW
    );
    expect(result).toMatchObject({ score: 3, total: 4 });
  });

  it('grades against the definition when the term is shown first', async () => {
    const db = makeDb({
      [SESSION_PATH]: session({ lockedSettings: { showFirst: 'term' } }),
    });
    const result = await handleSubmitFlashcardCheck(
      db,
      student,
      {
        assignmentId: 'a1',
        answerLog: CARDS.map((c) => ({ cardId: c.id, response: c.definition })),
      },
      NOW
    );
    expect(result.score).toBe(4);
  });

  it('rejects a log that misses, repeats or invents cards', async () => {
    const db = makeDb({ [SESSION_PATH]: session() });
    const full = writeLog({});
    for (const answerLog of [
      full.slice(0, 3),
      [...full.slice(0, 3), full[0]],
      [...full.slice(0, 3), { cardId: 'nope', response: 'x' }],
    ]) {
      await expectCode(
        handleSubmitFlashcardCheck(
          db,
          student,
          { assignmentId: 'a1', answerLog },
          NOW
        ),
        'invalid-argument'
      );
    }
  });
});

describe('handleSubmitFlashcardCheck test mode', () => {
  const testSession = (over: Doc = {}) =>
    session({
      checkMode: 'test',
      lockedSettings: {
        showFirst: 'definition',
        strict: false,
        testTypes: ['mc'],
        testCount: 2,
        ...over,
      },
    });

  it('requires the locked count and types', async () => {
    const db = makeDb({ [SESSION_PATH]: testSession() });
    for (const answerLog of [
      [{ cardId: 'c1', response: 'el perro', type: 'mc' }],
      [
        { cardId: 'c1', response: 'el perro', type: 'mc' },
        { cardId: 'c2', response: 'la canción', type: 'fib' },
      ],
      [
        { cardId: 'c1', response: 'el perro', type: 'mc' },
        { cardId: 'c2', response: 'la canción' },
      ],
      [
        { cardId: 'c1', response: 'el perro', type: 'mc' },
        { cardId: 'c1', response: 'el perro', type: 'mc' },
      ],
    ]) {
      await expectCode(
        handleSubmitFlashcardCheck(
          db,
          student,
          { assignmentId: 'a1', answerLog },
          NOW
        ),
        'invalid-argument'
      );
    }
  });

  it('grades multiple choice by exact string', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: testSession() };
    const result = await handleSubmitFlashcardCheck(
      makeDb(docs),
      student,
      {
        assignmentId: 'a1',
        answerLog: [
          { cardId: 'c1', response: 'el perro', type: 'mc' },
          { cardId: 'c2', response: 'la cancion', type: 'mc' },
        ],
      },
      NOW
    );
    expect(result).toEqual({ score: 1, total: 2, submittedAt: NOW });
    expect(docs[PROGRESS_PATH].answerLog).toEqual([
      { cardId: 'c1', response: 'el perro', type: 'mc', correct: true },
      { cardId: 'c2', response: 'la cancion', type: 'mc', correct: false },
    ]);
  });

  it('grades fill-in-the-blank with the matcher', async () => {
    const db = makeDb({
      [SESSION_PATH]: testSession({ testTypes: ['fib'], testCount: 'all' }),
    });
    const result = await handleSubmitFlashcardCheck(
      db,
      student,
      {
        assignmentId: 'a1',
        answerLog: CARDS.map((c) => ({
          cardId: c.id,
          response: c.id === 'c2' ? 'cancion' : c.term,
          type: 'fib',
        })),
      },
      NOW
    );
    expect(result).toMatchObject({ score: 4, total: 4 });
  });

  it('rejects multiple choice when the set has fewer than four cards', async () => {
    const db = makeDb({
      [SESSION_PATH]: session({
        checkMode: 'test',
        cards: CARDS.slice(0, 3),
        lockedSettings: { testTypes: ['mc'], testCount: 1 },
      }),
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        student,
        {
          assignmentId: 'a1',
          answerLog: [{ cardId: 'c1', response: 'dog', type: 'mc' }],
        },
        NOW
      ),
      'invalid-argument'
    );
  });

  it('keeps only one flag per graded card', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: testSession() };
    await handleSubmitFlashcardCheck(
      makeDb(docs),
      student,
      {
        assignmentId: 'a1',
        answerLog: [
          { cardId: 'c1', response: 'el perro', type: 'mc' },
          { cardId: 'c2', response: 'la cancion', type: 'mc' },
        ],
        flags: [
          { cardId: 'c2', response: 'la cancion' },
          { cardId: 'c2', response: 'again' },
          { cardId: 'c4', response: 'not graded' },
        ],
      },
      NOW
    );
    expect(docs[PROGRESS_PATH].flags).toEqual([
      { cardId: 'c2', response: 'la cancion' },
    ]);
  });
});

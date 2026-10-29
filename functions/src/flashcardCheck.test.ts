// Unit tests for server-graded Flashcards Check submissions (docs/plans/shipped/FLASHCARDS.md §7).
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

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  WINDOW_GRACE_MS,
  applyRating,
  handleRecordFlashcardCheckRatings,
  type CardProgress,
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

describe('handleRecordFlashcardCheckRatings', () => {
  const flashSession = session({
    checkMode: 'flashcards',
    masteryThreshold: 3,
  });
  const rate = (
    docs: Record<string, Doc>,
    ratings: unknown[],
    caller: FlashcardCheckCaller | null = student
  ) =>
    handleRecordFlashcardCheckRatings(
      makeDb(docs),
      caller,
      { assignmentId: 'a1', ratings },
      NOW
    );
  const cardsOf = (docs: Record<string, Doc>) =>
    (docs[PROGRESS_PATH] as { cards: Record<string, unknown> }).cards;

  it('creates progress and steps the schedule from each rating', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: flashSession };
    const result = await rate(docs, [
      { cardId: 'c1', correct: true, round: 1 },
      { cardId: 'c2', correct: false, round: 1 },
    ]);
    expect(result).toEqual({ applied: 2 });
    expect(docs[PROGRESS_PATH]).toMatchObject({
      classId: 'class-1',
      modesUsed: ['flashcards'],
      lastActiveAt: NOW,
    });
    expect(cardsOf(docs)).toEqual({
      c1: { s: 1, due: 2, c: 1, w: 0 },
      c2: { s: 0, due: 2, c: 0, w: 1 },
    });
  });

  it('ignores ratings for cards that are not due, so a retried batch changes nothing', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: flashSession };
    const batch = [
      { cardId: 'c1', correct: true, round: 1 },
      { cardId: 'c1', correct: true, round: 2 },
      { cardId: 'c1', correct: true, round: 2 },
    ];
    expect(await rate(docs, batch)).toEqual({ applied: 2 });
    expect(await rate(docs, batch)).toEqual({ applied: 0 });
    expect(cardsOf(docs).c1).toEqual({ s: 2, due: 4, c: 2, w: 0 });
  });

  it('only reaches mastery through the schedule, and the submit then accepts it', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: flashSession };
    const ratings = [1, 2, 4].flatMap((round) =>
      CARDS.map((card) => ({ cardId: card.id, correct: true, round }))
    );
    await rate(docs, ratings);
    const result = await handleSubmitFlashcardCheck(
      makeDb(docs),
      student,
      { assignmentId: 'a1', answerLog: [] },
      NOW
    );
    expect(result.score).toBe(4);
  });

  it('skips unknown cards', async () => {
    const docs: Record<string, Doc> = { [SESSION_PATH]: flashSession };
    expect(
      await rate(docs, [{ cardId: 'nope', correct: true, round: 1 }])
    ).toEqual({ applied: 0 });
    expect(docs[PROGRESS_PATH]).toBeUndefined();
  });

  it('refuses other Check modes, ended or closed sessions, and submitted students', async () => {
    const one = [{ cardId: 'c1', correct: true, round: 1 }];
    await expectCode(
      rate({ [SESSION_PATH]: session({ checkMode: 'write' }) }, one),
      'failed-precondition'
    );
    await expectCode(
      rate({ [SESSION_PATH]: session({ kind: 'study' }) }, one),
      'failed-precondition'
    );
    await expectCode(
      rate({ [SESSION_PATH]: { ...flashSession, status: 'ended' } }, one),
      'failed-precondition'
    );
    await expectCode(
      rate(
        {
          [SESSION_PATH]: {
            ...flashSession,
            closeAt: NOW - WINDOW_GRACE_MS - 1,
          },
        },
        one
      ),
      'failed-precondition'
    );
    await expectCode(
      rate(
        {
          [SESSION_PATH]: flashSession,
          [PROGRESS_PATH]: { cards: {}, submittedAt: NOW - 1 },
        },
        one
      ),
      'already-exists'
    );
  });

  it('refuses signed-out, non-student and unassigned callers', async () => {
    const docs = { [SESSION_PATH]: flashSession };
    const one = [{ cardId: 'c1', correct: true, round: 1 }];
    await expectCode(rate(docs, one, null), 'unauthenticated');
    await expectCode(
      rate(docs, one, { ...student, studentRole: false }),
      'permission-denied'
    );
    await expectCode(
      rate(docs, one, { ...student, classIds: ['class-9'] }),
      'permission-denied'
    );
  });

  it('rejects malformed ratings', async () => {
    const docs = { [SESSION_PATH]: flashSession };
    await expectCode(rate(docs, []), 'invalid-argument');
    await expectCode(
      rate(docs, [{ cardId: 'c1', correct: 'yes', round: 1 }]),
      'invalid-argument'
    );
    await expectCode(
      rate(docs, [{ cardId: 'c1', correct: true, round: 0 }]),
      'invalid-argument'
    );
    await expectCode(
      rate(docs, [{ cardId: 'c1', correct: true, round: 1.5 }]),
      'invalid-argument'
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

describe('handleSubmitFlashcardCheck per-period access', () => {
  const SEAT_PATH = `${SESSION_PATH}/seats/${UID}`;
  const CONTENT_PATH = `${SESSION_PATH}/content/cards`;
  const input = { assignmentId: 'a1', answerLog: writeLog({}) };
  const periodSession = (over: Doc = {}) =>
    session({
      cards: [],
      cardsInContent: true,
      classIds: ['class-1', 'class-2'],
      periodAccess: {
        'class-1': { state: 'closed' },
        'class-2': { state: 'open' },
      },
      ...over,
    });

  it("refuses a student whose seat's period is closed", async () => {
    const db = makeDb({
      [SESSION_PATH]: periodSession(),
      [SEAT_PATH]: { classId: 'class-1' },
      [CONTENT_PATH]: { cards: CARDS },
    });
    await expect(
      handleSubmitFlashcardCheck(db, student, input, NOW)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: "Your class period isn't open right now.",
    });
  });

  it('refuses a student with no seat', async () => {
    const db = makeDb({
      [SESSION_PATH]: periodSession(),
      [CONTENT_PATH]: { cards: CARDS },
    });
    await expectCode(
      handleSubmitFlashcardCheck(db, student, input, NOW),
      'failed-precondition'
    );
  });

  it('grades from the content doc when the period is open', async () => {
    const docs: Record<string, Doc> = {
      [SESSION_PATH]: periodSession(),
      [SEAT_PATH]: { classId: 'class-2' },
      [CONTENT_PATH]: { cards: CARDS },
    };
    await expect(
      handleSubmitFlashcardCheck(
        makeDb(docs),
        { ...student, classIds: ['class-2'] },
        input,
        NOW
      )
    ).resolves.toEqual({ score: 4, total: 4, submittedAt: NOW });
  });

  it('lets a Let in now pass through a closed period', async () => {
    const db = makeDb({
      [SESSION_PATH]: periodSession({ studentAccess: { [UID]: NOW + 60_000 } }),
      [SEAT_PATH]: { classId: 'class-1' },
      [CONTENT_PATH]: { cards: CARDS },
    });
    await expect(
      handleSubmitFlashcardCheck(db, student, input, NOW)
    ).resolves.toMatchObject({ score: 4 });
  });

  it('ignores an expired Let in now', async () => {
    const db = makeDb({
      [SESSION_PATH]: periodSession({ studentAccess: { [UID]: NOW - 1 } }),
      [SEAT_PATH]: { classId: 'class-1' },
      [CONTENT_PATH]: { cards: CARDS },
    });
    await expectCode(
      handleSubmitFlashcardCheck(db, student, input, NOW),
      'failed-precondition'
    );
  });

  it('refuses when the content doc has no cards', async () => {
    const db = makeDb({
      [SESSION_PATH]: periodSession(),
      [SEAT_PATH]: { classId: 'class-2' },
    });
    await expectCode(
      handleSubmitFlashcardCheck(
        db,
        { ...student, classIds: ['class-2'] },
        input,
        NOW
      ),
      'failed-precondition'
    );
  });
});

describe('applyRating', () => {
  const cases = JSON.parse(
    readFileSync(resolve(__dirname, 'flashcardSchedule.cases.json'), 'utf8')
  ) as Array<{
    name: string;
    ratings: Array<{ round: number; correct: boolean }>;
    expected: CardProgress;
  }>;
  it.each(cases)(
    'matches the client schedule: $name',
    ({ ratings, expected }) => {
      const result = ratings.reduce<CardProgress>(
        (current, rating) => applyRating(current, rating.round, rating.correct),
        { s: 0, due: 1, c: 0, w: 0 }
      );
      expect(result).toEqual(expected);
    }
  );
});

describe('handleSubmitFlashcardCheck staff audience', () => {
  const staff: FlashcardCheckCaller = {
    uid: UID,
    studentRole: false,
    classIds: [],
    staff: { staffEmail: 'pat@orono.k12.mn.us', staffName: 'Pat T' },
  };
  const input = { assignmentId: 'a1', answerLog: writeLog({}) };

  it('grades district staff on a staff session and names their progress', async () => {
    const docs: Record<string, Doc> = {
      [SESSION_PATH]: session({ audience: 'staff', classIds: [] }),
    };
    await handleSubmitFlashcardCheck(makeDb(docs), staff, input, NOW);
    expect(docs[PROGRESS_PATH]).toMatchObject({
      staffEmail: 'pat@orono.k12.mn.us',
      staffName: 'Pat T',
      score: CARDS.length,
    });
  });

  it('refuses students on a staff session and staff on a student session', async () => {
    await expectCode(
      handleSubmitFlashcardCheck(
        makeDb({ [SESSION_PATH]: session({ audience: 'staff' }) }),
        student,
        input,
        NOW
      ),
      'permission-denied'
    );
    await expectCode(
      handleSubmitFlashcardCheck(
        makeDb({ [SESSION_PATH]: session() }),
        staff,
        input,
        NOW
      ),
      'permission-denied'
    );
  });
});

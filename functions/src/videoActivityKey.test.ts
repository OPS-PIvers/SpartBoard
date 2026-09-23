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
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  handleCheckVideoActivityAnswer,
  scrubVideoActivitySessionKey,
} from './videoActivityKey';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleCheckVideoActivityAnswer>[0];

function makeDb(docs: Record<string, Doc>) {
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    delete: () => {
      delete docs[path];
      return Promise.resolve();
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () => {
          const matches = Object.entries(docs).filter(
            ([p, d]) =>
              p.startsWith(`${path}/`) &&
              !p.slice(path.length + 1).includes('/') &&
              d[field] === value
          );
          return Promise.resolve({
            empty: matches.length === 0,
            docs: matches.map(([p, d]) => ({ data: () => d, ref: docRef(p) })),
          });
        },
      }),
    }),
  });
  return {
    collection: (c: string) => collectionRef(c),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { path: string }) =>
          Promise.resolve({ data: () => docs[ref.path] }),
        update: (ref: { path: string }, data: Doc) => {
          docs[ref.path] = { ...docs[ref.path], ...data };
        },
      }),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }, data: Doc) =>
          ops.push(() => (docs[ref.path] = data)),
        update: (ref: { path: string }, data: Doc) =>
          ops.push(() => (docs[ref.path] = { ...docs[ref.path], ...data })),
        commit: () => {
          ops.forEach((op) => op());
          return Promise.resolve();
        },
      };
    },
  } as unknown as Db;
}

const SESSION = 'video_activity_sessions/s1';
const KEY = `${SESSION}/key/answers`;
const KEYED = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital?',
    timestamp: 5,
    correctAnswer: 'Paris',
    incorrectAnswers: ['Rome'],
  },
];
const input = (answer: string) => ({
  sessionId: 's1',
  questionId: 'q1',
  answer,
});

describe('handleCheckVideoActivityAnswer', () => {
  it('refuses a student whose period is frozen, unless let in', async () => {
    const docs = (studentAccess?: Record<string, number>) =>
      makeDb({
        [SESSION]: {
          teacherUid: 't1',
          questions: [],
          periodAccess: {
            A: { state: 'closed', openAt: null, closeAt: null },
            B: { state: 'open', openAt: null, closeAt: null },
          },
          ...(studentAccess ? { studentAccess } : {}),
        },
        [KEY]: { questions: KEYED },
        [`${SESSION}/responses/stu`]: { studentUid: 'stu', classId: 'A' },
        [`${SESSION}/responses/stu2`]: { studentUid: 'stu2', classId: 'B' },
      });
    await expect(
      handleCheckVideoActivityAnswer(docs(), 'stu', input('Paris'), 1_000)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      handleCheckVideoActivityAnswer(docs(), 'stu2', input('Paris'), 1_000)
    ).resolves.toMatchObject({ isCorrect: true });
    await expect(
      handleCheckVideoActivityAnswer(
        docs({ stu: 2_000 }),
        'stu',
        input('Paris'),
        1_000
      )
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('grades a joined student against the key doc', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
      [`${SESSION}/responses/pin-p1-01`]: { studentUid: 'stu' },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('paris'))
    ).resolves.toEqual({ isCorrect: true, correctAnswer: 'Paris' });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Rome'))
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('refuses a caller who has not joined', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stranger', input('Paris'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleCheckVideoActivityAnswer(db, null, input('Paris'))
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('lets the owning teacher and view-only viewers check', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
    const viewOnly = makeDb({
      [SESSION]: { teacherUid: 't1', mode: 'view-only', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(viewOnly, 'anyone', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('falls back to a legacy embedded key', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('rejects unknown questions and malformed input', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', {
        ...input('x'),
        questionId: 'nope',
      })
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', {
        ...input('x'),
        sessionId: 'a/b',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('x'.repeat(2001)))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('handleCheckVideoActivityAnswer question order', () => {
  const TWO = [
    ...KEYED,
    {
      id: 'q2',
      type: 'FIB',
      text: 'Later?',
      timestamp: 20,
      correctAnswer: 'blue',
      incorrectAnswers: [],
    },
  ];
  const later = { sessionId: 's1', questionId: 'q2', answer: 'blue' };
  const RESPONSE = `${SESSION}/responses/pin-p1-01`;
  const dbWith = (answers: Doc[], settings: Doc = {}) =>
    makeDb({
      [SESSION]: { teacherUid: 't1', questions: [], settings },
      [KEY]: { questions: TWO },
      [RESPONSE]: { studentUid: 'stu', answers },
    });

  it('refuses a later question until the earlier ones are recorded', async () => {
    await expect(
      handleCheckVideoActivityAnswer(dbWith([]), 'stu', later)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      handleCheckVideoActivityAnswer(
        dbWith([{ questionId: 'q1', answer: 'Paris' }]),
        'stu',
        later
      )
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('lets the first question, skipping sessions and the teacher through', async () => {
    await expect(
      handleCheckVideoActivityAnswer(dbWith([]), 'stu', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
    await expect(
      handleCheckVideoActivityAnswer(
        dbWith([], { allowSkipping: true }),
        'stu',
        later
      )
    ).resolves.toMatchObject({ isCorrect: true });
    await expect(
      handleCheckVideoActivityAnswer(dbWith([]), 't1', later)
    ).resolves.toMatchObject({ isCorrect: true });
  });
});

describe('handleCheckVideoActivityAnswer when wrong answers are kept', () => {
  const RESPONSE = `${SESSION}/responses/pin-p1-01`;
  const setup = (response: Doc = {}, session: Doc = {}) => {
    const docs: Record<string, Doc> = {
      [SESSION]: {
        teacherUid: 't1',
        questions: [],
        settings: { requireCorrectAnswer: false },
        ...session,
      },
      [KEY]: { questions: KEYED },
      [RESPONSE]: {
        studentUid: 'stu',
        answers: [],
        completedAt: null,
        ...response,
      },
    };
    return { docs, db: makeDb(docs) };
  };

  it('records the first checked answer so a probe spends the attempt', async () => {
    const { docs, db } = setup();
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input(''), 1000)
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q1', answer: '', answeredAt: 1000, isCorrect: false },
    ]);
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Paris'), 2000)
    ).resolves.toMatchObject({ isCorrect: false });
    expect(docs[RESPONSE].answers).toHaveLength(1);
  });

  it('records nothing once the response is complete or the window closed', async () => {
    const done = setup({ completedAt: 5 });
    await handleCheckVideoActivityAnswer(done.db, 'stu', input('Rome'), 1000);
    expect(done.docs[RESPONSE].answers).toEqual([]);
    const closed = setup({}, { closeAt: 0 });
    await handleCheckVideoActivityAnswer(closed.db, 'stu', input('Rome'), 1e9);
    expect(closed.docs[RESPONSE].answers).toEqual([]);
  });

  it('leaves require-correct sessions to the client, which retries until right', async () => {
    const { docs, db } = setup({}, { settings: {} });
    await handleCheckVideoActivityAnswer(db, 'stu', input('Rome'), 1000);
    expect(docs[RESPONSE].answers).toEqual([]);
  });
});

describe('scrubVideoActivitySessionKey', () => {
  it('moves an embedded key off the session doc', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: { teacherUid: 't1', questions: KEYED },
    };
    const db = makeDb(docs);
    await expect(
      scrubVideoActivitySessionKey(db, 's1', docs[SESSION])
    ).resolves.toBe('scrubbed');
    expect(docs[KEY]).toEqual({ questions: KEYED });
    expect(docs[SESSION].questions).toEqual([]);
    expect(JSON.stringify(docs[SESSION])).not.toContain('correctAnswer');
    expect(docs[SESSION].publicQuestions).toEqual([
      expect.objectContaining({ id: 'q1', text: 'Capital?', timestamp: 5 }),
    ]);
  });

  it('leaves a live legacy session for a pre-release tab until it ends or the backfill asks', async () => {
    const live = { teacherUid: 't1', status: 'active', questions: KEYED };
    const docs: Record<string, Doc> = { [SESSION]: { ...live } };
    const db = makeDb(docs);
    await expect(
      scrubVideoActivitySessionKey(db, 's1', docs[SESSION], live)
    ).resolves.toBe('deferred');
    expect(docs[SESSION].questions).toEqual(KEYED);
    await expect(
      scrubVideoActivitySessionKey(
        db,
        's1',
        { ...live, keyScrubRequestedAt: 5 },
        live
      )
    ).resolves.toBe('scrubbed');
  });

  it('scrubs a legacy session on create and once it ends', async () => {
    const live = { teacherUid: 't1', status: 'active', questions: KEYED };
    await expect(
      scrubVideoActivitySessionKey(
        makeDb({ [SESSION]: { ...live } }),
        's1',
        live
      )
    ).resolves.toBe('scrubbed');
    const ended = { ...live, status: 'ended' };
    await expect(
      scrubVideoActivitySessionKey(
        makeDb({ [SESSION]: { ...ended } }),
        's1',
        ended,
        live
      )
    ).resolves.toBe('scrubbed');
  });

  it('leaves an already-split session alone', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: { questions: [], publicQuestions: [{ id: 'q1' }] },
    };
    await expect(
      scrubVideoActivitySessionKey(makeDb(docs), 's1', docs[SESSION])
    ).resolves.toBe('clean');
    expect(docs[KEY]).toBeUndefined();
  });

  it('deletes the key and content docs with their session', async () => {
    const CONTENT = `${SESSION}/content/questions`;
    const docs: Record<string, Doc> = {
      [KEY]: { questions: KEYED },
      [CONTENT]: { publicQuestions: [] },
    };
    await expect(
      scrubVideoActivitySessionKey(makeDb(docs), 's1', null)
    ).resolves.toBe('deleted');
    expect(docs[KEY]).toBeUndefined();
    expect(docs[CONTENT]).toBeUndefined();
  });
});

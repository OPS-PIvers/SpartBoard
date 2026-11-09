import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
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
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));

import { handlePaperRewordSync, isRewordOnly } from './paperRewordSync';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handlePaperRewordSync>[0];

function makeDb(docs: Record<string, Doc>) {
  const ref = (path: string) => ({
    id: path.split('/').pop() as string,
    path,
    get: () => Promise.resolve(snap(path)),
    collection: (name: string) => col(`${path}/${name}`),
    update: (fields: Doc) => {
      const next: Doc = { ...docs[path] };
      for (const [key, value] of Object.entries(fields)) {
        const [head, tail] = key.split('.');
        if (tail) next[head] = { ...(next[head] as Doc), [tail]: value };
        else next[head] = value;
      }
      docs[path] = next;
      return Promise.resolve();
    },
    set: (data: Doc) => {
      docs[path] = data;
      return Promise.resolve();
    },
  });
  const snap = (path: string) => ({
    id: path.split('/').pop() as string,
    ref: ref(path),
    exists: path in docs,
    data: () => docs[path],
  });
  const list = (prefix: string, filter?: [string, unknown]) =>
    Object.keys(docs)
      .filter(
        (p) =>
          p.startsWith(`${prefix}/`) &&
          !p.slice(prefix.length + 1).includes('/') &&
          (!filter || docs[p][filter[0]] === filter[1])
      )
      .map(snap);
  function col(path: string) {
    return {
      doc: (id: string) => ref(`${path}/${id}`),
      get: () => Promise.resolve({ docs: list(path) }),
      where: (field: string, _op: string, value: unknown) => ({
        get: () => Promise.resolve({ docs: list(path, [field, value]) }),
      }),
    };
  }
  return {
    collection: col,
    runTransaction: (
      fn: (tx: {
        get: (r: { path: string }) => Promise<ReturnType<typeof snap>>;
        update: (r: { path: string }, f: Doc) => void;
        set: (r: { path: string }, d: Doc) => void;
      }) => Promise<number>
    ) =>
      fn({
        get: (r) => Promise.resolve(snap(r.path)),
        update: (r, f) => {
          docs[r.path] = { ...docs[r.path], ...f };
        },
        set: (r, d) => {
          docs[r.path] = d;
        },
      }),
  } as unknown as Db;
}

const caller = { uid: 'u1', studentRole: false, anonymous: false };
const granted = () => Promise.resolve(true);
const R1 = 'quiz_sessions/s1/responses/r1';
const BATCH = 'users/u1/paper_batches/b1';

const seed = (over: Record<string, Doc> = {}): Record<string, Doc> => ({
  [BATCH]: {
    quizId: 'quiz',
    choiceOrder: { q1: ['same', 'a lower', 'higher'] },
  },
  'users/u1/quiz_assignments/s1': { quizId: 'quiz' },
  'quiz_sessions/s1': { teacherUid: 'u1' },
  [R1]: {
    paperBatchId: 'b1',
    answers: [{ questionId: 'q1', answer: 'a lower', status: 'submitted' }],
  },
  ...over,
});

const run = (docs: Record<string, Doc>, choices: string[]) =>
  handlePaperRewordSync(
    makeDb(docs),
    caller,
    { quizId: 'quiz', questions: [{ questionId: 'q1', choices }] },
    1000,
    granted
  );

describe('isRewordOnly', () => {
  it('accepts new wording at the same letters', () => {
    expect(isRewordOnly(['A', 'B'], ['one', 'two'])).toBe(true);
  });
  it('rejects a choice that moved letters', () => {
    expect(isRewordOnly(['x', 'y'], ['y', 'x'])).toBe(false);
  });
  it('rejects a changed count, a blank and a duplicate', () => {
    expect(isRewordOnly(['x', 'y'], ['x'])).toBe(false);
    expect(isRewordOnly(['x', 'y'], ['x', ' '])).toBe(false);
    expect(isRewordOnly(['x', 'y'], ['z', 'z'])).toBe(false);
  });
});

describe('handlePaperRewordSync', () => {
  it('updates the answer, keeps a log, and moves the print record', async () => {
    const docs = seed();
    const result = await run(docs, ['same', 'lower', 'higher']);
    expect(result).toEqual({
      answersUpdated: 1,
      responsesUpdated: 1,
      batchesUpdated: 1,
    });
    expect((docs[R1].answers as Doc[])[0]).toEqual({
      questionId: 'q1',
      answer: 'lower',
      status: 'submitted',
    });
    expect(docs[`${R1}/paper_reword_log/1000`].changes).toEqual([
      { questionId: 'q1', from: 'a lower', to: 'lower' },
    ]);
    expect((docs[BATCH].choiceOrder as Doc).q1).toEqual([
      'same',
      'lower',
      'higher',
    ]);
  });

  it('does nothing the second time', async () => {
    const docs = seed();
    await run(docs, ['same', 'lower', 'higher']);
    expect(await run(docs, ['same', 'lower', 'higher'])).toEqual({
      answersUpdated: 0,
      responsesUpdated: 0,
      batchesUpdated: 0,
    });
  });

  it('turns stub letters into the filled wording', async () => {
    const docs = seed({
      [BATCH]: { quizId: 'quiz', choiceOrder: { q1: ['A', 'B', 'C'] } },
      [R1]: {
        paperBatchId: 'b1',
        answers: [{ questionId: 'q1', answer: 'B' }],
      },
    });
    await run(docs, ['liver', 'mouth', 'stomach']);
    expect((docs[R1].answers as Doc[])[0].answer).toBe('mouth');
  });

  it('leaves answers alone when choices moved letters', async () => {
    const docs = seed();
    await run(docs, ['a lower', 'same', 'higher']);
    expect((docs[R1].answers as Doc[])[0].answer).toBe('a lower');
    expect((docs[BATCH].choiceOrder as Doc).q1).toEqual([
      'same',
      'a lower',
      'higher',
    ]);
  });

  it('leaves device responses and other teachers sessions alone', async () => {
    const device = 'quiz_sessions/s1/responses/r2';
    const docs = seed({
      [device]: { answers: [{ questionId: 'q1', answer: 'a lower' }] },
      'quiz_sessions/s1': { teacherUid: 'someone-else' },
    });
    await run(docs, ['same', 'lower', 'higher']);
    expect((docs[R1].answers as Doc[])[0].answer).toBe('a lower');
    expect((docs[device].answers as Doc[])[0].answer).toBe('a lower');
  });

  it('refuses when the feature is off', async () => {
    await expect(
      handlePaperRewordSync(
        makeDb(seed()),
        caller,
        { quizId: 'quiz', questions: [] },
        1,
        () => Promise.resolve(false)
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses students', async () => {
    await expect(
      handlePaperRewordSync(
        makeDb(seed()),
        { ...caller, studentRole: true },
        { quizId: 'quiz', questions: [] },
        1,
        granted
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

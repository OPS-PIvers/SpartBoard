import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  }),
  auth: vi.fn(),
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

import { handleDrawQuizBankQuestions, isValidDraw } from './quizBankDraw';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleDrawQuizBankQuestions>[0];

function makeDb(docs: Record<string, Doc>) {
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  return {
    collection: (c: string) => collectionRef(c),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { path: string }) =>
          Promise.resolve({
            exists: docs[ref.path] !== undefined,
            data: () => docs[ref.path],
          }),
        update: (ref: { path: string }, data: Doc) => {
          docs[ref.path] = { ...docs[ref.path], ...data };
        },
        set: (ref: { path: string }, data: Doc) => {
          docs[ref.path] = data;
        },
      }),
  } as unknown as Db;
}

const PUBLIC = ['f1', 'p1', 'p2', 'p3', 'f2'].map((id) => ({ id }));
const SLOT = {
  id: 'slot1',
  count: 2,
  points: 1,
  poolQuestionIds: ['p1', 'p2', 'p3'],
  position: 1,
};
const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/stu1`;

function seed(response: Doc = {}, slot: Doc = SLOT) {
  return {
    [SESSION]: {
      teacherUid: 't1',
      publicQuestions: PUBLIC,
      bankSlots: [slot],
      totalQuestions: 4,
    },
    [RESPONSE]: { studentUid: 'stu1', status: 'joined', ...response },
  } as Record<string, Doc>;
}

const input = { sessionId: 's1', responseKey: 'stu1' };
const ids = (docs: Record<string, Doc>) =>
  docs[RESPONSE].servedQuestionIds as string[];

describe('handleDrawQuizBankQuestions', () => {
  it('draws a legal set and records it on the response', async () => {
    const docs = seed();
    const res = await handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input);
    expect(res.servedQuestionIds).toEqual(ids(docs));
    expect(
      isValidDraw(
        PUBLIC.map((q) => q.id),
        [SLOT],
        ids(docs)
      )
    ).toBe(true);
    expect(docs[RESPONSE].lastWriteAt).toBe('SERVER_TS');
  });

  it('returns an existing legal draw without drawing again', async () => {
    const docs = seed({ servedQuestionIds: ['f1', 'p3', 'p1', 'f2'] });
    const res = await handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input);
    expect(res.servedQuestionIds).toEqual(['f1', 'p3', 'p1', 'f2']);
    expect(docs[RESPONSE].lastWriteAt).toBeUndefined();
  });

  it('replaces a list that is not a legal draw', async () => {
    const docs = seed({ servedQuestionIds: ['f1', 'f1', 'f1', 'f1'] });
    await handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input);
    expect(
      isValidDraw(
        PUBLIC.map((q) => q.id),
        [SLOT],
        ids(docs)
      )
    ).toBe(true);
  });

  it("refuses another student's response", async () => {
    const docs = seed();
    await expect(
      handleDrawQuizBankQuestions(makeDb(docs), 'stu2', input)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(docs[RESPONSE].servedQuestionIds).toBeUndefined();
  });

  it('refuses a signed-out caller', async () => {
    await expect(
      handleDrawQuizBankQuestions(makeDb(seed()), null, input)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('leaves a turned-in attempt alone', async () => {
    const docs = seed({ status: 'completed' });
    const res = await handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input);
    expect(res.servedQuestionIds).toEqual([]);
    expect(docs[RESPONSE].servedQuestionIds).toBeUndefined();
  });

  it('deals balanced slots in turn and advances the period counter', async () => {
    const docs = seed(
      { classPeriod: 'Period 1' },
      { ...SLOT, dealing: 'balanced' }
    );
    docs[`${SESSION}/bank_deals/slot1__period_1`] = { dealt: 1 };
    await handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input);
    expect(ids(docs)).toEqual(['f1', 'p3', 'p1', 'f2']);
    expect(docs[`${SESSION}/bank_deals/slot1__period_1`]).toEqual({
      dealt: 2,
      by: 'stu1',
    });
    expect(docs[RESPONSE].dealtQuestionIds).toEqual(['p3', 'p1']);
  });

  it('refuses a quiz without bank slots', async () => {
    const docs = seed();
    docs[SESSION].bankSlots = [];
    await expect(
      handleDrawQuizBankQuestions(makeDb(docs), 'stu1', input)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

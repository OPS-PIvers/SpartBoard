import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn(), delete: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  handleGetMyQuizAttempts,
  type MyAttemptsDeps,
} from './getMyQuizAttempts';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const T = 1_700_000_000_000;
const RESPONSE = 'quiz_sessions/qs1/responses/u1';

const session = (over: StubData = {}): StubData => ({
  teacherUid: 't1',
  assignmentId: 'qs1',
  classIds: ['c1'],
  scoreVisibility: 'score-and-responses',
  publicQuestions: [
    { id: 'q1', type: 'MC', text: 'a', choices: ['A', 'B'] },
    { id: 'q2', type: 'MC', text: 'b', choices: ['C', 'D'] },
  ],
  ...over,
});

const key: StubData = {
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'a',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      points: 1,
    },
    {
      id: 'q2',
      type: 'MC',
      text: 'b',
      correctAnswer: 'C',
      incorrectAnswers: ['D'],
      points: 1,
    },
  ],
};

const copy = (n: number, answers: StubData[], over: StubData = {}) => ({
  n,
  closed: true,
  studentUid: 'u1',
  submittedAt: T + n,
  score: null,
  answers,
  grading: { q1: { pointsAwarded: 1, feedback: 'ok' } },
  ...over,
});

function seed(over: Record<string, StubData | undefined> = {}) {
  const docs: Record<string, StubData> = {
    'quiz_sessions/qs1': session(),
    [RESPONSE]: { studentUid: 'u1', status: 'completed', completedAttempts: 3 },
    'users/t1/quiz_assignments/qs1': { questionSnapshot: [] },
    'users/t1/quiz_assignments/qs1/key/answers': key,
    'global_permissions/quiz-attempt-history': {
      enabled: true,
      accessLevel: 'public',
    },
    [`${RESPONSE}/attempts/1`]: copy(1, [
      { questionId: 'q1', answer: 'B' },
      { questionId: 'q2', answer: 'C' },
    ]),
    [`${RESPONSE}/attempts/2`]: copy(2, [
      { questionId: 'q1', answer: 'A' },
      { questionId: 'q2', answer: 'C' },
    ]),
    [`${RESPONSE}/attempts/3`]: copy(3, [], { closed: false }),
    'quiz_sessions/qs1/attemptScores/u1': {
      attempts: [
        { n: 1, points: 1, max: 2, state: 'scored' },
        { n: 2, points: 2, max: 2, state: 'scored' },
      ],
    },
  };
  for (const [path, value] of Object.entries(over)) {
    if (value === undefined) delete docs[path];
    else docs[path] = value;
  }
  return makeStubFirestore(docs);
}

const deps = (stub: ReturnType<typeof seed>): MyAttemptsDeps => ({
  db: stub.db as unknown as MyAttemptsDeps['db'],
  now: () => T + 1000,
  teacherEmailOf: () => Promise.resolve('teacher@school.org'),
});

const call = (stub: ReturnType<typeof seed>, uid: string | null = 'u1') =>
  handleGetMyQuizAttempts(deps(stub), uid, {
    sessionId: 'qs1',
    responseKey: 'u1',
  });

describe('handleGetMyQuizAttempts', () => {
  it('returns closed attempts with list scores and graded answers', async () => {
    const { attempts } = await call(seed());
    expect(attempts.map((a) => a.n)).toEqual([1, 2]);
    expect(attempts.map((a) => a.score)).toEqual([50, 100]);
    expect(attempts[0].answers).toEqual([
      { questionId: 'q1', answer: 'B', isCorrect: false },
      { questionId: 'q2', answer: 'C', isCorrect: true },
    ]);
    expect(attempts[0].grading).toEqual({
      q1: { pointsAwarded: 1, feedback: 'ok' },
    });
  });

  it('leaves out answers and grades when only the score is shown', async () => {
    const { attempts } = await call(
      seed({ 'quiz_sessions/qs1': session({ scoreVisibility: 'score-only' }) })
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0].answers).toBeUndefined();
    expect(attempts[0].grading).toBeUndefined();
  });

  it('returns nothing while results are hidden or locked', async () => {
    expect(
      (
        await call(
          seed({ 'quiz_sessions/qs1': session({ scoreVisibility: 'none' }) })
        )
      ).attempts
    ).toEqual([]);
    expect(
      (
        await call(
          seed({
            [RESPONSE]: {
              studentUid: 'u1',
              status: 'completed',
              resultsLockedOut: true,
            },
          })
        )
      ).attempts
    ).toEqual([]);
  });

  it('hides earlier attempts during a retake', async () => {
    const { attempts } = await call(
      seed({ [RESPONSE]: { studentUid: 'u1', status: 'in-progress' } })
    );
    expect(attempts).toEqual([]);
  });

  it('shows scores only for a score-on-submit quiz with no publish', async () => {
    const { attempts } = await call(
      seed({
        'quiz_sessions/qs1': session({
          scoreVisibility: 'none',
          showScoreOnSubmit: true,
        }),
        [RESPONSE]: { studentUid: 'u1', status: 'completed', score: 90 },
      })
    );
    expect(attempts.map((a) => a.score)).toEqual([50, 100]);
    expect(attempts[0].answers).toBeUndefined();
  });

  it('follows a student override that hides results', async () => {
    const { attempts } = await call(
      seed({
        [RESPONSE]: {
          studentUid: 'u1',
          status: 'completed',
          resultsOverride: { mode: 'hidden' },
        },
      })
    );
    expect(attempts).toEqual([]);
  });

  it("returns nothing when the teacher's flag is off", async () => {
    const { attempts } = await call(
      seed({
        'global_permissions/quiz-attempt-history': {
          enabled: true,
          accessLevel: 'admin',
        },
      })
    );
    expect(attempts).toEqual([]);
  });

  it("refuses another student's response and signed-out callers", async () => {
    await expect(call(seed(), 'u2')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(call(seed(), null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      handleGetMyQuizAttempts(deps(seed()), 'u1', {
        sessionId: 'qs1',
        responseKey: '../x',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('falls back to the copy score when the list has no scored entry', async () => {
    const { attempts } = await call(
      seed({
        'quiz_sessions/qs1/attemptScores/u1': undefined,
        [`${RESPONSE}/attempts/2`]: copy(2, [], { score: 80 }),
      })
    );
    expect(attempts.map((a) => a.score)).toEqual([null, 80]);
  });

  it('applies the class gate to student tokens', async () => {
    const asToken = (claims: StubData, over: StubData = {}) =>
      handleGetMyQuizAttempts(
        deps(seed({ 'quiz_sessions/qs1': session(over) })),
        'u1',
        { sessionId: 'qs1', responseKey: 'u1' },
        claims
      );
    const sso = { studentRole: true, classIds: ['c1', 'c2'] };
    const pinA = { studentRole: true, pinLogin: true, classIds: ['c1'] };
    const pinB = { studentRole: true, pinLogin: true, classIds: ['c9'] };
    expect((await asToken(sso)).attempts).toHaveLength(2);
    expect((await asToken(pinA)).attempts).toHaveLength(2);
    await expect(asToken(pinB)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      asToken({ studentRole: true, classIds: ['c9'] })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(
      (await asToken(pinA, { classIds: [], classId: 'c1' })).attempts
    ).toHaveLength(2);
    expect((await asToken(sso, { classIds: [] })).attempts).toHaveLength(2);
    await expect(asToken(pinA, { classIds: [] })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

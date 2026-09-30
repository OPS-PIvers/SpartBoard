import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
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
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
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
  GAME_REFUSAL,
  gameClockRefusal,
  handleCheckQuizGameAnswer,
  speedBonusPct,
} from './checkQuizGameAnswer';
import { FIB_BLANK_SEP } from './plcAssessmentMath';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleCheckQuizGameAnswer>[0];

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
  } as unknown as Db;
}

const NOW = 1_000_000;
const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const ASSIGNMENT = 'users/t1/quiz_assignments/s1';
const KEY = `${ASSIGNMENT}/key/answers`;
const KEY_QUESTIONS = [
  {
    id: 'q1',
    type: 'MC',
    points: 1,
    correctAnswer: 'Paris',
    incorrectAnswers: ['Rome'],
  },
  {
    id: 'q2',
    type: 'FIB',
    points: 2,
    correctAnswer: `red${FIB_BLANK_SEP}blue`,
    incorrectAnswers: [],
    allowPartialCredit: true,
  },
  {
    id: 'q3',
    type: 'FIB',
    points: 1,
    correctAnswer: 'essay',
    incorrectAnswers: [],
    recording: true,
  },
  {
    id: 'q4',
    type: 'MC',
    points: 1,
    correctAnswer: 'Four',
    incorrectAnswers: ['Five'],
  },
];

function world(
  overrides: {
    session?: Doc;
    response?: Doc;
    key?: Doc | null;
    assignment?: Doc;
  } = {}
) {
  const docs: Record<string, Doc> = {
    [SESSION]: {
      teacherUid: 't1',
      assignmentId: 's1',
      sessionMode: 'game',
      status: 'active',
      gameEndsAt: NOW + 60_000,
      publicQuestions: [
        { id: 'q1', timeLimit: 20 },
        { id: 'q2', timeLimit: 0 },
        { id: 'q4', timeLimit: 10 },
      ],
      ...overrides.session,
    },
    [RESPONSE]: {
      studentUid: 'stu',
      status: 'joined',
      score: null,
      answers: [],
      ...overrides.response,
    },
    [ASSIGNMENT]: { teacherUid: 't1', ...overrides.assignment },
  };
  if (overrides.key !== null)
    docs[KEY] = overrides.key ?? { questions: KEY_QUESTIONS };
  return docs;
}

const flagOn = { isFlagOn: () => Promise.resolve(true) };
const call = (
  docs: Record<string, Doc>,
  input: Doc,
  opts: { now?: number; uid?: string | null; flag?: boolean } = {}
) =>
  handleCheckQuizGameAnswer(
    makeDb(docs),
    opts.uid === undefined ? 'stu' : opts.uid,
    { sessionId: 's1', ...input },
    opts.now ?? NOW,
    opts.flag === false ? { isFlagOn: () => Promise.resolve(false) } : flagOn
  );

const refusal = async (p: Promise<unknown>) => {
  const err = (await p.catch((e: unknown) => e)) as {
    code?: string;
    details?: { reason?: string };
  };
  return { code: err.code, reason: err.details?.reason };
};

describe('handleCheckQuizGameAnswer', () => {
  it('grades a right answer, records the first try and returns the key', async () => {
    const docs = world();
    const result = await call(docs, { questionId: 'q1', answer: 'paris' });
    expect(result).toEqual({
      isCorrect: true,
      points: 1,
      speedBonus: 0,
      streak: 1,
      totalPoints: 1,
      correctAnswer: 'Paris',
      firstTry: true,
    });
    const response = docs[RESPONSE];
    expect(response.status).toBe('in-progress');
    expect(response.lastWriteAt).toBe('SERVER_TS');
    expect(response.answers).toEqual([
      { questionId: 'q1', answer: 'paris', answeredAt: NOW, isCorrect: true },
    ]);
    expect(response.game).toMatchObject({
      points: 1,
      streak: 1,
      answered: 1,
      correct: 1,
      firstTry: { q1: true },
      lastCorrect: { q1: true },
    });
  });

  it('grades a wrong answer as zero and resets the streak', async () => {
    const docs = world({
      response: { game: { points: 3, streak: 2, answered: 2, correct: 2 } },
    });
    const result = await call(docs, { questionId: 'q1', answer: 'Rome' });
    expect(result).toMatchObject({
      isCorrect: false,
      points: 0,
      streak: 0,
      totalPoints: 3,
      correctAnswer: 'Paris',
    });
    expect(docs[RESPONSE].game).toMatchObject({
      firstTry: { q1: false },
      lastCorrect: { q1: false },
      correct: 2,
      answered: 3,
    });
  });

  it('gives partial credit points but counts the answer as missed and holds the streak', async () => {
    const docs = world({ response: { game: { streak: 2 } } });
    const result = await call(docs, {
      questionId: 'q2',
      answer: `red${FIB_BLANK_SEP}green`,
    });
    expect(result).toMatchObject({ isCorrect: false, points: 1, streak: 2 });
    expect(docs[RESPONSE].game).toMatchObject({
      firstTry: { q2: false },
      lastCorrect: { q2: false },
    });
  });

  it('adds the speed bonus and streak multiplier when the session has them', async () => {
    const docs = world({
      session: { speedBonusEnabled: true, streakBonusEnabled: true },
      response: {
        game: { points: 2, streak: 1, last: { questionId: 'q4' } },
      },
    });
    // 5 of 20 seconds used: 75% left → +38% speed, streak 2 → 1.5x.
    const result = await call(docs, {
      questionId: 'q1',
      answer: 'Paris',
      startedAt: NOW - 5_000,
    });
    expect(result).toMatchObject({
      speedBonus: 38,
      streak: 2,
      points: 2.07,
      totalPoints: 4.07,
    });
  });

  it('stretches the time limit by the student time multiplier', async () => {
    const docs = world({
      session: { speedBonusEnabled: true },
      assignment: { overridesByStudentUid: { stu: { timeMultiplier: 2 } } },
    });
    const result = await call(docs, {
      questionId: 'q1',
      answer: 'Paris',
      startedAt: NOW - 20_000,
    });
    expect(result.speedBonus).toBe(25);
  });

  it('refuses a question missing from the key', async () => {
    const docs = world();
    expect(
      await refusal(call(docs, { questionId: 'q9', answer: 'x' }))
    ).toEqual({ code: 'not-found', reason: undefined });
    expect(docs[RESPONSE].game).toBeUndefined();
  });

  it('refuses a question that needs a teacher grade', async () => {
    const docs = world();
    expect(
      (await refusal(call(docs, { questionId: 'q3', answer: 'x' }))).code
    ).toBe('failed-precondition');
  });

  it('refuses when the game has no key doc', async () => {
    const docs = world({ key: null });
    expect(
      (await refusal(call(docs, { questionId: 'q1', answer: 'Paris' }))).code
    ).toBe('failed-precondition');
  });

  it('refuses a late answer after the game clock ran out', async () => {
    const docs = world();
    const r = await refusal(
      call(docs, { questionId: 'q1', answer: 'Paris' }, { now: NOW + 63_000 })
    );
    expect(r).toEqual({
      code: 'failed-precondition',
      reason: GAME_REFUSAL.over,
    });
    expect(docs[RESPONSE].answers).toEqual([]);
  });

  it('refuses while the game is paused', async () => {
    const docs = world({ session: { gamePausedAt: NOW - 10_000 } });
    expect(
      await refusal(call(docs, { questionId: 'q1', answer: 'Paris' }))
    ).toEqual({ code: 'failed-precondition', reason: GAME_REFUSAL.paused });
  });

  it('refuses sessions that are not self-paced games', async () => {
    for (const sessionMode of ['student', 'teacher', 'auto', undefined]) {
      const docs = world({ session: { sessionMode } });
      expect(
        (await refusal(call(docs, { questionId: 'q1', answer: 'Paris' }))).code
      ).toBe('failed-precondition');
      expect(docs[RESPONSE].game).toBeUndefined();
    }
  });

  it('refuses when the teacher does not have the flag', async () => {
    const docs = world();
    expect(
      (
        await refusal(
          call(docs, { questionId: 'q1', answer: 'Paris' }, { flag: false })
        )
      ).code
    ).toBe('permission-denied');
    expect(docs[RESPONSE].game).toBeUndefined();
  });

  it('refuses callers who have not joined, and signed-out callers', async () => {
    const docs = world();
    expect(
      (
        await refusal(
          call(docs, { questionId: 'q1', answer: 'Paris' }, { uid: 'other' })
        )
      ).code
    ).toBe('permission-denied');
    expect(
      (
        await refusal(
          call(docs, { questionId: 'q1', answer: 'Paris' }, { uid: null })
        )
      ).code
    ).toBe('unauthenticated');
  });

  it('returns the first result for a retried call without scoring it again', async () => {
    const docs = world();
    await call(docs, { questionId: 'q1', answer: 'Paris' });
    const again = await call(docs, { questionId: 'q1', answer: 'Paris' });
    expect(again).toMatchObject({ points: 1, totalPoints: 1, firstTry: true });
    expect(docs[RESPONSE].game).toMatchObject({ points: 1, answered: 1 });
  });

  it('refuses the same question twice in a row with a new answer', async () => {
    const docs = world();
    await call(docs, { questionId: 'q1', answer: 'Rome' });
    expect(
      await refusal(call(docs, { questionId: 'q1', answer: 'Paris' }))
    ).toEqual({ code: 'failed-precondition', reason: GAME_REFUSAL.repeat });
  });

  it('scores a repeat in full but keeps the first try in answers', async () => {
    const docs = world();
    await call(docs, { questionId: 'q1', answer: 'Rome' });
    await call(docs, { questionId: 'q4', answer: 'Four' });
    const repeat = await call(docs, { questionId: 'q1', answer: 'Paris' });
    expect(repeat).toMatchObject({
      isCorrect: true,
      points: 1,
      firstTry: false,
    });
    expect(docs[RESPONSE].answers).toHaveLength(2);
    expect(docs[RESPONSE].game).toMatchObject({
      points: 2,
      firstTry: { q1: false, q4: true },
      lastCorrect: { q1: true, q4: true },
    });
  });

  it('refuses a question outside the student served draw', async () => {
    const docs = world({ response: { servedQuestionIds: ['q4'] } });
    expect(
      (await refusal(call(docs, { questionId: 'q1', answer: 'Paris' }))).code
    ).toBe('not-found');
  });
});

describe('gameClockRefusal', () => {
  it('needs a started clock, and allows the grace window', () => {
    expect(gameClockRefusal({}, NOW)).toBe(GAME_REFUSAL.notStarted);
    expect(gameClockRefusal({ gameEndsAt: NOW - 1_000 }, NOW)).toBeNull();
    expect(
      gameClockRefusal({ gameEndsAt: NOW + 1, gamePausedAt: NOW - 1_000 }, NOW)
    ).toBeNull();
    expect(
      gameClockRefusal({ gameEndsAt: NOW + 1, status: 'ended' }, NOW)
    ).toBe(GAME_REFUSAL.over);
    expect(
      gameClockRefusal({ gameEndsAt: { toMillis: () => NOW - 5_000 } }, NOW)
    ).toBe(GAME_REFUSAL.over);
  });
});

describe('speedBonusPct', () => {
  it('clamps the device start to the limit and to arrival', () => {
    expect(speedBonusPct(10, NOW + 5_000, NOW)).toBe(50);
    expect(speedBonusPct(10, NOW - 60_000, NOW)).toBe(0);
    expect(speedBonusPct(0, NOW, NOW)).toBe(0);
    expect(speedBonusPct(10, undefined, NOW)).toBe(0);
  });
});

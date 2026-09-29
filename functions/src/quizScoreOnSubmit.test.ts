import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
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

import { handleScoreQuizOnSubmit, scoreAttempt } from './quizScoreOnSubmit';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleScoreQuizOnSubmit>[0];

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

const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const KEY = 'users/t1/quiz_assignments/s1/key/answers';
const QUESTIONS = [
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
    points: 1,
    correctAnswer: 'blue',
    incorrectAnswers: [],
    alternateAnswers: ['azure'],
  },
];

function world(
  overrides: { session?: Doc; response?: Doc; key?: Doc | null } = {}
) {
  const docs: Record<string, Doc> = {
    [SESSION]: {
      teacherUid: 't1',
      assignmentId: 's1',
      showScoreOnSubmit: true,
      ...overrides.session,
    },
    [RESPONSE]: {
      studentUid: 'stu',
      status: 'completed',
      score: null,
      answers: [
        { questionId: 'q1', answer: 'Paris', answeredAt: 1 },
        { questionId: 'q2', answer: 'Azure', answeredAt: 2 },
      ],
      ...overrides.response,
    },
    'users/t1/quiz_assignments/s1': { teacherUid: 't1' },
  };
  if (overrides.key !== null)
    docs[KEY] = overrides.key ?? { questions: QUESTIONS };
  return docs;
}

describe('handleScoreQuizOnSubmit', () => {
  it('scores a completed attempt and marks each answer', async () => {
    const docs = world({
      response: {
        answers: [
          { questionId: 'q1', answer: 'Rome', answeredAt: 1 },
          { questionId: 'q2', answer: 'Azure', answeredAt: 2 },
        ],
      },
    });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: 50 });
    expect(docs[RESPONSE].score).toBe(50);
    expect(
      (docs[RESPONSE].answers as { isCorrect: boolean }[]).map(
        (a) => a.isCorrect
      )
    ).toEqual([false, true]);
  });

  it('does nothing when the setting is off', async () => {
    const docs = world({ session: { showScoreOnSubmit: false } });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: null });
    expect(docs[RESPONSE].score).toBeNull();
  });

  it('waits until the attempt is submitted', async () => {
    const docs = world({ response: { status: 'in-progress' } });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: null });
  });

  it('leaves a free-response quiz for the teacher', async () => {
    const docs = world({
      key: {
        questions: [
          ...QUESTIONS,
          {
            id: 'q3',
            type: 'free-response',
            points: 2,
            correctAnswer: '',
            incorrectAnswers: [],
          },
        ],
      },
    });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: null });
    expect(docs[RESPONSE].score).toBeNull();
  });

  it('returns null without a key doc', async () => {
    const docs = world({ key: null });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: null });
  });

  it('keeps an existing score', async () => {
    const docs = world({ response: { score: 80 } });
    await expect(
      handleScoreQuizOnSubmit(makeDb(docs), 'stu', { sessionId: 's1' })
    ).resolves.toEqual({ score: 80 });
  });

  it('rejects a caller with no response', async () => {
    await expect(
      handleScoreQuizOnSubmit(makeDb(world()), 'other', { sessionId: 's1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a signed-out caller', async () => {
    await expect(
      handleScoreQuizOnSubmit(makeDb(world()), null, { sessionId: 's1' })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('scoreAttempt', () => {
  const ctx = {
    questions: QUESTIONS.map((q) => ({
      id: q.id,
      text: '',
      type: q.type,
      points: q.points,
      choices: [],
      correctAnswer: q.correctAnswer,
      alternateAnswers: q.alternateAnswers,
      allowPartialCredit: false,
      rubricCriterionIds: [],
      targets: [],
      manual: false,
    })),
    sections: [],
    fibAnswersByQuestion: {},
  };

  it('counts an unanswered question against the total', () => {
    expect(
      scoreAttempt({ answers: [{ questionId: 'q1', answer: 'Paris' }] }, ctx)
        ?.score
    ).toBe(50);
  });

  it('scores only the served subset', () => {
    expect(
      scoreAttempt(
        {
          servedQuestionIds: ['q1'],
          answers: [{ questionId: 'q1', answer: 'Paris' }],
        },
        ctx
      )?.score
    ).toBe(100);
  });

  it('uses the latest take of a question', () => {
    expect(
      scoreAttempt(
        {
          answers: [
            { questionId: 'q1', answer: 'Rome', takeIndex: 0 },
            { questionId: 'q1', answer: 'Paris', takeIndex: 1 },
            { questionId: 'q2', answer: 'blue' },
          ],
        },
        ctx
      )?.score
    ).toBe(100);
  });

  it('accepts a translated FIB answer for the served locale', () => {
    expect(
      scoreAttempt(
        {
          answers: [
            { questionId: 'q1', answer: 'Paris' },
            { questionId: 'q2', answer: 'azul' },
          ],
        },
        { ...ctx, fibAnswersByQuestion: { q2: ['azul'] } }
      )?.score
    ).toBe(100);
  });
});

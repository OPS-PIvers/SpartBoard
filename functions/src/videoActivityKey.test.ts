import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
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
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  handleCheckVideoActivityAnswer,
  scrubVideoActivitySessionKey,
  stampRevealedVerdicts,
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
  const childDocs = (path: string) =>
    Object.entries(docs).filter(
      ([p]) =>
        p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
    );
  const querySnap = (matches: [string, Doc][]) => ({
    empty: matches.length === 0,
    docs: matches.map(([p, d]) => ({
      id: p.split('/').pop(),
      data: () => d,
      ref: docRef(p),
    })),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: () => Promise.resolve(querySnap(childDocs(path))),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () =>
          Promise.resolve(
            querySnap(childDocs(path).filter(([, d]) => d[field] === value))
          ),
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

describe('handleCheckVideoActivityAnswer with assign answer rules', () => {
  const RESPONSE = `${SESSION}/responses/pin-p1-01`;
  const setup = (sessionOptions: Doc, settings: Doc = {}) => {
    const docs: Record<string, Doc> = {
      [SESSION]: { teacherUid: 't1', questions: [], settings, sessionOptions },
      [KEY]: { questions: KEYED },
      [RESPONSE]: { studentUid: 'stu', answers: [], completedAt: null },
    };
    return { docs, db: makeDb(docs) };
  };

  it('ignores saved feedback values on sessions without the rules stamp', async () => {
    const { db } = setup({
      showResultToStudent: false,
      showCorrectAnswerToStudent: false,
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Rome'))
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('keeps the answer on the server when reveal is off, except for the teacher', async () => {
    const { docs, db } = setup({
      answerRulesSet: true,
      showCorrectAnswerToStudent: false,
    });
    docs[`${SESSION}/responses/sso`] = {
      studentUid: 'sso',
      answers: [],
      completedAt: null,
    };
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000)
    ).resolves.toEqual({ isCorrect: false, correctAnswer: '' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Rome'))
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('gives a PIN joiner no verdict and stores none while the key is hidden', async () => {
    const { docs, db } = setup({
      answerRulesSet: true,
      showCorrectAnswerToStudent: false,
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Paris'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q1', answer: 'Paris', answeredAt: 1000 },
    ]);
  });

  it('gives a view-only viewer no verdict while the key is hidden', async () => {
    const { docs, db } = setup({
      answerRulesSet: true,
      showCorrectAnswerToStudent: false,
    });
    docs[SESSION].mode = 'view-only';
    await expect(
      handleCheckVideoActivityAnswer(db, 'viewer', input('Paris'))
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });

  it('records the answer without a verdict when right and wrong is hidden, even in require-correct', async () => {
    const { docs, db } = setup(
      { answerRulesSet: true, showResultToStudent: false },
      { requireCorrectAnswer: true }
    );
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Rome'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q1', answer: 'Rome', answeredAt: 1000 },
    ]);
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Rome'))
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('hides right and wrong from view-only viewers too', async () => {
    const { docs, db } = setup({
      answerRulesSet: true,
      showResultToStudent: false,
    });
    docs[SESSION].mode = 'view-only';
    await expect(
      handleCheckVideoActivityAnswer(db, 'viewer', input('Paris'))
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });
});

describe('handleCheckVideoActivityAnswer in a teacher-paced session', () => {
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
  const RESPONSE = `${SESSION}/responses/pin-p1-01`;
  const setup = (live: Doc, answers: Doc[] = []) => {
    const docs: Record<string, Doc> = {
      [SESSION]: {
        teacherUid: 't1',
        questions: [],
        sessionMode: 'teacher',
        settings: { requireCorrectAnswer: false, allowSkipping: true },
        live,
      },
      [KEY]: { questions: TWO },
      [RESPONSE]: { studentUid: 'stu', answers, completedAt: null },
    };
    return { docs, db: makeDb(docs) };
  };
  const q2 = (answer: string) => ({
    sessionId: 's1',
    questionId: 'q2',
    answer,
  });

  it('records an answer to the open question, even out of order, with no verdict before the reveal', async () => {
    const { docs, db } = setup({
      currentQuestionId: 'q2',
      questionPhase: 'open',
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', q2('Blue'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q2', answer: 'Blue', answeredAt: 1000 },
    ]);
  });

  it('withholds the verdict from a signed-in student before the reveal too', async () => {
    const { docs, db } = setup({
      currentQuestionId: 'q2',
      questionPhase: 'open',
    });
    docs[`${SESSION}/responses/sso`] = {
      studentUid: 'sso',
      answers: [],
      completedAt: null,
    };
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', q2('blue'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(JSON.stringify(docs[`${SESSION}/responses/sso`])).not.toContain(
      'isCorrect'
    );
  });

  it('rejects a question that is not open with a question-closed reason', async () => {
    const cases: Doc[] = [
      { currentQuestionId: 'q2', questionPhase: 'closed' },
      { currentQuestionId: 'q1', questionPhase: 'open' },
      { currentQuestionId: null, questionPhase: 'closed' },
      { currentQuestionId: 'q2', questionPhase: 'open', answerRevealed: true },
    ];
    for (const live of cases) {
      const { docs, db } = setup(live);
      await expect(
        handleCheckVideoActivityAnswer(db, 'stu', q2('blue'), 1000)
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        details: { reason: 'question-closed' },
      });
      expect(docs[RESPONSE].answers).toEqual([]);
    }
  });

  it('keeps the first answer locked when a student answers again', async () => {
    const { docs, db } = setup({
      currentQuestionId: 'q2',
      questionPhase: 'open',
    });
    await handleCheckVideoActivityAnswer(db, 'stu', q2('red'), 1000);
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', q2('blue'), 2000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q2', answer: 'red', answeredAt: 1000 },
    ]);
  });

  it('lets the owning teacher check any question', async () => {
    const { db } = setup({ currentQuestionId: null, questionPhase: 'closed' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', q2('blue'))
    ).resolves.toMatchObject({ isCorrect: true });
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

  it('leaves a live session a pre-release tab creates until it ends, then scrubs it', async () => {
    const live = { teacherUid: 't1', status: 'active', questions: KEYED };
    const docs: Record<string, Doc> = { [SESSION]: { ...live } };
    await expect(
      scrubVideoActivitySessionKey(makeDb(docs), 's1', live)
    ).resolves.toBe('deferred');
    expect(docs[SESSION].questions).toEqual(KEYED);
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

describe('handleCheckVideoActivityAnswer for a short answer', () => {
  const RESPONSE = `${SESSION}/responses/pin-p1-01`;
  const SA = [
    ...KEYED,
    {
      id: 'sa',
      type: 'SA',
      text: 'Explain why.',
      timestamp: 20,
      correctAnswer: '',
      incorrectAnswers: [],
    },
    {
      id: 'q3',
      type: 'FIB',
      text: 'After?',
      timestamp: 40,
      correctAnswer: 'blue',
      incorrectAnswers: [],
    },
  ];
  const setup = (answers: Doc[] = []) => {
    const docs: Record<string, Doc> = {
      [SESSION]: {
        teacherUid: 't1',
        questions: [],
        settings: { requireCorrectAnswer: false },
      },
      [KEY]: { questions: SA },
      [RESPONSE]: { studentUid: 'stu', answers, completedAt: null },
    };
    return { docs, db: makeDb(docs) };
  };
  const saInput = (answer: string) => ({
    sessionId: 's1',
    questionId: 'sa',
    answer,
  });

  it('saves any text with no verdict and no key', async () => {
    const { docs, db } = setup([{ questionId: 'q1', answer: 'Paris' }]);
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', saInput('Because'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q1', answer: 'Paris' },
      { questionId: 'sa', answer: 'Because', answeredAt: 1000 },
    ]);
  });

  it('refuses a blank short answer', async () => {
    const { db } = setup([{ questionId: 'q1', answer: 'Paris' }]);
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', saInput('   '))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('counts an answered short answer for the questions after it', async () => {
    const { db } = setup([
      { questionId: 'q1', answer: 'Paris' },
      { questionId: 'sa', answer: 'Because' },
    ]);
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', {
        sessionId: 's1',
        questionId: 'q3',
        answer: 'blue',
      })
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('shows the teacher no key for it either', async () => {
    const { db } = setup();
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', saInput('x'))
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });
});

describe('handleCheckVideoActivityAnswer grades only what it recorded', () => {
  const RESPONSE = `${SESSION}/responses/sso`;
  const setup = (response: Doc = {}, settings: Doc = {}) => {
    const docs: Record<string, Doc> = {
      [SESSION]: {
        teacherUid: 't1',
        questions: [],
        settings: { requireCorrectAnswer: false, ...settings },
      },
      [KEY]: { questions: KEYED },
      [RESPONSE]: {
        studentUid: 'sso',
        answers: [],
        completedAt: null,
        ...response,
      },
    };
    return { docs, db: makeDb(docs) };
  };

  it('grades the recorded answer again, never the new text', async () => {
    const { db } = setup();
    await handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000);
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 2000)
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('gives no verdict for an entry the student wrote themselves', async () => {
    const { docs, db } = setup({
      answers: [{ questionId: 'q1', answer: 'Paris', answeredAt: 1 }],
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(docs[RESPONSE].answers).toHaveLength(1);
  });

  it('gives no verdict once a student entry is put ahead of the recorded one', async () => {
    const { docs, db } = setup();
    await handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000);
    const recorded = docs[RESPONSE].answers as Doc[];
    docs[RESPONSE].answers = [
      { questionId: 'q1', answer: 'Paris', answeredAt: 1000 },
      ...recorded,
    ];
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 2000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });

  it('records afresh on a retake instead of reusing the last attempt', async () => {
    const { docs, db } = setup();
    await handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000);
    Object.assign(docs[RESPONSE], { answers: [], completedAttempts: 1 });
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 2000)
    ).resolves.toEqual({ isCorrect: true, correctAnswer: 'Paris' });
    expect(docs[RESPONSE].answers).toEqual([
      { questionId: 'q1', answer: 'Paris', answeredAt: 2000, isCorrect: true },
    ]);
  });

  it('gives no verdict for a guess after the student finished', async () => {
    const done = setup({ completedAt: 5 });
    await expect(
      handleCheckVideoActivityAnswer(done.db, 'sso', input('Paris'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
    expect(done.docs[RESPONSE].answers).toEqual([]);
    const rc = setup({ completedAt: 5 }, { requireCorrectAnswer: true });
    await expect(
      handleCheckVideoActivityAnswer(rc.db, 'sso', input('Paris'), 1000)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });

  it('gives no verdict for a guess after the window closed', async () => {
    const { docs, db } = setup();
    docs[SESSION].closeAt = 0;
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 1e9)
    ).resolves.toEqual({ isCorrect: null, correctAnswer: '' });
  });

  it('still answers a finished student about the answer it recorded', async () => {
    const { docs, db } = setup();
    await handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000);
    docs[RESPONSE].completedAt = 3000;
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 4000)
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('keeps require-correct feedback for a student still answering', async () => {
    const { docs, db } = setup({}, { requireCorrectAnswer: true });
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Rome'), 1000)
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
    await expect(
      handleCheckVideoActivityAnswer(db, 'sso', input('Paris'), 2000)
    ).resolves.toEqual({ isCorrect: true, correctAnswer: 'Paris' });
    expect(docs[RESPONSE].answers).toEqual([]);
  });
});

describe('stampRevealedVerdicts', () => {
  const live = (over: Doc = {}) => ({
    teacherUid: 't1',
    sessionMode: 'teacher',
    questions: [],
    live: { currentQuestionId: 'q1', questionPhase: 'open', ...over },
  });
  const setup = () => {
    const docs: Record<string, Doc> = {
      [SESSION]: live({ answerRevealed: true }),
      [KEY]: { questions: KEYED },
      [`${SESSION}/responses/a`]: {
        studentUid: 'a',
        answers: [{ questionId: 'q1', answer: 'Paris', answeredAt: 1 }],
      },
      [`${SESSION}/responses/b`]: {
        studentUid: 'b',
        answers: [
          { questionId: 'q1', answer: 'Rome', answeredAt: 1, isCorrect: true },
        ],
      },
      [`${SESSION}/responses/c`]: { studentUid: 'c', answers: [] },
    };
    return { docs, db: makeDb(docs) };
  };

  it('stamps each answer to the revealed question with its real verdict', async () => {
    const { docs, db } = setup();
    await expect(
      stampRevealedVerdicts(db, 's1', live({ answerRevealed: true }), live())
    ).resolves.toBe(2);
    expect(docs[`${SESSION}/responses/a`].answers).toEqual([
      { questionId: 'q1', answer: 'Paris', answeredAt: 1, isCorrect: true },
    ]);
    expect(docs[`${SESSION}/responses/b`].answers).toEqual([
      { questionId: 'q1', answer: 'Rome', answeredAt: 1, isCorrect: false },
    ]);
    expect(docs[`${SESSION}/responses/c`].answers).toEqual([]);
  });

  it('does nothing before the reveal, on a repeat write, or off a live run', async () => {
    const { docs, db } = setup();
    const revealed = live({ answerRevealed: true });
    await expect(stampRevealedVerdicts(db, 's1', live(), null)).resolves.toBe(
      0
    );
    await expect(
      stampRevealedVerdicts(db, 's1', revealed, revealed)
    ).resolves.toBe(0);
    await expect(
      stampRevealedVerdicts(db, 's1', { ...revealed, sessionMode: 'student' })
    ).resolves.toBe(0);
    expect(JSON.stringify(docs[`${SESSION}/responses/a`])).not.toContain(
      'isCorrect'
    );
  });
});

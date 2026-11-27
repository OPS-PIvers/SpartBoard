import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  QuizAssignment,
  QuizData,
  QuizPublicQuestion,
  Rubric,
} from '@/types';
import {
  computeAssessmentAggregate,
  resolveGroupQuestions,
} from '@/functions/src/plcAssessmentMath';
import { keyQuestions } from '@/functions/src/gradebook/gradeRowMath';

const { store, failRefreshFor, FakeFieldPath, applyUpdate } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  // A session id here makes its first transaction (the served-question refresh) fail.
  const failRefreshFor = new Set<string>();

  class FakeFieldPath {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  }

  const setPath = (
    target: Record<string, unknown>,
    segments: string[],
    value: unknown
  ) => {
    let at = target;
    for (const s of segments.slice(0, -1)) {
      at[s] = { ...(at[s] ?? {}) };
      at = at[s] as Record<string, unknown>;
    }
    at[segments[segments.length - 1]] = value;
  };

  const applyUpdate = (path: string, args: unknown[]) => {
    const next = { ...(store.get(path) ?? {}) };
    const pairs: Array<[string[], unknown]> = [];
    if (args.length === 1) {
      for (const [k, v] of Object.entries(args[0] as Record<string, unknown>))
        pairs.push([k.split('.'), v]);
    } else {
      for (let i = 0; i < args.length; i += 2) {
        const f = args[i];
        pairs.push([
          f instanceof FakeFieldPath ? f.segments : String(f).split('.'),
          args[i + 1],
        ]);
      }
    }
    for (const [segments, value] of pairs) setPath(next, segments, value);
    store.set(path, next);
  };

  return { store, failRefreshFor, FakeFieldPath, applyUpdate };
});

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  const ref = (base: unknown, ...segments: string[]) => ({
    path: [
      ...(typeof base === 'object' && base && 'path' in base
        ? [(base as { path: string }).path]
        : []),
      ...segments,
    ].join('/'),
  });
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    ref: { path },
    exists: () => store.has(path),
    data: () => store.get(path),
  });
  return {
    ...actual,
    doc: ref,
    collection: ref,
    FieldPath: FakeFieldPath,
    getDoc: (r: { path: string }) => Promise.resolve(snap(r.path)),
    getDocs: (c: { path: string }) =>
      Promise.resolve({
        docs: [...store.keys()]
          .filter(
            (p) =>
              p.startsWith(`${c.path}/`) &&
              !p.slice(c.path.length + 1).includes('/')
          )
          .map(snap),
      }),
    runTransaction: async (
      _db: unknown,
      fn: (tx: unknown) => Promise<void>
    ) => {
      const pending: Array<[string, unknown[]]> = [];
      const reads: string[] = [];
      await fn({
        get: (r: { path: string }) => {
          reads.push(r.path);
          return Promise.resolve(snap(r.path));
        },
        update: (r: { path: string }, ...args: unknown[]) =>
          pending.push([r.path, args]),
      });
      const session = reads[0]?.match(/^quiz_sessions\/([^/]+)$/)?.[1];
      if (session && failRefreshFor.has(session)) throw new Error('offline');
      for (const [path, args] of pending) applyUpdate(path, args);
    },
  };
});

import {
  applyRubricEditToPublicQuestions,
  refreshAssignmentRubric,
  refreshRubricForSession,
  refreshRubricPeers,
} from '@/hooks/quizRubricRefresh';
import {
  applyRubricEdit,
  RubricSavedError,
  saveRubricThenRescore,
} from '@/utils/rubricPoints';

const rubric = (top: number, examples = false): Rubric => ({
  id: 'r1',
  title: 'Essay',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Claim',
      ...(examples ? { guide: { examples: ['secret'] } } : {}),
      levels: [
        { id: 'l1', label: 'Low', points: 1 },
        { id: 'l2', label: 'High', points: top },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [{ id: 'l3', label: 'Full', points: 2 }],
    },
  ],
});

const served = (): QuizPublicQuestion[] =>
  [
    {
      id: 'w1',
      type: 'free-response',
      text: 'Explain.',
      timeLimit: 0,
      points: 4,
      rubricSnapshot: rubric(2),
      rubricHidden: true,
      localized: { es: { text: 'Explica.', rubricSnapshot: rubric(2) } },
    },
    { id: 'm1', type: 'MC', text: 'Pick', timeLimit: 0, choices: ['a', 'b'] },
  ] as unknown as QuizPublicQuestion[];

const quizWith = (): QuizData =>
  ({
    id: 'quiz1',
    title: 'Essay quiz',
    createdAt: 0,
    updatedAt: 0,
    questions: [
      {
        id: 'w1',
        type: 'free-response',
        text: 'Explain.',
        timeLimit: 0,
        correctAnswer: '',
        incorrectAnswers: [],
        points: 4,
        rubricId: 'r1',
        rubricSnapshot: rubric(2),
      },
      {
        id: 'm1',
        type: 'MC',
        text: 'Pick',
        timeLimit: 0,
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
      },
    ],
  }) as unknown as QuizData;

const edited = (top: number): QuizData => {
  const q = quizWith();
  return {
    ...q,
    questions: applyRubricEdit(q.questions, rubric(top)).questions,
  };
};

const KEY = (a: string) => `users/t1/quiz_assignments/${a}/key/answers`;

// Both top levels picked on the old 4-point rubric; with the MC point the score is 5/5.
const seedSession = (id: string, extra: Record<string, unknown> = {}) => {
  store.set(`quiz_sessions/${id}`, {
    teacherUid: 't1',
    assignmentId: id,
    publicQuestions: served(),
    ...extra,
  });
  store.set(`users/t1/quiz_assignments/${id}`, {});
  store.set(KEY(id), {
    questions: [
      { id: 'w1', type: 'free-response', points: 4, correctAnswer: '' },
      {
        id: 'm1',
        type: 'MC',
        points: 1,
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
      },
    ],
  });
  store.set(`quiz_sessions/${id}/responses/s1`, {
    studentUid: 's1',
    status: 'completed',
    answers: [
      { questionId: 'w1', answer: 'Because', answeredAt: 1 },
      { questionId: 'm1', answer: 'a', answeredAt: 1 },
    ],
    score: 100,
    scorePoints: { earned: 5, possible: 5, attempt: 1 },
    grading: {
      w1: {
        pointsAwarded: 4,
        rubricScores: [
          { criterionId: 'c1', levelId: 'l2', points: 2 },
          { criterionId: 'c2', levelId: 'l3', points: 2 },
        ],
      },
    },
  });
};

const response = (id: string) =>
  store.get(`quiz_sessions/${id}/responses/s1`) as {
    score: number;
    scorePoints: { earned: number; possible: number };
    grading: { w1: { pointsAwarded: number } };
  };

beforeEach(() => {
  store.clear();
  failRefreshFor.clear();
});

describe('applyRubricEditToPublicQuestions', () => {
  it('moves a served question to the new total without leaking examples', () => {
    const { questions, repointedIds } = applyRubricEditToPublicQuestions(
      served(),
      rubric(5, true)
    );
    expect(repointedIds).toEqual(['w1']);
    expect(questions[0].points).toBe(7);
    expect(JSON.stringify(questions[0].rubricSnapshot)).not.toContain('secret');
  });

  it('gives a translated rubric the new level points and keeps its wording', () => {
    const { questions } = applyRubricEditToPublicQuestions(served(), rubric(5));
    const es = questions[0].localized?.es;
    expect(es?.text).toBe('Explica.');
    expect(es?.rubricSnapshot?.criteria[0].levels[1].points).toBe(5);
  });

  it('leaves questions without the rubric untouched', () => {
    const input = served();
    const { questions } = applyRubricEditToPublicQuestions(input, rubric(5));
    expect(questions[1]).toBe(input[1]);
  });
});

describe('refreshAssignmentRubric', () => {
  it('updates the session publicQuestions and the server key points', async () => {
    seedSession('a1');
    await refreshAssignmentRubric({ sessionId: 'a1', rubric: rubric(5) });
    const session = store.get('quiz_sessions/a1');
    expect((session?.publicQuestions as QuizPublicQuestion[])[0].points).toBe(
      7
    );
    expect(typeof session?.rubricRefreshedAt).toBe('number');
    expect(store.get(KEY('a1'))?.questions).toEqual([
      { id: 'w1', type: 'free-response', points: 7, correctAnswer: '' },
      {
        id: 'm1',
        type: 'MC',
        points: 1,
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
      },
    ]);
  });

  it('writes the content doc of a per-period session and touches the session doc', async () => {
    store.set('quiz_sessions/a1', {
      teacherUid: 't1',
      questionsInContent: true,
      publicQuestions: [],
    });
    store.set('quiz_sessions/a1/content/questions', {
      publicQuestions: served(),
    });
    await refreshAssignmentRubric({ sessionId: 'a1', rubric: rubric(3) });
    const content = store.get('quiz_sessions/a1/content/questions');
    expect((content?.publicQuestions as QuizPublicQuestion[])[0].points).toBe(
      5
    );
    expect(store.get('quiz_sessions/a1')?.publicQuestions).toEqual([]);
    expect(typeof store.get('quiz_sessions/a1')?.rubricRefreshedAt).toBe(
      'number'
    );
  });

  it('writes nothing when no served question carries the rubric', async () => {
    store.set('quiz_sessions/a1', {
      teacherUid: 't1',
      publicQuestions: [served()[1]],
    });
    await refreshAssignmentRubric({ sessionId: 'a1', rubric: rubric(5) });
    expect(store.get('quiz_sessions/a1')?.rubricRefreshedAt).toBeUndefined();
  });
});

describe('refreshRubricForSession', () => {
  it('rescores level grades and the published score against the new total', async () => {
    seedSession('a1');
    await refreshRubricForSession({
      sessionId: 'a1',
      rubric: rubric(5),
      before: rubric(2),
      quiz: edited(5),
    });
    expect(response('a1').grading.w1.pointsAwarded).toBe(7);
    expect(response('a1').scorePoints).toMatchObject({
      earned: 8,
      possible: 8,
    });
    expect(response('a1').score).toBe(100);
  });

  it('still rescores when the served-question refresh fails, then reports it', async () => {
    seedSession('a1');
    failRefreshFor.add('a1');
    await expect(
      refreshRubricForSession({
        sessionId: 'a1',
        rubric: rubric(5),
        before: rubric(2),
        quiz: edited(5),
      })
    ).rejects.toThrow('offline');
    expect(response('a1').grading.w1.pointsAwarded).toBe(7);
  });

  it('feeds PLC and gradebook scoring the refreshed points', async () => {
    seedSession('a1');
    await refreshRubricForSession({
      sessionId: 'a1',
      rubric: rubric(5),
      before: rubric(2),
      quiz: edited(5),
    });
    const session = store.get('quiz_sessions/a1') as {
      publicQuestions: unknown[];
    };
    const key = store.get(KEY('a1'))?.questions as unknown[];
    const groupQuestions = resolveGroupQuestions(
      null,
      session.publicQuestions,
      [],
      key
    );
    expect(groupQuestions.find((q) => q.id === 'w1')?.points).toBe(7);
    expect(keyQuestions(key, [], session.publicQuestions)[0].points).toBe(7);
    const agg = computeAssessmentAggregate({
      assessmentId: 'p1',
      title: 'Unit',
      kind: 'quiz',
      groupQuestions,
      sessions: [
        {
          id: 'a1',
          teacherUid: 't1',
          teacherName: 'T',
          publicQuestions: session.publicQuestions,
          scorePublishedAt: null,
          responses: [
            {
              studentUid: 's1',
              answers: [{ questionId: 'w1', answer: 'Because', answeredAt: 1 }],
              score: null,
              manualGrades: {
                w1: { pointsAwarded: 7, scoredCriterionIds: ['c1', 'c2'] },
              },
            },
          ],
        },
      ],
    });
    expect(agg.perQuestion.find((q) => q.questionId === 'w1')).toMatchObject({
      pointsEarned: 7,
      pointsPossible: 7,
    });
  });
});

describe('refreshRubricPeers', () => {
  const assignment = (id: string, extra: Partial<QuizAssignment> = {}) =>
    ({
      id,
      quizId: 'quiz1',
      teacherUid: 't1',
      status: 'active',
      ...extra,
    }) as QuizAssignment;

  it('refreshes every other unfrozen assignment of the quiz, ended ones included', async () => {
    for (const id of [
      'active',
      'p2',
      'paused',
      'ended',
      'frozen',
      'drawn',
      'other',
    ])
      seedSession(id);
    const ok = await refreshRubricPeers(
      [
        assignment('active'),
        assignment('p2'),
        assignment('paused', { status: 'paused' }),
        assignment('ended', { status: 'inactive' }),
        assignment('frozen', { frozenDriveFileId: 'f1' }),
        assignment('drawn', { resolvedDriveFileId: 'd1' }),
        assignment('other', { quizId: 'quiz2' }),
      ],
      {
        quizId: 'quiz1',
        activeAssignmentId: 'active',
        teacherUid: 't1',
        rubric: rubric(5),
        before: rubric(2),
        quiz: edited(5),
      }
    );
    expect(ok).toBe(true);
    const points = (id: string) =>
      (
        store.get(`quiz_sessions/${id}`)
          ?.publicQuestions as QuizPublicQuestion[]
      )[0].points;
    expect(points('p2')).toBe(7);
    expect(points('paused')).toBe(7);
    expect(points('ended')).toBe(7);
    expect(response('ended').scorePoints.possible).toBe(8);
    expect(response('p2').scorePoints.possible).toBe(8);
    for (const id of ['active', 'frozen', 'drawn', 'other']) {
      expect(points(id)).toBe(4);
      expect(response(id).grading.w1.pointsAwarded).toBe(4);
    }
  });

  it('reports a failed peer without stopping the others', async () => {
    seedSession('p2');
    seedSession('p3');
    failRefreshFor.add('p2');
    const ok = await refreshRubricPeers([assignment('p2'), assignment('p3')], {
      quizId: 'quiz1',
      teacherUid: 't1',
      rubric: rubric(5),
      before: rubric(2),
      quiz: edited(5),
    });
    expect(ok).toBe(false);
    expect(response('p2').grading.w1.pointsAwarded).toBe(7);
    expect(response('p3').scorePoints.possible).toBe(8);
  });
});

describe('saveRubricThenRescore', () => {
  it('rescores after a save that partly failed, then surfaces the failure', async () => {
    const rescore = vi.fn(() => Promise.resolve());
    await expect(
      saveRubricThenRescore(
        () => Promise.reject(new RubricSavedError('scores')),
        rescore
      )
    ).rejects.toThrow('scores');
    expect(rescore).toHaveBeenCalledOnce();
  });
});

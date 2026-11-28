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
      if (reads[0] && failRefreshFor.has(reads[0])) throw new Error('offline');
      for (const [path, args] of pending) applyUpdate(path, args);
    },
  };
});

import {
  applyRubricEditToPublicQuestions,
  refreshAssignmentRubric,
  refreshRubricForSession,
  refreshRubricPeers,
  writeRubricToFrozenCopy,
} from '@/hooks/quizRubricRefresh';
import {
  keyFixOptionsFor,
  loadAssignmentAnswerKeyQuiz,
} from '@/utils/quizAssignBankDraw';
import { mergeScoreOnSubmitKey } from '@/utils/quizScoreOnSubmit';
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

const points = (id: string) =>
  (store.get(`quiz_sessions/${id}`)?.publicQuestions as QuizPublicQuestion[])[0]
    .points;

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

  it('rescores the other responses when one fails, and a retry repairs it', async () => {
    seedSession('a1');
    store.set('quiz_sessions/a1/responses/s2', {
      ...store.get('quiz_sessions/a1/responses/s1'),
      studentUid: 's2',
    });
    failRefreshFor.add('quiz_sessions/a1/responses/s1');
    const run = () =>
      refreshRubricForSession({
        sessionId: 'a1',
        rubric: rubric(5),
        before: rubric(2),
        quiz: edited(5),
      });
    await expect(run()).rejects.toThrow('offline');
    const s2 = store.get('quiz_sessions/a1/responses/s2') as ReturnType<
      typeof response
    >;
    expect(s2.grading.w1.pointsAwarded).toBe(7);
    expect(points('a1')).toBe(4);
    failRefreshFor.clear();
    await run();
    expect(response('a1').grading.w1.pointsAwarded).toBe(7);
    // Already rescored on the first pass, so the retry leaves it alone.
    expect(
      (
        store.get('quiz_sessions/a1/responses/s2') as ReturnType<
          typeof response
        >
      ).grading.w1.pointsAwarded
    ).toBe(7);
    expect(points('a1')).toBe(7);
  });

  it('rescores a response an earlier partly failed edit already moved when the next edit lands', async () => {
    seedSession('a1');
    store.set('quiz_sessions/a1/responses/s2', {
      ...store.get('quiz_sessions/a1/responses/s1'),
      studentUid: 's2',
    });
    failRefreshFor.add('quiz_sessions/a1/responses/s1');
    await expect(
      refreshRubricForSession({
        sessionId: 'a1',
        rubric: rubric(5),
        before: rubric(2),
        quiz: edited(5),
      })
    ).rejects.toThrow('offline');
    failRefreshFor.clear();
    // The library already holds the first edit, so the second edit's before is it.
    await refreshRubricForSession({
      sessionId: 'a1',
      rubric: rubric(3),
      before: rubric(5),
      quiz: edited(3),
    });
    for (const id of ['s1', 's2']) {
      const r = store.get(`quiz_sessions/a1/responses/${id}`) as ReturnType<
        typeof response
      >;
      expect(r.grading.w1.pointsAwarded).toBe(5);
      expect(r.scorePoints).toMatchObject({ earned: 6, possible: 6 });
    }
    expect(points('a1')).toBe(5);
  });

  const rescore = (r: Rubric = rubric(5)) =>
    refreshRubricForSession({
      sessionId: 'a1',
      rubric: r,
      before: rubric(2),
      quiz: edited(5),
    });
  const setResponse = (patch: Record<string, unknown>) =>
    store.set('quiz_sessions/a1/responses/s1', {
      ...store.get('quiz_sessions/a1/responses/s1'),
      ...patch,
    });

  it('leaves a typed score alone and flips a shown full-marks verdict', async () => {
    seedSession('a1');
    setResponse({
      grading: { w1: { pointsAwarded: 4 } },
      answers: [
        { questionId: 'w1', answer: 'Because', answeredAt: 1, isCorrect: true },
        { questionId: 'm1', answer: 'a', answeredAt: 1, isCorrect: true },
      ],
    });
    await rescore();
    const r = store.get('quiz_sessions/a1/responses/s1') as {
      grading: { w1: { pointsAwarded: number } };
      scorePoints: { earned: number; possible: number };
      answers: Array<{ isCorrect?: boolean }>;
    };
    expect(r.grading.w1.pointsAwarded).toBe(4);
    expect(r.scorePoints).toMatchObject({ earned: 5, possible: 8 });
    expect(r.answers.map((a) => a.isCorrect)).toEqual([false, true]);
  });

  it('keeps the saved score while a rubric grade is still pending', async () => {
    seedSession('a1');
    setResponse({
      grading: {
        w1: {
          pointsAwarded: 2,
          rubricScores: [{ criterionId: 'c1', levelId: 'l2', points: 2 }],
        },
      },
    });
    await rescore();
    expect(response('a1').grading.w1.pointsAwarded).toBe(5);
    expect(response('a1').score).toBe(100);
    expect(response('a1').scorePoints.possible).toBe(5);
  });

  it('leaves a response with no score unscored', async () => {
    seedSession('a1');
    setResponse({ score: undefined, scorePoints: undefined });
    await rescore();
    expect(response('a1').grading.w1.pointsAwarded).toBe(7);
    expect(response('a1').score).toBeUndefined();
    expect(response('a1').scorePoints).toBeUndefined();
  });

  it('refreshes from what the session serves when the loaded quiz already holds the edit', async () => {
    seedSession('a1');
    // A reload after the frozen copy saved but the rest did not: the loaded quiz is already at 7.
    await refreshRubricForSession({
      sessionId: 'a1',
      rubric: rubric(5),
      before: rubric(5),
      quiz: edited(5),
    });
    expect(points('a1')).toBe(7);
    expect(response('a1').grading.w1.pointsAwarded).toBe(7);
    expect(response('a1').scorePoints.possible).toBe(8);
  });

  it('writes nothing once the session already serves the new points', async () => {
    seedSession('a1');
    await rescore();
    const after = JSON.stringify([...store.entries()]);
    await rescore();
    expect(JSON.stringify([...store.entries()])).toBe(after);
  });

  it('writes nothing for a label-only edit', async () => {
    seedSession('a1');
    const relabeled = rubric(2);
    relabeled.criteria[0].levels[1].label = 'Strong';
    const before = JSON.stringify([...store.entries()]);
    await rescore(relabeled);
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });

  it('gives PLC the refreshed published score ahead of its own math', async () => {
    seedSession('a1');
    setResponse({ grading: { w1: { pointsAwarded: 4 } } });
    await rescore();
    const session = store.get('quiz_sessions/a1') as {
      publicQuestions: unknown[];
    };
    const key = store.get(KEY('a1'))?.questions as unknown[];
    const agg = computeAssessmentAggregate({
      assessmentId: 'p1',
      title: 'Unit',
      kind: 'quiz',
      groupQuestions: resolveGroupQuestions(
        null,
        session.publicQuestions,
        [],
        key
      ),
      sessions: [
        {
          id: 'a1',
          teacherUid: 't1',
          teacherName: 'T',
          publicQuestions: session.publicQuestions,
          scorePublishedAt: 1,
          responses: [
            {
              studentUid: 's1',
              answers: [{ questionId: 'w1', answer: 'Because', answeredAt: 1 }],
              score: response('a1').score,
            },
          ],
        },
      ],
    });
    // 5 of 8 after the edit, not the 100 saved before it.
    expect(response('a1').score).toBe(63);
    expect(agg.teamAveragePercent).toBe(63);
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

const drive = new Map<string, QuizData>();
const frozenCopies = {
  load: (id: string) =>
    Promise.resolve(structuredClone(drive.get(id) as QuizData)),
  save: vi.fn((quiz: QuizData, id: string) => {
    drive.set(id, quiz);
    return Promise.resolve(id);
  }),
};
const drawnCopy = (ids: string[]): QuizData => ({
  ...quizWith(),
  questions: quizWith().questions.filter((q) => ids.includes(q.id)),
});

describe('writeRubricToFrozenCopy', () => {
  beforeEach(() => {
    drive.clear();
    frozenCopies.save.mockClear();
  });

  it('keeps the new total on reload and the next publish, and no other library edit', async () => {
    const frozen = quizWith();
    drive.set('frozen', frozen);
    // The library also rewords the MC question; the frozen copy must not pick that up.
    const library = edited(5);
    library.questions[1] = { ...library.questions[1], text: 'Reworded' };
    drive.set('library', library);
    expect(
      await writeRubricToFrozenCopy('frozen', rubric(5), frozenCopies)
    ).toBe(true);
    const deps = {
      loadQuizData: (id: string) => Promise.resolve(drive.get(id) as QuizData),
      loadBankContentsForQuiz: () => Promise.resolve(new Map()),
    };
    const reloaded = await loadAssignmentAnswerKeyQuiz(
      'library',
      'frozen',
      deps,
      keyFixOptionsFor({ frozenDriveFileId: 'frozen' })
    );
    expect(reloaded.questions[0].points).toBe(7);
    expect(reloaded.questions[0].rubricSnapshot).toEqual(rubric(5));
    expect(reloaded.questions[1].text).toBe('Pick');
    const nextPublishKey = mergeScoreOnSubmitKey(
      [{ id: 'w1', type: 'free-response', points: 4, correctAnswer: '' }],
      reloaded.questions
    ) as Array<{ points: number }>;
    expect(nextPublishKey[0].points).toBe(7);
  });

  it('throws when the copy could not be patched in place, so nothing runs ahead of it', async () => {
    drive.set('frozen', quizWith());
    await expect(
      writeRubricToFrozenCopy('frozen', rubric(5), {
        ...frozenCopies,
        save: () => Promise.reject(new Error('403')),
      })
    ).rejects.toThrow();
    await expect(
      writeRubricToFrozenCopy('frozen', rubric(5), {
        ...frozenCopies,
        save: () => Promise.resolve('a-new-file'),
      })
    ).rejects.toThrow();
  });

  it('writes a label-only edit into the copy once', async () => {
    drive.set('frozen', quizWith());
    const relabeled = rubric(2);
    relabeled.criteria[0].levels[1].label = 'Strong';
    await writeRubricToFrozenCopy('frozen', relabeled, frozenCopies);
    expect(frozenCopies.save).toHaveBeenCalledOnce();
    expect(
      drive.get('frozen')?.questions[0].rubricSnapshot?.criteria[0].levels[1]
        .label
    ).toBe('Strong');
  });

  it('leaves a copy without the question alone', async () => {
    drive.set('drawn', drawnCopy(['m1']));
    expect(
      await writeRubricToFrozenCopy('drawn', rubric(5), frozenCopies)
    ).toBe(false);
    expect(frozenCopies.save).not.toHaveBeenCalled();
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
  const run = (
    assignments: QuizAssignment[],
    extra: { rubric?: Rubric; activeAssignmentId?: string } = {}
  ) =>
    refreshRubricPeers(assignments, {
      quizId: 'quiz1',
      libraryDriveFileId: 'library',
      teacherUid: 't1',
      rubric: rubric(5),
      before: rubric(2),
      frozenCopies,
      // Mirrors loadAnswerKeyQuiz: a frozen assignment grades against its copy.
      loadGradingQuiz: (a) =>
        Promise.resolve(
          a.resolvedDriveFileId || a.frozenDriveFileId
            ? (drive.get(
                (a.resolvedDriveFileId ?? a.frozenDriveFileId) as string
              ) as QuizData)
            : edited(5)
        ),
      ...extra,
    });
  beforeEach(() => {
    drive.clear();
    frozenCopies.save.mockClear();
    drive.set('library', edited(5));
  });

  it('refreshes every other assignment of the quiz: live, ended and frozen', async () => {
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
    drive.set('f1', quizWith());
    drive.set('d1', quizWith());
    const ok = await run(
      [
        assignment('active'),
        assignment('p2'),
        assignment('paused', { status: 'paused' }),
        assignment('ended', { status: 'inactive' }),
        assignment('frozen', { frozenDriveFileId: 'f1' }),
        assignment('drawn', { resolvedDriveFileId: 'd1' }),
        assignment('other', { quizId: 'quiz2' }),
      ],
      { activeAssignmentId: 'active' }
    );
    expect(ok).toBe(true);
    for (const id of ['p2', 'paused', 'ended', 'frozen', 'drawn']) {
      expect(points(id)).toBe(7);
      expect(response(id).scorePoints.possible).toBe(8);
    }
    expect(drive.get('f1')?.questions[0].points).toBe(7);
    expect(drive.get('d1')?.questions[0].points).toBe(7);
    for (const id of ['active', 'other']) {
      expect(points(id)).toBe(4);
      expect(response(id).grading.w1.pointsAwarded).toBe(4);
    }
  });

  it('skips a bank draw that never dealt the question', async () => {
    seedSession('drawn');
    drive.set('d1', drawnCopy(['m1']));
    expect(
      await run([assignment('drawn', { resolvedDriveFileId: 'd1' })])
    ).toBe(true);
    expect(points('drawn')).toBe(4);
    expect(frozenCopies.save).not.toHaveBeenCalled();
  });

  it('leaves the frozen copy of a peer whose session was deleted alone', async () => {
    drive.set('f1', quizWith());
    expect(await run([assignment('gone', { frozenDriveFileId: 'f1' })])).toBe(
      true
    );
    expect(frozenCopies.save).not.toHaveBeenCalled();
    expect(drive.get('f1')?.questions[0].points).toBe(4);
  });

  it('does nothing for a label-only edit', async () => {
    seedSession('p2');
    drive.set('f1', quizWith());
    const relabeled = rubric(2);
    relabeled.criteria[0].levels[1].label = 'Strong';
    const before = JSON.stringify([...store.entries()]);
    expect(
      await run(
        [assignment('p2'), assignment('frozen', { frozenDriveFileId: 'f1' })],
        { rubric: relabeled }
      )
    ).toBe(true);
    expect(JSON.stringify([...store.entries()])).toBe(before);
    expect(frozenCopies.save).not.toHaveBeenCalled();
  });

  it('skips the Firestore refresh of a frozen peer whose copy did not save', async () => {
    seedSession('frozen');
    drive.set('f1', quizWith());
    const ok = await refreshRubricPeers(
      [assignment('frozen', { frozenDriveFileId: 'f1' })],
      {
        quizId: 'quiz1',
        libraryDriveFileId: 'library',
        teacherUid: 't1',
        rubric: rubric(5),
        before: rubric(2),
        frozenCopies: { ...frozenCopies, save: () => Promise.resolve('other') },
        loadGradingQuiz: () => Promise.resolve(edited(5)),
      }
    );
    expect(ok).toBe(false);
    expect(points('frozen')).toBe(4);
    expect(response('frozen').grading.w1.pointsAwarded).toBe(4);
    expect(
      store.get('quiz_sessions/frozen')?.rubricRefreshedAt
    ).toBeUndefined();
  });

  it('repairs a peer that failed once when the edit is saved again', async () => {
    seedSession('p2');
    failRefreshFor.add('p2');
    expect(await run([assignment('p2')])).toBe(false);
    expect(points('p2')).toBe(4);
    failRefreshFor.clear();
    // The library already holds the edit, so the second save's before is the new rubric.
    expect(
      await refreshRubricPeers([assignment('p2')], {
        quizId: 'quiz1',
        libraryDriveFileId: 'library',
        teacherUid: 't1',
        rubric: rubric(5),
        before: rubric(5),
        frozenCopies,
        loadGradingQuiz: () => Promise.resolve(edited(5)),
      })
    ).toBe(true);
    expect(points('p2')).toBe(7);
    expect(response('p2').grading.w1.pointsAwarded).toBe(7);
    expect(response('p2').scorePoints.possible).toBe(8);
  });

  it('reports a failed peer without stopping the others', async () => {
    seedSession('p2');
    seedSession('p3');
    failRefreshFor.add('p2');
    expect(await run([assignment('p2'), assignment('p3')])).toBe(false);
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

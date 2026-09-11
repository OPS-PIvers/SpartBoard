import { describe, it, expect } from 'vitest';
import {
  ALIGNMENT_WARNING,
  alignSessionQuestions,
  computeAssessmentAggregate,
  resolveGroupQuestions,
  selectRepresentativeAnswers,
  type CompletedResponse,
  type GroupQuestion,
  type RawAnswer,
  type SessionInput,
} from './plcAssessmentMath';

const publicQuestions = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital of MN?',
    choices: ['Duluth', 'St. Paul', 'Rochester'],
  },
  { id: 'q2', type: 'FIB', text: 'Two plus two?' },
  { id: 'q3', type: 'free-response', text: 'Explain.' },
];

const standard = {
  id: 'mn-ss-2021:6.2.1.1',
  kind: 'standard' as const,
  code: '6.2.1.1',
  label: 'Evaluate evidence from historical sources.',
};
const sourceTarget = {
  id: 'target-sources',
  kind: 'plc' as const,
  ownerId: 'plc-1',
  label: 'Use evidence from sources',
  standardIds: [standard.id],
};
const contextTarget = {
  id: 'target-context',
  kind: 'personal' as const,
  label: 'Explain historical context',
  standardIds: [standard.id],
};

const syncedQuestions = {
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Capital of MN?',
      correctAnswer: 'St. Paul',
      incorrectAnswers: ['Duluth', 'Rochester'],
      points: 2,
      targets: [sourceTarget, standard],
    },
    {
      id: 'q2',
      type: 'FIB',
      text: 'Two plus two?',
      correctAnswer: '4',
      targets: [contextTarget],
    },
    { id: 'q3', type: 'free-response', text: 'Explain.', points: 5 },
  ],
};

function answer(
  questionId: string,
  value: string,
  extra: Partial<RawAnswer> = {}
): RawAnswer {
  return { questionId, answer: value, answeredAt: 1000, ...extra };
}

function response(
  answers: RawAnswer[],
  extra: Partial<CompletedResponse> = {}
): CompletedResponse {
  return { studentUid: 'anon', answers, score: null, ...extra };
}

function session(
  id: string,
  teacherUid: string,
  responses: CompletedResponse[],
  questions: unknown[] = publicQuestions,
  scorePublishedAt: number | null = null
): SessionInput {
  return {
    id,
    teacherUid,
    teacherName: `Teacher ${teacherUid}`,
    publicQuestions: questions,
    responses,
    scorePublishedAt,
  };
}

describe('resolveGroupQuestions', () => {
  it('prefers the synced group and derives MC choices from the answer key', () => {
    const qs = resolveGroupQuestions(syncedQuestions, publicQuestions);
    expect(qs.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(qs[0].choices).toEqual(['St. Paul', 'Duluth', 'Rochester']);
    expect(qs[0].correctAnswer).toBe('St. Paul');
    expect(qs[0].points).toBe(2);
    expect(qs[1].choices).toEqual([]);
    expect(qs[1].points).toBe(1);
  });

  it('falls back to the first session public questions without a key', () => {
    const qs = resolveGroupQuestions(null, publicQuestions);
    expect(qs[0].choices).toEqual(['Duluth', 'St. Paul', 'Rochester']);
    expect(qs[0].correctAnswer).toBeNull();
    expect(qs[2].choices).toEqual([]);
  });

  it('falls back when the synced doc has no usable questions', () => {
    expect(
      resolveGroupQuestions({ questions: [] }, publicQuestions)
    ).toHaveLength(3);
    expect(
      resolveGroupQuestions({ questions: 'nope' }, publicQuestions)
    ).toHaveLength(3);
  });

  it('merges private target snapshots onto resolved pool questions', () => {
    const qs = resolveGroupQuestions(
      syncedQuestions,
      [
        ...publicQuestions,
        { id: 'pool-q', type: 'MC', text: 'Pool?', choices: ['A', 'B'] },
      ],
      [{ id: 'pool-q', targets: [sourceTarget] }]
    );
    expect(qs.find((q) => q.id === 'pool-q')?.targets).toEqual([sourceTarget]);
  });
});

describe('alignSessionQuestions', () => {
  it('aligns by id when session ids are a subset of the group', () => {
    const a = alignSessionQuestions(['q1', 'q2', 'q3'], ['q2', 'q1']);
    expect(a.mode).toBe('byId');
    expect(a.countMismatch).toBe(false);
    expect(a.map.get('q2')).toBe('q2');
  });

  it('aligns positionally for foreign ids and flags a count mismatch', () => {
    const a = alignSessionQuestions(['q1', 'q2', 'q3'], ['x1', 'x2']);
    expect(a.mode).toBe('positional');
    expect(a.countMismatch).toBe(true);
    expect(a.map.get('x1')).toBe('q1');
    expect(a.map.get('x2')).toBe('q2');
  });

  it('drops extra positional questions beyond the group length', () => {
    const a = alignSessionQuestions(['q1'], ['x1', 'x2']);
    expect(a.map.has('x2')).toBe(false);
    expect(a.countMismatch).toBe(true);
  });
});

describe('selectRepresentativeAnswers', () => {
  it('keeps the highest take, ties broken by earliest answeredAt', () => {
    const picked = selectRepresentativeAnswers([
      answer('q1', 'first', { answeredAt: 1 }),
      answer('q1', 'retake', { answeredAt: 5, takeIndex: 1 }),
      answer('q1', 'retake-dup', { answeredAt: 9, takeIndex: 1 }),
      answer('q2', 'later', { answeredAt: 8 }),
      answer('q2', 'earlier', { answeredAt: 2 }),
    ]);
    expect(picked.get('q1')?.answer).toBe('retake');
    expect(picked.get('q2')?.answer).toBe('earlier');
  });

  it('drops drafts and unresponded entries', () => {
    const picked = selectRepresentativeAnswers([
      answer('q1', 'draft', { status: 'draft' }),
      answer('q2', '', { unresponded: 'skipped' }),
      answer('q3', 'kept', { status: 'submitted' }),
    ]);
    expect(picked.has('q1')).toBe(false);
    expect(picked.has('q2')).toBe(false);
    expect(picked.get('q3')?.answer).toBe('kept');
  });
});

describe('computeAssessmentAggregate', () => {
  const groupQuestions: GroupQuestion[] = resolveGroupQuestions(
    syncedQuestions,
    publicQuestions
  );

  function compute(sessions: SessionInput[], qs = groupQuestions) {
    return computeAssessmentAggregate({
      assessmentId: 'a1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      groupQuestions: qs,
      sessions,
    });
  }

  it('pools published results across teachers', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response(
          [
            answer('q1', 'St. Paul', { isCorrect: true }),
            answer('q2', '4', { isCorrect: true }),
            answer('q3', 'Because reasons', { isCorrect: true }),
          ],
          { score: 100, classPeriod: 'P1' }
        ),
        response(
          [
            answer('q1', 'Duluth', { isCorrect: false }),
            answer('q2', '5', { isCorrect: false }),
          ],
          { score: 0, classPeriod: 'P2' }
        ),
      ]),
      session('s-b', 'teacherB', [
        response(
          [
            answer('q1', 'St. Paul', { isCorrect: true }),
            answer('q2', '3', { isCorrect: false }),
          ],
          { score: 50, classId: 'class-9' }
        ),
      ]),
    ]);

    expect(agg.schemaVersion).toBe(3);
    expect(agg.title).toBe('Unit 4 CFA');
    expect(agg.kind).toBe('quiz');
    expect(agg.teacherCount).toBe(2);
    expect(agg.studentCount).toBe(3);
    expect(agg.teamAveragePercent).toBe(50);
    expect(agg.sessionCount).toBe(2);
    expect(agg.computedFromSessionIds).toEqual(['s-a', 's-b']);
    expect(agg.alignment).toBe('byId');
    expect(agg.alignmentWarning).toBeUndefined();

    const q1 = agg.perQuestion[0];
    expect(q1).toMatchObject({
      questionId: 'q1',
      points: 2,
      answered: 3,
      graded: 3,
      correct: 2,
      servedCount: 3,
      correctPercent: 67,
      incorrectPercent: 33,
    });
    expect(q1.choiceDistribution).toEqual([
      { label: 'St. Paul', count: 2, isCorrect: true },
      { label: 'Duluth', count: 1, isCorrect: false },
      { label: 'Rochester', count: 0, isCorrect: false },
    ]);
    expect(agg.perQuestion[1]).toMatchObject({
      questionId: 'q2',
      answered: 3,
      correct: 1,
      incorrectPercent: 67,
      choiceDistribution: [],
    });

    expect(
      agg.perTarget.find((row) => row.targetId === sourceTarget.id)
    ).toMatchObject({
      kind: 'plc',
      questionIds: ['q1'],
      attempted: 3,
      correctPercent: 67,
      lowSample: true,
    });
    expect(agg.perStandard).toEqual([
      expect.objectContaining({
        targetId: standard.id,
        code: standard.code,
        label: standard.label,
        questionIds: ['q1', 'q2'],
        attempted: 6,
        correctPercent: 50,
        lowSample: false,
      }),
    ]);

    expect(agg.perTeacher).toEqual([
      {
        teacherUid: 'teacherA',
        teacherName: 'Teacher teacherA',
        classCount: 2,
        averagePercent: 50,
        studentCount: 2,
      },
      {
        teacherUid: 'teacherB',
        teacherName: 'Teacher teacherB',
        classCount: 1,
        averagePercent: 50,
        studentCount: 1,
      },
    ]);
  });

  it('counts unpublished students but reports null incorrectPercent', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([answer('q1', 'Duluth'), answer('q2', '4')]),
        response([answer('q1', 'St. Paul')]),
      ]),
    ]);
    expect(agg.studentCount).toBe(2);
    expect(agg.teamAveragePercent).toBe(0);
    expect(agg.perQuestion[0]).toMatchObject({
      answered: 2,
      graded: 0,
      correct: 0,
      correctPercent: 0,
      incorrectPercent: null,
    });
    expect(agg.perQuestion[0].choiceDistribution).toEqual([
      { label: 'St. Paul', count: 1, isCorrect: true },
      { label: 'Duluth', count: 1, isCorrect: false },
      { label: 'Rochester', count: 0, isCorrect: false },
    ]);
    expect(agg.perTeacher[0].averagePercent).toBe(0);
  });

  it('never emits free-text answers, only MC labels', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([
          answer('q2', 'my secret fib text', { isCorrect: false }),
          answer('q3', 'a long essay naming a student', { isCorrect: true }),
        ]),
      ]),
    ]);
    const json = JSON.stringify(agg);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('essay');
    expect(agg.perQuestion[1].choiceDistribution).toEqual([]);
    expect(agg.perQuestion[2].choiceDistribution).toEqual([]);
    expect(json).not.toContain('anon');
  });

  it('infers MC correctness from published flags when no key is known', () => {
    const keyless = resolveGroupQuestions(null, publicQuestions);
    const agg = compute(
      [
        session('s-a', 'teacherA', [
          response([answer('q1', 'St. Paul', { isCorrect: true })]),
          response([answer('q1', 'Duluth', { isCorrect: false })]),
        ]),
      ],
      keyless
    );
    expect(agg.perQuestion[0].choiceDistribution).toEqual([
      { label: 'Duluth', count: 1, isCorrect: false },
      { label: 'St. Paul', count: 1, isCorrect: true },
      { label: 'Rochester', count: 0, isCorrect: false },
    ]);
  });

  it('aligns retroactively linked copies by position and warns on count mismatch', () => {
    const copyQuestions = [
      {
        id: 'c1',
        type: 'MC',
        text: 'Capital of MN?',
        choices: ['St. Paul', 'Duluth'],
      },
      { id: 'c2', type: 'FIB', text: 'Two plus two?' },
    ];
    const agg = compute([
      session('s-a', 'teacherA', [
        response([answer('q1', 'St. Paul', { isCorrect: true })], {
          score: 100,
        }),
      ]),
      session(
        's-copy',
        'teacherB',
        [
          response(
            [
              answer('c1', 'Duluth', { isCorrect: false }),
              answer('c2', '4', { isCorrect: true }),
            ],
            { score: 50 }
          ),
        ],
        copyQuestions
      ),
    ]);
    expect(agg.alignment).toBe('positional');
    expect(agg.alignmentWarning).toBe(ALIGNMENT_WARNING);
    expect(agg.perQuestion[0]).toMatchObject({ answered: 2, correct: 1 });
    expect(agg.perQuestion[1]).toMatchObject({ answered: 1, correct: 1 });
    expect(agg.perQuestion[0].choiceDistribution[1]).toEqual({
      label: 'Duluth',
      count: 1,
      isCorrect: false,
    });
  });

  it('is positional without a warning when counts match', () => {
    const copyQuestions = publicQuestions.map((q) => ({
      ...q,
      id: `c-${q.id}`,
    }));
    const agg = compute([
      session(
        's-copy',
        'teacherB',
        [response([answer('c-q1', 'St. Paul')])],
        copyQuestions
      ),
    ]);
    expect(agg.alignment).toBe('positional');
    expect(agg.alignmentWarning).toBeUndefined();
    expect(agg.perQuestion[0].answered).toBe(1);
  });

  it('ignores sessions with no completed responses', () => {
    const agg = compute([
      session('s-empty', 'teacherZ', []),
      session('s-a', 'teacherA', [response([answer('q1', 'Duluth')])]),
    ]);
    expect(agg.teacherCount).toBe(1);
    expect(agg.sessionCount).toBe(1);
    expect(agg.computedFromSessionIds).toEqual(['s-a']);
    expect(agg.perTeacher.map((t) => t.teacherUid)).toEqual(['teacherA']);
  });

  it('uses the representative answer per question inside a response', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([
          answer('q1', 'Duluth', { isCorrect: false, answeredAt: 1 }),
          answer('q1', 'St. Paul', {
            isCorrect: true,
            answeredAt: 2,
            takeIndex: 1,
          }),
          answer('q2', 'draft text', { status: 'draft' }),
        ]),
      ]),
    ]);
    expect(agg.perQuestion[0]).toMatchObject({ answered: 1, correct: 1 });
    expect(agg.perQuestion[1].answered).toBe(0);
  });

  it('counts linked, published and scored totals separately', () => {
    const agg = compute([
      session(
        's-a',
        'teacherA',
        [response([], { score: 80 })],
        publicQuestions,
        5
      ),
      session('s-b', 'teacherB', [response([]), response([], { score: 40 })]),
      session('s-c', 'teacherC', []),
    ]);
    expect(agg.linkedSessionCount).toBe(3);
    expect(agg.publishedSessionCount).toBe(1);
    expect(agg.sessionCount).toBe(2);
    expect(agg.studentCount).toBe(3);
    expect(agg.scoredStudentCount).toBe(2);
    expect(agg.teamAveragePercent).toBe(60);
  });

  it('counts only the questions served by each randomized attempt', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([answer('q1', 'St. Paul', { isCorrect: true })], {
          servedQuestionIds: ['q1'],
        }),
        response([answer('q2', '4', { isCorrect: true })], {
          servedQuestionIds: ['q2'],
        }),
      ]),
    ]);
    expect(agg.perQuestion.map((question) => question.servedCount)).toEqual([
      1, 1, 0,
    ]);
  });

  it('returns a zeroed payload with question rows when nothing has run', () => {
    const agg = compute([]);
    expect(agg.studentCount).toBe(0);
    expect(agg.teacherCount).toBe(0);
    expect(agg.perQuestion).toHaveLength(3);
    expect(agg.perQuestion[0].incorrectPercent).toBeNull();
    expect(agg.perTeacher).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  AGGREGATE_SCHEMA_VERSION,
  ALIGNMENT_WARNING,
  bucketScores,
  alignSessionQuestions,
  computeAssessmentAggregate,
  gradeGroupAnswer,
  resolveGroupQuestions,
  selectRepresentativeAnswers,
  servedFibAnswers,
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

    expect(agg.schemaVersion).toBe(AGGREGATE_SCHEMA_VERSION);
    expect(agg.scoreDistribution).toEqual([
      { min: 90, max: 100, count: 1 },
      { min: 80, max: 89, count: 0 },
      { min: 60, max: 79, count: 0 },
      { min: 0, max: 59, count: 2 },
    ]);
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
    expect(agg.perTarget.some((row) => row.targetId === contextTarget.id)).toBe(
      false
    );
    expect(agg.perStandard).toEqual([
      expect.objectContaining({
        targetId: standard.id,
        code: standard.code,
        label: standard.label,
        questionIds: ['q1'],
        attempted: 3,
        correctPercent: 67,
        lowSample: true,
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

  it('grades unpublished responses from the answer key', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([answer('q1', 'Duluth'), answer('q2', '4')]),
        response([answer('q1', 'St. Paul')]),
      ]),
    ]);
    expect(agg.studentCount).toBe(2);
    expect(agg.scoredStudentCount).toBe(2);
    // 1/8 and 2/8 of the points (q3 unanswered counts against the student).
    expect(agg.teamAveragePercent).toBe(19);
    expect(agg.perQuestion[0]).toMatchObject({
      answered: 2,
      graded: 2,
      correct: 1,
      correctPercent: 50,
      incorrectPercent: 50,
    });
    expect(agg.perQuestion[0].choiceDistribution).toEqual([
      { label: 'St. Paul', count: 1, isCorrect: true },
      { label: 'Duluth', count: 1, isCorrect: false },
      { label: 'Rochester', count: 0, isCorrect: false },
    ]);
    expect(agg.perTeacher[0].averagePercent).toBe(19);
  });

  it('withholds a score while a written answer awaits a manual grade', () => {
    const agg = compute([
      session('s-a', 'teacherA', [
        response([
          answer('q1', 'St. Paul'),
          answer('q2', '4'),
          answer('q3', 'Because reasons'),
        ]),
        response(
          [
            answer('q1', 'St. Paul'),
            answer('q2', '4'),
            answer('q3', 'Because reasons'),
          ],
          { manualGrades: { q3: { pointsAwarded: 4, scoredCriterionIds: [] } } }
        ),
      ]),
    ]);
    expect(agg.studentCount).toBe(2);
    expect(agg.scoredStudentCount).toBe(1);
    // (2 + 1 + 4) / 8
    expect(agg.teamAveragePercent).toBe(88);
    expect(agg.perQuestion[0]).toMatchObject({ graded: 2, correct: 2 });
    expect(agg.perQuestion[2]).toMatchObject({ graded: 1, correct: 0 });
  });

  it('withholds a score when no answer key is known but keeps published flags', () => {
    const keyless = resolveGroupQuestions(null, publicQuestions);
    const agg = compute(
      [
        session('s-a', 'teacherA', [
          response([answer('q1', 'St. Paul', { isCorrect: true })]),
          response([answer('q1', 'Duluth')], { score: 40 }),
        ]),
      ],
      keyless
    );
    expect(agg.scoredStudentCount).toBe(1);
    expect(agg.teamAveragePercent).toBe(40);
    expect(agg.perQuestion[0]).toMatchObject({
      answered: 2,
      graded: 1,
      correct: 1,
    });
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
    // The blank unpublished response grades to 0 from the key.
    expect(agg.scoredStudentCount).toBe(3);
    expect(agg.teamAveragePercent).toBe(40);
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

  describe('point-scored questions', () => {
    const rubricTarget = {
      id: 'target-rubric',
      kind: 'plc' as const,
      ownerId: 'plc-1',
      label: 'Explain with evidence',
    };
    const rubricQuestions: GroupQuestion[] = [
      {
        id: 'q1',
        text: 'Capital of MN?',
        type: 'MC',
        points: 1,
        choices: ['Duluth', 'St. Paul'],
        correctAnswer: 'St. Paul',
        allowPartialCredit: false,
        rubricCriterionIds: [],
        targets: [],
      },
      {
        id: 'q3',
        text: 'Explain.',
        type: 'free-response',
        points: 4,
        choices: [],
        correctAnswer: null,
        allowPartialCredit: false,
        rubricCriterionIds: ['c1', 'c2'],
        targets: [rubricTarget],
      },
    ];
    const rubricPublic = [
      { id: 'q1', type: 'MC', text: 'Capital of MN?' },
      { id: 'q3', type: 'free-response', text: 'Explain.' },
    ];
    const threeOfFour = {
      q3: { pointsAwarded: 3, scoredCriterionIds: ['c1', 'c2'] },
    };

    it('reports a rubric question as the average percent of points', () => {
      const agg = compute(
        [
          session(
            's-a',
            'teacherA',
            Array.from({ length: 4 }, () =>
              response(
                [
                  answer('q1', 'St. Paul', { isCorrect: true }),
                  answer('q3', 'Because reasons', { isCorrect: false }),
                ],
                { manualGrades: threeOfFour }
              )
            ),
            rubricPublic
          ),
        ],
        rubricQuestions
      );
      expect(agg.perQuestion[1]).toMatchObject({
        scoring: 'points',
        answered: 4,
        graded: 4,
        correct: 0,
        pointsEarned: 12,
        pointsPossible: 16,
        correctPercent: 75,
        incorrectPercent: 25,
      });
      expect(agg.perQuestion[0]).toMatchObject({
        scoring: 'binary',
        correctPercent: 100,
        pointsEarned: 4,
        pointsPossible: 4,
      });
      expect(agg.perTarget).toEqual([
        expect.objectContaining({
          targetId: 'target-rubric',
          attempted: 4,
          correctPercent: 75,
        }),
      ]);
    });

    it('averages mixed rubric scores and excludes ungraded answers', () => {
      const agg = compute(
        [
          session(
            's-a',
            'teacherA',
            [
              response([answer('q3', 'Full marks')], {
                manualGrades: {
                  q3: { pointsAwarded: 4, scoredCriterionIds: ['c1', 'c2'] },
                },
              }),
              response([answer('q3', 'Half marks')], {
                manualGrades: {
                  q3: { pointsAwarded: 2, scoredCriterionIds: ['c1', 'c2'] },
                },
              }),
              response([answer('q3', 'Not graded yet')]),
              response([answer('q3', 'Half a rubric')], {
                manualGrades: {
                  q3: { pointsAwarded: 1, scoredCriterionIds: ['c1'] },
                },
              }),
            ],
            rubricPublic
          ),
        ],
        rubricQuestions
      );
      expect(agg.perQuestion[1]).toMatchObject({
        answered: 4,
        graded: 2,
        correct: 1,
        pointsEarned: 6,
        pointsPossible: 8,
        correctPercent: 75,
      });
    });

    it('falls back to the published flag when no manual grade is stored', () => {
      const agg = compute(
        [
          session(
            's-a',
            'teacherA',
            [
              response([answer('q3', 'A', { isCorrect: true })]),
              response([answer('q3', 'B', { isCorrect: false })]),
            ],
            rubricPublic
          ),
        ],
        rubricQuestions
      );
      expect(agg.perQuestion[1]).toMatchObject({
        graded: 2,
        pointsEarned: 4,
        pointsPossible: 8,
        correctPercent: 50,
      });
    });

    it('scores partial-credit matching by points and strict matching as binary', () => {
      const matching = (allowPartialCredit: boolean): GroupQuestion => ({
        id: 'm1',
        text: 'Match.',
        type: 'Matching',
        points: 3,
        choices: [],
        correctAnswer: 'a:1|b:2|c:3',
        allowPartialCredit,
        rubricCriterionIds: [],
        targets: [],
      });
      const run = (partial: boolean) =>
        compute(
          [
            session(
              's-a',
              'teacherA',
              [response([answer('m1', 'a:1|b:2|c:1')])],
              [{ id: 'm1', type: 'Matching', text: 'Match.' }]
            ),
          ],
          [matching(partial)]
        ).perQuestion[0];
      expect(run(true)).toMatchObject({
        scoring: 'points',
        correct: 0,
        pointsEarned: 2,
        correctPercent: 67,
      });
      expect(run(false)).toMatchObject({
        scoring: 'binary',
        correct: 0,
        pointsEarned: 0,
        correctPercent: 0,
      });
    });

    it('scores partial-credit choose-all by points', () => {
      const ma: GroupQuestion = {
        id: 'ma1',
        text: 'Pick all primes.',
        type: 'MA',
        points: 2,
        choices: ['2', '3', '5', '4'],
        correctAnswer: '2|3|5',
        allowPartialCredit: true,
        rubricCriterionIds: [],
        targets: [],
      };
      const row = compute(
        [
          session(
            's-a',
            'teacherA',
            [
              response([answer('ma1', '2|3')]),
              response([answer('ma1', '2|3|5')]),
            ],
            [{ id: 'ma1', type: 'MA', text: 'Pick all primes.' }]
          ),
        ],
        [ma]
      ).perQuestion[0];
      expect(row).toMatchObject({
        scoring: 'points',
        graded: 2,
        correct: 1,
        correctPercent: 83,
      });
    });
  });
});

describe('gradeGroupAnswer', () => {
  const q = (over: Partial<GroupQuestion>): GroupQuestion => ({
    id: 'q',
    text: '',
    type: 'MC',
    points: 4,
    choices: [],
    correctAnswer: 'A',
    allowPartialCredit: false,
    rubricCriterionIds: [],
    targets: [],
    ...over,
  });

  it('matches MC and FIB case- and whitespace-insensitively', () => {
    expect(gradeGroupAnswer(q({}), ' a ', undefined)).toMatchObject({
      isCorrect: true,
      pointsEarned: 4,
      state: 'scored',
    });
    expect(gradeGroupAnswer(q({ type: 'FIB' }), '', undefined)).toMatchObject({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 4,
      state: 'not-attempted',
    });
  });

  it('accepts FIB alternate answers from the synced key', () => {
    const fib = q({
      type: 'FIB',
      correctAnswer: 'color',
      alternateAnswers: ['colour'],
    });
    expect(gradeGroupAnswer(fib, 'Colour', undefined).isCorrect).toBe(true);
    expect(gradeGroupAnswer(fib, 'colr', undefined).isCorrect).toBe(false);
  });

  it('grades matching strictly or partially', () => {
    const m = q({ type: 'Matching', correctAnswer: 'a:1|b:2' });
    expect(gradeGroupAnswer(m, 'a:1|b:3', undefined).pointsEarned).toBe(0);
    expect(
      gradeGroupAnswer({ ...m, allowPartialCredit: true }, 'a:1|b:3', undefined)
        .pointsEarned
    ).toBe(2);
  });

  describe('choose all that apply (MA)', () => {
    // 3 right of 5 options; choices carry right then wrong, as parseSyncedQuestion builds them.
    const ma = q({
      type: 'MA',
      points: 3,
      correctAnswer: 'A|B|C',
      choices: ['A', 'B', 'C', 'D', 'E'],
    });

    it('needs the exact set without partial credit', () => {
      expect(gradeGroupAnswer(ma, 'c|a|b', undefined)).toMatchObject({
        isCorrect: true,
        pointsEarned: 3,
      });
      expect(gradeGroupAnswer(ma, 'A|B', undefined)).toMatchObject({
        isCorrect: false,
        pointsEarned: 0,
      });
    });

    it('scores 0 for picking all five with partial credit on', () => {
      expect(
        gradeGroupAnswer(
          { ...ma, allowPartialCredit: true },
          'A|B|C|D|E',
          undefined
        )
      ).toMatchObject({ isCorrect: false, pointsEarned: 0 });
    });

    it('gives 2/3 of the points for 2 right and none wrong', () => {
      const g = gradeGroupAnswer(
        { ...ma, allowPartialCredit: true },
        'A|B',
        undefined
      );
      expect(g.isCorrect).toBe(false);
      expect(g.pointsEarned).toBeCloseTo(2);
    });

    it('subtracts the wrong share and floors at 0', () => {
      const partial = { ...ma, allowPartialCredit: true };
      // 3/3 right − 1/2 wrong = 0.5
      expect(
        gradeGroupAnswer(partial, 'A|B|C|D', undefined).pointsEarned
      ).toBeCloseTo(1.5);
      // 1/3 right − 2/2 wrong → 0
      expect(gradeGroupAnswer(partial, 'A|D|E', undefined).pointsEarned).toBe(
        0
      );
    });

    it('reads the options, right then wrong, from the synced key', () => {
      const [synced] = resolveGroupQuestions(
        {
          questions: [
            {
              id: 'm1',
              type: 'MA',
              text: 'Mammals?',
              correctAnswer: 'Whale|Bat',
              incorrectAnswers: ['Shark', ''],
            },
          ],
        },
        []
      );
      expect(synced.choices).toEqual(['Whale', 'Bat', 'Shark']);
    });

    it('counts each option picked in the choice distribution', () => {
      const agg = computeAssessmentAggregate({
        assessmentId: 'a1',
        title: 'T',
        kind: 'quiz',
        groupQuestions: [{ ...ma, id: 'q1' }],
        sessions: [
          session(
            's-a',
            'teacherA',
            [
              response([answer('q1', 'A|B|C', { isCorrect: true })], {
                studentUid: 's1',
              }),
              response([answer('q1', 'A|D', { isCorrect: false })], {
                studentUid: 's2',
              }),
            ],
            [{ id: 'q1', type: 'MA', text: 'Pick', choices: ['A', 'B'] }]
          ),
        ],
      });
      expect(agg.perQuestion[0].choiceDistribution).toEqual([
        { label: 'A', count: 2, isCorrect: true },
        { label: 'B', count: 1, isCorrect: true },
        { label: 'C', count: 1, isCorrect: true },
        { label: 'D', count: 1, isCorrect: false },
        { label: 'E', count: 0, isCorrect: false },
      ]);
    });
  });

  it('grades ordering with partial credit by ordered subsequence', () => {
    const o = q({ type: 'Ordering', correctAnswer: 'a|b|c|d' });
    expect(gradeGroupAnswer(o, 'a|c|b|d', undefined).pointsEarned).toBe(0);
    expect(
      gradeGroupAnswer({ ...o, allowPartialCredit: true }, 'a|c|b|d', undefined)
        .pointsEarned
    ).toBe(3);
  });

  it('uses the clamped manual grade for written answers', () => {
    const w = q({ type: 'free-response', correctAnswer: null });
    expect(gradeGroupAnswer(w, '<p>text</p>', undefined).state).toBe(
      'awaiting-grade'
    );
    expect(gradeGroupAnswer(w, '<p></p>', undefined).state).toBe(
      'not-attempted'
    );
    expect(
      gradeGroupAnswer(w, 'text', { pointsAwarded: 9, scoredCriterionIds: [] })
    ).toMatchObject({
      isCorrect: true,
      pointsEarned: 4,
      state: 'scored',
    });
  });

  it('keeps a partially scored rubric awaiting a grade', () => {
    const w = q({
      type: 'free-response',
      correctAnswer: null,
      rubricCriterionIds: ['c1', 'c2'],
    });
    expect(
      gradeGroupAnswer(w, 'text', {
        pointsAwarded: 2,
        scoredCriterionIds: ['c1'],
      }).state
    ).toBe('awaiting-grade');
    expect(
      gradeGroupAnswer(w, 'text', {
        pointsAwarded: 4,
        scoredCriterionIds: ['c1', 'c2'],
      }).state
    ).toBe('scored');
    expect(
      gradeGroupAnswer(w, 'text', { pointsAwarded: 3, scoredCriterionIds: [] })
        .state
    ).toBe('scored');
  });

  it('reports no-key for auto types without an answer key', () => {
    expect(
      gradeGroupAnswer(q({ correctAnswer: null }), 'A', undefined).state
    ).toBe('no-key');
  });
});

describe('standard-level rollup', () => {
  const benchmark = {
    id: 'mn-ela-2020:6.1.9.1',
    kind: 'standard' as const,
    code: '6.1.9.1',
    label: 'Analyze ads.',
    parentId: 'mn-ela-2020:std:R9',
    parentLabel: 'Media Literacy',
  };
  const parent = {
    id: 'mn-ela-2020:std:R9',
    kind: 'standard' as const,
    code: 'R9',
    label: 'Media Literacy',
  };

  it('parses parentId/parentLabel and unions benchmarks into the parent row', () => {
    const qs = resolveGroupQuestions(null, [
      { id: 'q1', text: 'Q1', type: 'MC', targets: [benchmark] },
      { id: 'q2', text: 'Q2', type: 'MC', targets: [parent] },
      { id: 'q3', text: 'Q3', type: 'MC', targets: [benchmark, parent] },
    ]);
    expect(qs[0].targets[0]).toMatchObject({
      parentId: benchmark.parentId,
      parentLabel: benchmark.parentLabel,
    });
    const agg = computeAssessmentAggregate({
      assessmentId: 'a1',
      title: 'Rollup',
      kind: 'quiz',
      groupQuestions: qs,
      sessions: [
        session('s', 'teacher', [
          response(
            [
              answer('q1', 'a', { isCorrect: true }),
              answer('q2', 'b', { isCorrect: false }),
              answer('q3', 'a', { isCorrect: true }),
            ],
            { score: 67 }
          ),
        ]),
      ],
    });
    const parentRow = agg.perStandard.find((r) => r.targetId === parent.id);
    expect(parentRow).toMatchObject({
      code: 'R9',
      label: 'Media Literacy',
      questionIds: ['q1', 'q2', 'q3'],
      attempted: 3,
      correctPercent: 67,
    });
    expect(
      agg.perStandard.find((r) => r.targetId === benchmark.id)?.questionIds
    ).toEqual(['q1', 'q3']);
    expect(agg.perTarget.map((r) => r.targetId).sort()).toEqual(
      [benchmark.id, parent.id].sort()
    );
  });
});

describe('localized FIB grading', () => {
  const fib: GroupQuestion = {
    id: 'q2',
    text: 'Two plus two?',
    type: 'FIB',
    points: 1,
    choices: [],
    correctAnswer: 'four',
    allowPartialCredit: false,
    rubricCriterionIds: [],
    targets: [],
  };

  it('accepts the translated key for the locale the teacher served', () => {
    expect(gradeGroupAnswer(fib, 'cuatro', undefined).isCorrect).toBe(false);
    expect(
      gradeGroupAnswer(fib, 'cuatro', undefined, ['cuatro']).isCorrect
    ).toBe(true);
    expect(gradeGroupAnswer(fib, 'four', undefined, ['cuatro']).isCorrect).toBe(
      true
    );
  });

  it('treats ё and е as the same letter in a Russian key', () => {
    expect(
      gradeGroupAnswer(fib, 'Четыре ёлки', undefined, ['четыре елки']).isCorrect
    ).toBe(true);
    expect(
      gradeGroupAnswer(fib, 'четыре елки', undefined, ['Четыре Ёлки']).isCorrect
    ).toBe(true);
  });

  it('scopes accepted answers to the served locale only', () => {
    const input = {
      localizedFibAnswers: { q2: { es: ['cuatro'], fr: ['quatre'] } },
      overridesByStudentUid: { 'stu-1': { language: 'es' } },
    };
    expect(servedFibAnswers(input, 'stu-1', 'q2')).toEqual(['cuatro']);
    expect(servedFibAnswers(input, 'stu-2', 'q2')).toEqual([]);
    expect(servedFibAnswers({}, 'stu-1', 'q2')).toEqual([]);
  });

  it('scores a Spanish FIB answer for the student served Spanish', () => {
    const responses = [
      response([answer('q2', 'cuatro')], { studentUid: 'stu-1' }),
      response([answer('q2', 'cuatro')], { studentUid: 'stu-2' }),
    ];
    const base = session('s1', 't1', responses, [publicQuestions[1]]);
    const payload = computeAssessmentAggregate({
      assessmentId: 'a1',
      title: 'T',
      kind: 'quiz',
      groupQuestions: [fib],
      sessions: [
        {
          ...base,
          localizedFibAnswers: { q2: { es: ['cuatro'] } },
          overridesByStudentUid: { 'stu-1': { language: 'es' } },
        },
      ],
    });
    const q = payload.perQuestion.find((r) => r.questionId === 'q2');
    expect(q?.graded).toBe(2);
    expect(q?.correct).toBe(1);
  });
});

describe('bucketScores', () => {
  it('pools scores into the shared percent bands, including fractional edges', () => {
    expect(bucketScores([100, 90, 89.5, 80, 79, 60, 59, 0])).toEqual([
      { min: 90, max: 100, count: 2 },
      { min: 80, max: 89, count: 2 },
      { min: 60, max: 79, count: 2 },
      { min: 0, max: 59, count: 2 },
    ]);
  });

  it('returns zeroed bands when nothing is scored', () => {
    expect(bucketScores([]).map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });
});

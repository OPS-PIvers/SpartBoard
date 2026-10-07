import { describe, expect, it } from 'vitest';
import type {
  LearningTarget,
  PlcAggregateTargetRow,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
} from '@/types';
import {
  buildItemAnalysis,
  buildMasteryByTarget,
  buildParticipation,
  buildScoreDistribution,
  buildTeamTrend,
  dateAggregates,
  dominantWrongAnswer,
  isQuestionPending,
  type PlcAggregateQuestion,
} from './plcDataOverview';

const SEPT_8 = Date.UTC(2026, 8, 8);
const SEPT_22 = Date.UTC(2026, 8, 22);
const OCT_6 = Date.UTC(2026, 9, 6);

function assessment(
  id: string,
  parts: Partial<PlcCommonAssessment> = {}
): PlcCommonAssessment {
  return {
    id,
    title: `Unit ${id}`,
    kind: 'quiz',
    syncGroupId: `group-${id}`,
    status: 'active',
    createdBy: 'lead',
    createdAt: SEPT_8,
    updatedAt: SEPT_8,
    ...parts,
  };
}

function question(
  questionId: string,
  parts: Partial<PlcAggregateQuestion> = {}
): PlcAggregateQuestion {
  return {
    questionId,
    text: `Question ${questionId}`,
    scoring: 'binary',
    correctPercent: 80,
    points: 1,
    incorrectPercent: 20,
    answered: 50,
    graded: 50,
    correct: 40,
    servedCount: 50,
    choiceDistribution: [],
    ...parts,
  };
}

function aggregate(
  assessmentId: string,
  parts: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId,
    schemaVersion: 6,
    title: `Aggregate ${assessmentId}`,
    kind: 'quiz',
    teacherCount: 3,
    studentCount: 60,
    teamAveragePercent: 74,
    scoredStudentCount: 50,
    linkedSessionCount: 4,
    publishedSessionCount: 4,
    perQuestion: [],
    contributorUids: ['t1', 't2', 't3'],
    ranAt: 9e12,
    ...parts,
  };
}

/** A schema 1 doc from the retired contribution pipeline: no optional fields at all. */
function legacyAggregate(assessmentId: string): PlcAssessmentAggregate {
  return {
    assessmentId,
    schemaVersion: 1,
    teacherCount: 2,
    studentCount: 44,
    teamAveragePercent: 68,
    perQuestion: [
      { questionId: 'l1', text: 'Legacy one', correctPercent: 55, points: 1 },
      { questionId: 'l2', text: 'Legacy two', correctPercent: 90, points: 1 },
    ],
    contributorUids: ['t1', 't2'],
    ranAt: SEPT_8,
  };
}

function targetRow(
  targetId: string,
  correctPercent: number,
  attempted: number,
  parts: Partial<PlcAggregateTargetRow> = {}
): PlcAggregateTargetRow {
  return {
    targetId,
    kind: 'plc',
    code: targetId.toUpperCase(),
    label: `Snapshot ${targetId}`,
    questionIds: ['q1'],
    attempted,
    correctPercent,
    lowSample: attempted < 5,
    ...parts,
  };
}

describe('dominantWrongAnswer', () => {
  it('picks the most-chosen incorrect option as a share of answering students', () => {
    const q = question('q1', {
      answered: 40,
      choiceDistribution: [
        { label: '3/4', count: 18, isCorrect: true },
        { label: '4/3', count: 14, isCorrect: false },
        { label: '1/4', count: 6, isCorrect: false },
        { label: '3', count: 2, isCorrect: false },
      ],
    });
    expect(dominantWrongAnswer(q)).toEqual({
      label: '4/3',
      count: 14,
      percent: 35,
    });
  });

  it('keeps the first option in canonical order on a tie', () => {
    const q = question('q1', {
      answered: 20,
      choiceDistribution: [
        { label: 'A', count: 10, isCorrect: true },
        { label: 'B', count: 5, isCorrect: false },
        { label: 'C', count: 5, isCorrect: false },
      ],
    });
    expect(dominantWrongAnswer(q)?.label).toBe('B');
  });

  it('is omitted for non-MC, all-correct, and unknown-key questions', () => {
    expect(dominantWrongAnswer(question('q1'))).toBeUndefined();
    expect(
      dominantWrongAnswer(question('q1', { choiceDistribution: undefined }))
    ).toBeUndefined();
    expect(
      dominantWrongAnswer(
        question('q1', {
          choiceDistribution: [
            { label: 'A', count: 20, isCorrect: true },
            { label: 'B', count: 0, isCorrect: false },
          ],
        })
      )
    ).toBeUndefined();
    // Before publish with no answer key every row reads incorrect; no call-out.
    expect(
      dominantWrongAnswer(
        question('q1', {
          choiceDistribution: [
            { label: 'A', count: 12, isCorrect: false },
            { label: 'B', count: 3, isCorrect: false },
          ],
        })
      )
    ).toBeUndefined();
  });

  it('counts multi-answer picks against students, not picks', () => {
    const q = question('q1', {
      answered: 10,
      choiceDistribution: [
        { label: 'Mitochondria', count: 9, isCorrect: true },
        { label: 'Ribosome', count: 8, isCorrect: true },
        { label: 'Cell wall', count: 7, isCorrect: false },
      ],
    });
    expect(dominantWrongAnswer(q)?.percent).toBe(70);
  });

  it('falls back to the sum of choice counts when answered is missing', () => {
    const q = question('q1', {
      answered: undefined,
      choiceDistribution: [
        { label: 'A', count: 6, isCorrect: true },
        { label: 'B', count: 4, isCorrect: false },
      ],
    });
    expect(dominantWrongAnswer(q)?.percent).toBe(40);
  });
});

describe('isQuestionPending', () => {
  it('is pending when incorrectPercent is null (scores not published)', () => {
    expect(isQuestionPending(question('q', { incorrectPercent: null }))).toBe(
      true
    );
  });
  it('treats schema 1 questions without grading fields as scored', () => {
    expect(
      isQuestionPending({
        questionId: 'q',
        text: 'x',
        correctPercent: 50,
        points: 1,
      })
    ).toBe(false);
  });
  it('is pending when incorrectPercent is missing but graded is zero', () => {
    expect(
      isQuestionPending(
        question('q', { incorrectPercent: undefined, graded: 0 })
      )
    ).toBe(true);
  });
});

describe('buildItemAnalysis', () => {
  const unit3 = aggregate('a3', {
    perQuestion: [
      question('q1', { correctPercent: 92, incorrectPercent: 8 }),
      question('q2', {
        correctPercent: 41,
        incorrectPercent: 59,
        choiceDistribution: [
          { label: 'Theme', count: 20, isCorrect: true },
          { label: 'Plot summary', count: 22, isCorrect: false },
          { label: 'Setting', count: 8, isCorrect: false },
        ],
      }),
      question('q3', {
        correctPercent: 41,
        incorrectPercent: 59,
        choiceDistribution: [
          { label: 'Simile', count: 20, isCorrect: true },
          { label: 'Metaphor', count: 15, isCorrect: false },
          { label: 'Idiom', count: 15, isCorrect: false },
        ],
      }),
      question('q4', {
        scoring: 'points',
        points: 4,
        correctPercent: 63,
        incorrectPercent: 37,
      }),
      question('q5', { correctPercent: 0, incorrectPercent: null, graded: 0 }),
      question('q6', { correctPercent: 77, incorrectPercent: 23 }),
      question('q7', { servedCount: 3, correctPercent: 10 }),
    ],
  });

  it('sorts reteach questions first and tie-breaks by dominant-wrong share', () => {
    const result = buildItemAnalysis(unit3);
    expect(result.questions.map((q) => q.questionId)).toEqual([
      'q2',
      'q3',
      'q4',
      'q6',
      'q1',
      'q5',
    ]);
    expect(
      result.questions.filter((q) => q.reteach).map((q) => q.number)
    ).toEqual([2, 3, 4]);
    expect(result.reteachCount).toBe(3);
  });

  it('keeps 1-based quiz numbers and the dominant wrong answer', () => {
    const q2 = buildItemAnalysis(unit3).questions[0];
    expect(q2).toMatchObject({
      questionId: 'q2',
      number: 2,
      correctPercent: 41,
      status: 'scored',
      dominantWrong: { label: 'Plot summary', count: 22, percent: 44 },
    });
  });

  it('marks unpublished questions pending with a null percent, never 0, and never reteach', () => {
    const q5 = buildItemAnalysis(unit3).questions.find(
      (q) => q.questionId === 'q5'
    );
    expect(q5).toMatchObject({
      status: 'pending',
      correctPercent: null,
      reteach: false,
    });
  });

  it('keeps points scoring so the UI can say "% of points"', () => {
    const q4 = buildItemAnalysis(unit3).questions.find(
      (q) => q.questionId === 'q4'
    );
    expect(q4).toMatchObject({ scoring: 'points', correctPercent: 63 });
    expect(q4?.dominantWrong).toBeUndefined();
  });

  it('hides questions served to fewer than five students', () => {
    const result = buildItemAnalysis(unit3);
    expect(result.questions.some((q) => q.questionId === 'q7')).toBe(false);
    expect(result.hiddenLowSampleCount).toBe(1);
  });

  it('only flags questions below the proficient cutoff, up to the limit', () => {
    expect(
      buildItemAnalysis(unit3, { reteachLimit: 2 })
        .questions.filter((q) => q.reteach)
        .map((q) => q.questionId)
    ).toEqual(['q2', 'q3']);
    expect(
      buildItemAnalysis(unit3, { reteachBelowPercent: 50 }).reteachCount
    ).toBe(2);
    const strong = aggregate('a', {
      perQuestion: [question('q1', { correctPercent: 95 })],
    });
    expect(buildItemAnalysis(strong).reteachCount).toBe(0);
  });

  it('builds the headline from team counts', () => {
    expect(buildItemAnalysis(unit3).headline).toEqual({
      teamAveragePercent: 74,
      participation: { scoredStudents: 50, totalStudents: 60, percent: 83 },
      contributorCount: 3,
    });
  });

  it('reports everything pending before any scores are published', () => {
    const unpublished = aggregate('a', {
      scoredStudentCount: 0,
      teamAveragePercent: 0,
      perQuestion: [
        question('q1', {
          correctPercent: 0,
          incorrectPercent: null,
          graded: 0,
        }),
      ],
    });
    const result = buildItemAnalysis(unpublished);
    expect(result.headline.teamAveragePercent).toBeNull();
    expect(result.headline.participation.percent).toBe(0);
    expect(result.questions[0].status).toBe('pending');
    expect(result.reteachCount).toBe(0);
  });

  it('handles a schema 1 aggregate missing every optional field', () => {
    const result = buildItemAnalysis(legacyAggregate('old'));
    expect(result.headline).toEqual({
      teamAveragePercent: 68,
      participation: { scoredStudents: null, totalStudents: 44, percent: null },
      contributorCount: 2,
    });
    expect(result.questions).toEqual([
      {
        questionId: 'l1',
        text: 'Legacy one',
        number: 1,
        scoring: 'binary',
        status: 'scored',
        correctPercent: 55,
        answered: 0,
        reteach: true,
      },
      {
        questionId: 'l2',
        text: 'Legacy two',
        number: 2,
        scoring: 'binary',
        status: 'scored',
        correctPercent: 90,
        answered: 0,
        reteach: false,
      },
    ]);
  });

  it('falls back to teacherCount when contributor uids are empty', () => {
    const result = buildItemAnalysis(
      aggregate('a', { contributorUids: [], teacherCount: 4 })
    );
    expect(result.headline.contributorCount).toBe(4);
  });
});

describe('buildScoreDistribution', () => {
  it('orders bands low to high with shares and a y-axis max', () => {
    const result = buildScoreDistribution(
      aggregate('a', {
        scoreDistribution: [
          { min: 90, max: 100, count: 10 },
          { min: 80, max: 89, count: 15 },
          { min: 60, max: 79, count: 20 },
          { min: 0, max: 59, count: 5 },
        ],
      })
    );
    expect(result.status).toBe('ready');
    expect(result.total).toBe(50);
    expect(result.maxShare).toBeCloseTo(0.4);
    expect(result.bands.map((b) => [b.min, b.max, b.count, b.percent])).toEqual(
      [
        [0, 59, 5, 10],
        [60, 79, 20, 40],
        [80, 89, 15, 30],
        [90, 100, 10, 20],
      ]
    );
    expect(result.bands[3].label).toBe('90–100%');
  });

  it('fills bands the server omitted with zero', () => {
    const result = buildScoreDistribution(
      aggregate('a', { scoreDistribution: [{ min: 90, max: 100, count: 4 }] })
    );
    expect(result.bands.map((b) => b.count)).toEqual([0, 0, 0, 4]);
    expect(result.bands[3].share).toBe(1);
  });

  it('is pending when scored but the aggregate predates bands', () => {
    const result = buildScoreDistribution(aggregate('a', { schemaVersion: 5 }));
    expect(result.status).toBe('pending');
    expect(result.total).toBe(0);
    expect(result.bands.every((b) => b.count === 0)).toBe(true);
  });

  it('is empty before any scores publish', () => {
    expect(
      buildScoreDistribution(
        aggregate('a', {
          scoredStudentCount: 0,
          scoreDistribution: [{ min: 0, max: 59, count: 0 }],
        })
      ).status
    ).toBe('empty');
  });

  it('treats a schema 1 doc with students as scored but pending bands', () => {
    expect(buildScoreDistribution(legacyAggregate('old')).status).toBe(
      'pending'
    );
  });
});

describe('dateAggregates', () => {
  it('uses the assessment date, falls back to ranAt, and drops trashed or undatable', () => {
    const dated = dateAggregates(
      [
        aggregate('late', { ranAt: 1 }),
        aggregate('orphan', { ranAt: SEPT_22 }),
        aggregate('pendingRanAt', { ranAt: 0 }),
        aggregate('trashed'),
        aggregate('early', { ranAt: 9e12 }),
      ],
      [
        assessment('late', { opensAt: OCT_6 }),
        assessment('early', { dueAt: SEPT_8 }),
        assessment('trashed', { deletedAt: SEPT_22 }),
      ]
    );
    expect(dated.map((d) => [d.aggregate.assessmentId, d.dateSource])).toEqual([
      ['early', 'assessment'],
      ['orphan', 'ranAt'],
      ['late', 'assessment'],
    ]);
  });
});

describe('buildTeamTrend', () => {
  it('orders by assessment date, skips unscored, and reports change', () => {
    const trend = buildTeamTrend(
      [
        aggregate('u3', { teamAveragePercent: 81 }),
        aggregate('u1', { teamAveragePercent: 70 }),
        aggregate('u2', { scoredStudentCount: 0, teamAveragePercent: 0 }),
        aggregate('u2b', { teamAveragePercent: 64 }),
      ],
      [
        assessment('u1', { opensAt: SEPT_8, title: 'Unit 1 CFA' }),
        assessment('u2', { opensAt: SEPT_22 }),
        assessment('u2b', { opensAt: SEPT_22 + 1 }),
        assessment('u3', { opensAt: OCT_6 }),
      ]
    );
    expect(
      trend.map((p) => [p.assessmentId, p.teamAveragePercent, p.change])
    ).toEqual([
      ['u1', 70, null],
      ['u2b', 64, -6],
      ['u3', 81, 17],
    ]);
    expect(trend[0]).toMatchObject({
      title: 'Unit 1 CFA',
      date: SEPT_8,
      scoredStudents: 50,
    });
  });

  it('includes legacy aggregates and uses the aggregate title without a record', () => {
    const trend = buildTeamTrend([legacyAggregate('old')], []);
    expect(trend).toEqual([
      {
        assessmentId: 'old',
        title: '',
        date: SEPT_8,
        dateSource: 'ranAt',
        teamAveragePercent: 68,
        scoredStudents: null,
        change: null,
      },
    ]);
    expect(
      buildTeamTrend([aggregate('x', { ranAt: SEPT_8 })], [])[0].title
    ).toBe('Aggregate x');
  });

  it('is empty with no aggregates', () => {
    expect(buildTeamTrend([], [assessment('a')])).toEqual([]);
  });
});

describe('buildParticipation', () => {
  it('counts teachers and students per assessment, newest first, with no names', () => {
    const result = buildParticipation({
      aggregates: [
        aggregate('u1', { contributorUids: ['t1', 't2'] }),
        aggregate('u2', {
          contributorUids: ['t1', 'outsider'],
          studentCount: 30,
          scoredStudentCount: 12,
        }),
      ],
      assessments: [
        assessment('u1', { opensAt: SEPT_8 }),
        assessment('u2', { opensAt: SEPT_22 }),
        assessment('u3', { opensAt: OCT_6 }),
        assessment('gone', { opensAt: OCT_6, deletedAt: OCT_6 }),
      ],
      teacherUids: ['t1', 't2', 't3'],
    });
    expect(result.rows).toEqual([
      {
        assessmentId: 'u3',
        title: 'Unit u3',
        date: OCT_6,
        teachersRan: 0,
        teachersExpected: 3,
        students: { scoredStudents: 0, totalStudents: 0, percent: null },
      },
      {
        assessmentId: 'u2',
        title: 'Unit u2',
        date: SEPT_22,
        teachersRan: 2,
        teachersExpected: 4,
        students: { scoredStudents: 12, totalStudents: 30, percent: 40 },
      },
      {
        assessmentId: 'u1',
        title: 'Unit u1',
        date: SEPT_8,
        teachersRan: 2,
        teachersExpected: 3,
        students: { scoredStudents: 50, totalStudents: 60, percent: 83 },
      },
    ]);
    expect(result.assessmentsRun).toBe(2);
    expect(result.totalScoredStudents).toBe(62);
    expect(JSON.stringify(result)).not.toContain('t1');
  });

  it('filters by since and tolerates legacy aggregates', () => {
    const result = buildParticipation({
      aggregates: [legacyAggregate('old')],
      assessments: [
        assessment('old', { opensAt: SEPT_22 }),
        assessment('older', { opensAt: SEPT_8 }),
      ],
      teacherUids: ['t1'],
      since: SEPT_22,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      teachersRan: 2,
      teachersExpected: 2,
      students: { scoredStudents: null, totalStudents: 44, percent: null },
    });
    expect(result.totalScoredStudents).toBe(0);
  });
});

describe('buildMasteryByTarget', () => {
  const targets: LearningTarget[] = [
    {
      id: 'lt-theme',
      code: 'LT1',
      label: 'I can determine a theme',
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: 'lt-old',
      label: 'Retired target',
      archived: true,
      createdAt: 0,
      updatedAt: 0,
    },
  ];
  const assessments = [
    assessment('u1', { opensAt: SEPT_8 }),
    assessment('u2', { opensAt: OCT_6 }),
  ];

  it('returns tagged: false when no aggregate carries target or standard rows', () => {
    expect(
      buildMasteryByTarget(
        [
          aggregate('u1'),
          legacyAggregate('old'),
          aggregate('u2', { perTarget: [], perStandard: [] }),
        ],
        targets,
        { assessments }
      )
    ).toEqual({ tagged: false });
    expect(buildMasteryByTarget([], targets)).toEqual({ tagged: false });
  });

  it('pools target mastery across assessments, weighted by graded answers', () => {
    const result = buildMasteryByTarget(
      [
        aggregate('u2', {
          perTarget: [targetRow('lt-theme', 80, 30)],
        }),
        aggregate('u1', {
          perTarget: [
            targetRow('lt-theme', 50, 10),
            targetRow('rl.6.2', 70, 20, { kind: 'standard' }),
          ],
          perStandard: [
            targetRow('rl.6.2', 70, 20, { kind: 'standard', code: 'RL.6.2' }),
          ],
        }),
      ],
      targets,
      { assessments }
    );
    if (!result.tagged) throw new Error('expected tagged');
    expect(result.cutoffs).toEqual({ proficient: 80, approaching: 60 });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      targetId: 'lt-theme',
      code: 'LT1',
      label: 'I can determine a theme',
      correctPercent: 73,
      attempted: 40,
      lowSample: false,
      band: 'approaching',
      archived: false,
    });
    expect(result.targets[0].points.map((p) => p.assessmentId)).toEqual([
      'u1',
      'u2',
    ]);
    expect(result.standards).toHaveLength(1);
    expect(result.standards[0]).toMatchObject({
      targetId: 'rl.6.2',
      code: 'RL.6.2',
      kind: 'standard',
      band: 'approaching',
    });
  });

  it('shows standards alone when only standards are tagged', () => {
    const result = buildMasteryByTarget(
      [
        aggregate('u1', {
          perStandard: [targetRow('rl.6.1', 88, 25, { kind: 'standard' })],
        }),
      ],
      [],
      { assessments }
    );
    expect(result).toMatchObject({
      tagged: true,
      targets: [],
      standards: [{ targetId: 'rl.6.1', band: 'proficient' }],
    });
  });

  it('sorts worst first with low-sample and ungraded rows last', () => {
    const result = buildMasteryByTarget(
      [
        aggregate('u1', {
          perTarget: [
            targetRow('a', 90, 20),
            targetRow('b', 40, 20),
            targetRow('c', 10, 3),
            targetRow('lt-old', 0, 0),
          ],
        }),
      ],
      targets,
      { assessments, cutoffs: { proficient: 85, approaching: 50 } }
    );
    if (!result.tagged) throw new Error('expected tagged');
    expect(result.targets.map((r) => [r.targetId, r.band])).toEqual([
      ['b', 'beginning'],
      ['a', 'proficient'],
      ['lt-old', null],
      ['c', null],
    ]);
    const old = result.targets.find((r) => r.targetId === 'lt-old');
    expect(old).toMatchObject({
      correctPercent: null,
      archived: true,
      label: 'Retired target',
    });
    expect(old?.code).toBe('LT-OLD');
  });

  it('dates by ranAt and keeps the snapshot label without assessments or a live target', () => {
    const result = buildMasteryByTarget(
      [
        aggregate('later', {
          ranAt: OCT_6,
          perTarget: [targetRow('x', 60, 10)],
        }),
        aggregate('earlier', {
          ranAt: SEPT_8,
          perTarget: [targetRow('x', 90, 10)],
        }),
      ],
      []
    );
    if (!result.tagged) throw new Error('expected tagged');
    expect(result.targets[0].label).toBe('Snapshot x');
    expect(result.targets[0].points.map((p) => p.assessmentId)).toEqual([
      'earlier',
      'later',
    ]);
    expect(result.targets[0].correctPercent).toBe(75);
  });

  it('drops aggregates for trashed assessments', () => {
    expect(
      buildMasteryByTarget(
        [aggregate('gone', { perTarget: [targetRow('x', 60, 10)] })],
        [],
        { assessments: [assessment('gone', { deletedAt: OCT_6 })] }
      )
    ).toEqual({ tagged: false });
  });
});

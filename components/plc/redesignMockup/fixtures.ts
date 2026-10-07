// Fixture team data for the Teams redesign harness; aggregates run through the real Data overview selectors.

import type {
  LearningTarget,
  PlcActivityEvent,
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
} from '@/utils/plcDataOverview';

const at = (month: number, day: number, hour = 15): number =>
  new Date(2026, month - 1, day, hour).getTime();

export const MOCK_NOW = at(10, 7, 9);

export interface MockMember {
  name: string;
  role: 'Lead' | 'Co-lead' | 'Member';
  online: boolean;
}

export interface MockTeam {
  name: string;
  typeLabel: string;
  whatsNew: number;
  myItems: number;
  members: MockMember[];
  memberCount: number;
}

export const PLC_TEAM: MockTeam = {
  name: '7th Grade Math PLC',
  typeLabel: 'PLC',
  whatsNew: 4,
  myItems: 2,
  memberCount: 5,
  members: [
    { name: 'Priya Shah', role: 'Lead', online: true },
    { name: 'Hannah Olson', role: 'Co-lead', online: true },
    { name: 'Jordan Kim', role: 'Member', online: false },
    { name: 'Elena Ruiz', role: 'Member', online: true },
    { name: 'Marcus Bell', role: 'Member', online: false },
  ],
};

export const DEPT_TEAM: MockTeam = {
  name: 'Middle School Math',
  typeLabel: 'Department',
  whatsNew: 3,
  myItems: 1,
  memberCount: 8,
  members: [
    { name: 'Hannah Olson', role: 'Lead', online: true },
    { name: 'Priya Shah', role: 'Member', online: false },
    { name: 'Jordan Kim', role: 'Member', online: false },
    { name: 'Elena Ruiz', role: 'Member', online: true },
    { name: 'Marcus Bell', role: 'Member', online: false },
    { name: 'Rachel Moen', role: 'Member', online: false },
    { name: 'David Strand', role: 'Member', online: false },
    { name: 'Julie Kraft', role: 'Member', online: false },
  ],
};

export const STAFF = [
  'Erin Walsh',
  'Mark Johnson',
  'Laura Benson',
  'Tom Reyes',
  'Priya Shah',
  'Hannah Olson',
  'Jordan Kim',
  'Elena Ruiz',
  'Marcus Bell',
  'Dana Whitfield',
  'Ben Carlson',
  'Ruth Lindqvist',
  'Greg Hanson',
  'Sofia Martinez',
  'Paula Berg',
  'Mike Sorensen',
  'Janet Wu',
  'Tom Hedlund',
  'Linda Paulsen',
  'Steve Norquist',
  'Anne Dahl',
  'Kim Arneson',
  'Karen Ostrowski',
  'Rachel Moen',
  'David Strand',
  'Julie Kraft',
];

export const BLDG_TEAM: MockTeam = {
  name: 'Orono Middle School Staff',
  typeLabel: 'Building',
  whatsNew: 2,
  myItems: 1,
  memberCount: 58,
  members: [
    { name: 'Erin Walsh', role: 'Lead', online: true },
    { name: 'Mark Johnson', role: 'Co-lead', online: false },
    ...STAFF.slice(4, 10).map(
      (name): MockMember => ({ name, role: 'Member', online: false })
    ),
  ],
};

export const PAIRS: [string, string][] = [
  ['Dana Whitfield', 'Marcus Lee'],
  ['Karen Ostrowski', 'Tyler Nguyen'],
  ['Ben Carlson', 'Aisha Mohamed'],
  ['Ruth Lindqvist', 'Sam Patel'],
  ['Greg Hanson', 'Emily Tran'],
  ['Sofia Martinez', 'Noah Fischer'],
  ['Paula Berg', 'Chris Adeyemi'],
  ['Mike Sorensen', 'Leah Johansson'],
  ['Janet Wu', 'Owen Becker'],
  ['Tom Hedlund', 'Maya Ortiz'],
  ['Linda Paulsen', 'Jacob Erickson'],
  ['Steve Norquist', 'Grace Kowalski'],
  ['Anne Dahl', 'Luis Romero'],
  ['Kim Arneson', 'Zoe Hartley'],
];

export const MENT_TEAM: MockTeam = {
  name: 'New Teacher Mentoring 2026-27',
  typeLabel: 'Mentoring program',
  whatsNew: 2,
  myItems: 1,
  memberCount: 30,
  members: [
    { name: 'Laura Benson', role: 'Lead', online: true },
    { name: 'Tom Reyes', role: 'Co-lead', online: false },
    ...PAIRS.slice(0, 3)
      .flat()
      .map((name): MockMember => ({ name, role: 'Member', online: false })),
  ],
};

// Common assessments

const TEACHERS = ['t1', 't2', 't3', 't4', 't5'];
const STUDENTS = 140;

function assessment(
  id: string,
  title: string,
  opensAt: number,
  status: PlcCommonAssessment['status'] = 'closed'
): PlcCommonAssessment {
  return {
    id,
    title,
    kind: 'quiz',
    syncGroupId: `group-${id}`,
    status,
    opensAt,
    createdBy: 't1',
    createdAt: opensAt,
    updatedAt: opensAt,
  };
}

export const ASSESSMENTS: PlcCommonAssessment[] = [
  assessment('diag', 'Fall Diagnostic', at(9, 5)),
  assessment('u1', 'Unit 1 Rational Numbers CFA', at(9, 12)),
  assessment('u2', 'Unit 2 Expressions CFA', at(9, 24)),
  assessment('u3', 'Unit 3 Ratios CFA', at(10, 3)),
  assessment('u4', 'Unit 4 Proportions Quick Check', at(10, 6), 'reviewing'),
];

export const SHORT_TITLES: Record<string, string> = {
  diag: 'Diagnostic',
  u1: 'Unit 1',
  u2: 'Unit 2',
  u3: 'Unit 3',
  u4: 'Unit 4 QC',
};

// [question text, % correct, most common wrong answer, its %, target]
const U3_QUESTIONS: [string, number, string, number, string][] = [
  ['Ratio language', 92, '5 to 3', 5, '7.RP.1'],
  ['Equivalent ratios table', 88, 'Added 4 to each row', 7, '7.RP.2a'],
  ['Unit price', 84, '$0.48 per can', 9, '7.RP.1'],
  ['Unit rate with fractions', 46, '4/3 mi per hr', 38, '7.RP.1'],
  ['Complex fraction rate', 39, '1/8', 41, '7.RP.1'],
  ['Is the table proportional?', 77, 'Yes, values increase', 14, '7.RP.2a'],
  ['Graph through the origin', 58, 'Any straight line', 27, '7.RP.2a'],
  ['Constant from a graph', 73, 'The y-intercept', 18, '7.RP.2b'],
  ['Constant from a table', 81, 'x divided by y', 11, '7.RP.2b'],
  ['Write y = kx', 70, 'y = x + k', 19, '7.RP.2c'],
  ['Meaning of the point (1, r)', 52, 'The x-value', 31, '7.RP.2b'],
  ['Percent increase', 64, 'The new amount', 22, '7.RP.3'],
  ['Markup', 69, 'Subtracted the markup', 17, '7.RP.3'],
  ['Tax and tip', 79, 'Tip before tax', 12, '7.RP.3'],
  ['Percent error', 61, 'Divided by the estimate', 25, '7.RP.3'],
  ['Simple interest', 74, 'Months as years', 15, '7.RP.3'],
  ['Scale drawing', 83, 'Scaled area by the factor', 10, '7.RP.2a'],
  ['Multi-step percent', 66, 'Stopped after one step', 20, '7.RP.3'],
];

const U3_ANSWERED = 132;

export const LEARNING_TARGETS: LearningTarget[] = [
  ['7.RP.1', 'Unit rates, including with fractions'],
  ['7.RP.2a', 'Decide if two quantities are proportional'],
  ['7.RP.2b', 'Find the constant of proportionality'],
  ['7.RP.2c', 'Write equations for proportions'],
  ['7.RP.3', 'Solve multi-step percent problems'],
].map(([code, label]) => ({
  id: code,
  code,
  label,
  createdAt: at(8, 28),
  updatedAt: at(8, 28),
}));

const u3PerQuestion: PlcAssessmentAggregate['perQuestion'] = U3_QUESTIONS.map(
  ([text, pct, wrong, wrongPct], i) => {
    const correct = Math.round((pct / 100) * U3_ANSWERED);
    const dominant = Math.round((wrongPct / 100) * U3_ANSWERED);
    const rest = Math.max(0, U3_ANSWERED - correct - dominant);
    const otherA = Math.ceil(rest / 2);
    return {
      questionId: `q${i + 1}`,
      text,
      scoring: 'binary',
      correctPercent: pct,
      points: 1,
      incorrectPercent: 100 - pct,
      answered: U3_ANSWERED,
      graded: U3_ANSWERED,
      correct,
      servedCount: U3_ANSWERED,
      choiceDistribution: [
        { label: 'Correct answer', count: correct, isCorrect: true },
        { label: wrong, count: dominant, isCorrect: false },
        { label: 'Other choice A', count: otherA, isCorrect: false },
        { label: 'Other choice B', count: rest - otherA, isCorrect: false },
      ].filter((row) => row.count > 0 || row.isCorrect),
    };
  }
);

export const U3_TARGET_OF: Record<string, string> = Object.fromEntries(
  U3_QUESTIONS.map(([, , , , target], i) => [`q${i + 1}`, target])
);

const TARGET_PERCENT: Record<string, number> = {
  '7.RP.1': 54,
  '7.RP.2a': 82,
  '7.RP.2b': 63,
  '7.RP.2c': 70,
  '7.RP.3': 58,
};

const u3PerTarget: PlcAggregateTargetRow[] = LEARNING_TARGETS.map((t) => {
  const qIdx = U3_QUESTIONS.flatMap(([, , , , target], i) =>
    target === t.code ? [i] : []
  );
  const correctPercent = TARGET_PERCENT[t.id] ?? 0;
  return {
    targetId: t.id,
    kind: 'plc',
    code: t.code,
    label: t.label,
    questionIds: qIdx.map((i) => `q${i + 1}`),
    attempted: U3_ANSWERED * qIdx.length,
    correctPercent,
    lowSample: false,
  };
});

function aggregate(
  id: string,
  average: number,
  scored: number,
  parts: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  const title = ASSESSMENTS.find((a) => a.id === id)?.title;
  return {
    assessmentId: id,
    schemaVersion: 6,
    ...(title ? { title } : {}),
    kind: 'quiz',
    teacherCount: TEACHERS.length,
    studentCount: STUDENTS,
    teamAveragePercent: average,
    scoredStudentCount: scored,
    linkedSessionCount: 10,
    publishedSessionCount: 10,
    perQuestion: [],
    contributorUids: TEACHERS,
    ranAt: at(10, 6),
    ...parts,
  };
}

const U3_AGGREGATE = aggregate('u3', 71, U3_ANSWERED, {
  perQuestion: u3PerQuestion,
  scoreDistribution: [
    { min: 0, max: 59, count: 39 },
    { min: 60, max: 79, count: 53 },
    { min: 80, max: 89, count: 25 },
    { min: 90, max: 100, count: 15 },
  ],
  perTarget: u3PerTarget,
});

export const AGGREGATES: PlcAssessmentAggregate[] = [
  aggregate('diag', 52, 137),
  aggregate('u1', 64, 135),
  aggregate('u2', 68, 134),
  U3_AGGREGATE,
  aggregate('u4', 74, 123, { contributorUids: TEACHERS.slice(0, 4) }),
];

const untag = (a: PlcAssessmentAggregate): PlcAssessmentAggregate => {
  const copy = { ...a };
  delete copy.perTarget;
  delete copy.perStandard;
  return copy;
};

/** Real selector output for the PLC Data overview. */
export function plcOverviewData(tagged: boolean) {
  const aggregates = tagged ? AGGREGATES : AGGREGATES.map(untag);
  const u3 = aggregates.find((a) => a.assessmentId === 'u3') ?? U3_AGGREGATE;
  return {
    pinned: ASSESSMENTS[3],
    newer: ASSESSMENTS[4],
    itemAnalysis: buildItemAnalysis(u3),
    distribution: buildScoreDistribution(u3),
    trend: buildTeamTrend(aggregates, ASSESSMENTS),
    participation: buildParticipation({
      aggregates,
      assessments: ASSESSMENTS,
      teacherUids: TEACHERS,
    }),
    mastery: buildMasteryByTarget(aggregates, LEARNING_TARGETS, {
      assessments: ASSESSMENTS,
    }),
  };
}

export type PlcOverviewData = ReturnType<typeof plcOverviewData>;

export const ACTIVITY: PlcActivityEvent[] = [
  {
    id: 'a1',
    type: 'assessment_results_ready',
    actorUid: 't1',
    actorName: 'Priya Shah',
    targetType: 'assessment',
    targetId: 'u4',
    targetTitle: 'Unit 4 Proportions Quick Check',
    createdAt: at(10, 6, 16),
  },
  {
    id: 'a2',
    type: 'note_created',
    actorUid: 't3',
    actorName: 'Jordan Kim',
    targetType: 'note',
    targetTitle: 'PLC meeting Oct 9',
    createdAt: at(10, 6, 11),
  },
  {
    id: 'a3',
    type: 'comment_added',
    actorUid: 't4',
    actorName: 'Elena Ruiz',
    targetType: 'assessment',
    targetTitle: 'Unit 3 Ratios CFA',
    createdAt: at(10, 5, 14),
  },
  {
    id: 'a4',
    type: 'assessment_shared',
    actorUid: 't5',
    actorName: 'Marcus Bell',
    targetType: 'assessment',
    targetTitle: 'Unit 4 Proportions CFA',
    createdAt: at(10, 4, 10),
  },
  {
    id: 'a5',
    type: 'meeting_held',
    actorUid: 't1',
    actorName: 'Priya Shah',
    targetType: 'meeting',
    targetTitle: 'PLC meeting Oct 2',
    createdAt: at(10, 2, 16),
  },
];

export const LAST_SEEN = at(10, 2, 17);

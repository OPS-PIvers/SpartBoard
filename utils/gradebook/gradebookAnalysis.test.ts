import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFICIENCY_SCALE,
  type FinalScore,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import {
  EMPTY_ANALYSIS_FILTER,
  collectTargets,
  explore,
  filterColumns,
  filterStudents,
  histogramBins,
  mean,
  median,
  proficiencyTable,
  type AnalysisColumn,
  type AnalysisData,
} from '@/utils/gradebook/gradebookAnalysis';
import { buildInsights } from '@/utils/gradebook/gradebookInsights';

const scale = DEFAULT_PROFICIENCY_SCALE;

function scored(pct: number, flags: string[] = []): FinalScore {
  return {
    status: 'scored',
    points: pct,
    max: 100,
    pct,
    source: 'raw',
    flagId: null,
    rawPoints: pct,
    flags: flags.map((id) => ({ id, auto: false })),
    counts: true,
  };
}

function missing(): FinalScore {
  return { ...scored(0, ['missing']), source: 'flag', flagId: 'missing' };
}

const awaiting: FinalScore = {
  ...scored(0),
  status: 'awaiting',
  points: null,
  pct: null,
  counts: false,
};

function row(
  sessionId: string,
  uid: string,
  at: number,
  evidence: [string, number][] = []
): GradeIndexRow {
  return {
    kind: 'quiz',
    sessionId,
    studentUid: uid,
    ownerUid: 't',
    editorUids: [],
    rosterIds: ['r'],
    classIds: [],
    title: sessionId,
    rawPct: null,
    points: null,
    max: 100,
    state: 'scored',
    submittedAt: at,
    dueAt: null,
    openAt: null,
    closeAt: null,
    createdAt: at,
    attempts: [],
    targetEvidence: evidence.map(([targetId, pct]) => ({
      targetId,
      kind: 'standard',
      earned: pct,
      possible: 100,
    })),
    published: true,
    assigned: true,
    updatedAt: at,
  };
}

function column(sessionId: string, categoryId = 'a'): AnalysisColumn {
  return {
    sessionId,
    kind: 'quiz',
    title: sessionId.toUpperCase(),
    sortAt: 0,
    categoryId,
    completionOnly: false,
    ungradedCount: 0,
    config: null,
  };
}

// Ann drops 90 -> 70 -> 60; Ben is missing three; Cy has an awaiting cell.
const finals: Record<string, Record<string, FinalScore>> = {
  ann: { q1: scored(90), q2: scored(70), q3: scored(60) },
  ben: { q1: missing(), q2: missing(), q3: missing() },
  cy: { q1: scored(85), q2: scored(95), q3: awaiting },
};
const evidence: Record<string, [string, number][]> = {
  ann: [['std:RL.1', 40]],
  cy: [['std:RL.1', 90]],
};

const data: AnalysisData = {
  students: [
    { uid: 'ann', studentId: 's-ann', name: 'Avery, Ann' },
    { uid: 'ben', studentId: 's-ben', name: 'Bell, Ben' },
    { uid: 'cy', studentId: 's-cy', name: 'Cole, Cy' },
  ],
  columns: [column('q1'), column('q2'), column('q3', 'b')],
  cell: (sessionId, uid) => ({
    row:
      finals[uid][sessionId].status === 'scored' &&
      finals[uid][sessionId].source === 'raw'
        ? row(sessionId, uid, Number(sessionId.slice(1)), evidence[uid])
        : null,
    final: finals[uid][sessionId],
  }),
  overallPct: () => null,
};

describe('gradebookAnalysis', () => {
  it('computes mean and median ignoring nulls', () => {
    expect(mean([10, null, 20])).toBe(15);
    expect(median([30, 10, null, 20])).toBe(20);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNull();
  });

  it('bins scores at the fixed edges plus the scale cutoffs', () => {
    const bins = histogramBins([10, 55, 80, 99, 120], scale);
    expect(bins.map((b) => b.label)).toEqual([
      '0–50',
      '50–60',
      '60–70',
      '70–80',
      '80–90',
      '90+',
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 0, 0, 1, 2]);
    const custom = histogramBins([], { ...scale, proficient: 75 });
    expect(custom.map((b) => b.label)).toContain('75–80');
  });

  it('filters columns by category and target, students by group and accommodation', () => {
    expect(
      filterColumns(data, { ...EMPTY_ANALYSIS_FILTER, category: 'b' }).map(
        (c) => c.sessionId
      )
    ).toEqual(['q3']);
    expect(
      filterColumns(data, {
        ...EMPTY_ANALYSIS_FILTER,
        target: 'std:RL.1',
      }).length
    ).toBe(3);
    const roster = {
      groups: [{ id: 'g1', name: 'Blue', studentIds: ['s-ann', 's-cy'] }],
      accommodatedIds: new Set(['s-cy']),
    };
    expect(
      filterStudents(
        data,
        { ...EMPTY_ANALYSIS_FILTER, group: 'g1' },
        roster
      ).map((s) => s.uid)
    ).toEqual(['ann', 'cy']);
    expect(
      filterStudents(
        data,
        { ...EMPTY_ANALYSIS_FILTER, accommodation: 'no' },
        roster
      ).map((s) => s.uid)
    ).toEqual(['ann', 'ben']);
    expect(
      filterStudents(
        data,
        { ...EMPTY_ANALYSIS_FILTER, flag: 'missing' },
        roster
      ).map((s) => s.uid)
    ).toEqual(['ben']);
  });

  it('labels targets from the lookup or the id', () => {
    const targets = collectTargets(data, () => undefined);
    expect(targets).toEqual([{ id: 'std:RL.1', code: 'RL.1', label: 'RL.1' }]);
  });

  it('pivots the Explore card', () => {
    const table = proficiencyTable(data, data.columns, 'mean');
    const base = {
      data,
      students: data.students,
      columns: data.columns,
      scale,
      proficiency: table,
      targets: collectTargets(data, () => undefined),
      categories: [
        { id: 'a', name: 'Tests' },
        { id: 'b', name: 'Practice' },
      ],
      groups: [],
      kindLabel: () => 'Quiz',
    };
    const avg = explore({ ...base, metric: 'avg', by: 'category' });
    // Tests: ann 90,70; ben 0,0 (Missing counts); cy 85,95.
    expect(avg[0]).toMatchObject({ label: 'Tests', text: '57%' });
    const miss = explore({ ...base, metric: 'missing', by: 'assignment' });
    expect(miss.map((r) => r.value)).toEqual([1, 1, 1]);
    expect(miss[0].width).toBe(100);
    const top = explore({ ...base, metric: 'top', by: 'target' });
    expect(top[0].text).toBe('50%');
  });
});

describe('buildInsights', () => {
  const table = proficiencyTable(data, data.columns, 'mean');
  const input = {
    data,
    students: data.students,
    columns: data.columns,
    assessmentCategoryId: null,
    targets: collectTargets(data, () => undefined),
    proficiency: table,
    scale,
  };

  it('finds drops, missing work, weak targets and grading to do', () => {
    const out = buildInsights(input);
    expect(out.map((i) => i.id)).toEqual([
      'drop:ann',
      'missing:ben',
      'weak:std:RL.1',
      'grade:q3',
    ]);
    expect(out[0].text).toBe(
      'Avery, Ann dropped 30 points over the last 3 assessments'
    );
    expect(out[2].text).toContain('50% of the class is Beginning');
    expect(out[2].reteachUids).toEqual(['ann']);
    expect(out[3]).toMatchObject({ sensitive: false, sessionId: 'q3' });
  });

  it('scopes to one student for the student view', () => {
    const out = buildInsights({ ...input, onlyUid: 'ann' });
    expect(out.map((i) => i.kind)).toEqual(['drop', 'weak-target']);
    expect(out[1].text).toBe('RL.1 is Beginning (40%)');
  });

  it('only counts the assessment category for drops', () => {
    const out = buildInsights({ ...input, assessmentCategoryId: 'b' });
    expect(out.some((i) => i.kind === 'drop')).toBe(false);
  });
});

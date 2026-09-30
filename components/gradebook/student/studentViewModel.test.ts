import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  resolveFinalScore,
  type GradebookMark,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import {
  categoryGrades,
  comparisonRows,
  median,
  moveCard,
  resolveCardOrder,
  standardsRows,
  trendPoints,
  whatIfOverall,
  workHabits,
  type SvCell,
  type SvColumn,
} from './studentViewModel';

const DAY = 86_400_000;
const NOW = 100 * DAY;

const col = (
  sessionId: string,
  dueDay: number,
  extra: Partial<SvColumn> = {}
): SvColumn => ({
  sessionId,
  kind: 'quiz',
  title: sessionId.toUpperCase(),
  dueAt: dueDay * DAY,
  sortAt: dueDay * DAY,
  max: 10,
  config: null,
  categoryId: 'achievement',
  completionOnly: false,
  ...extra,
});

const row = (
  sessionId: string,
  studentUid: string,
  points: number | null,
  extra: Partial<GradeIndexRow> = {}
): GradeIndexRow => ({
  kind: 'quiz',
  sessionId,
  studentUid,
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r'],
  classIds: ['c'],
  title: sessionId,
  rawPct: points === null ? null : points * 10,
  points,
  max: 10,
  state: points === null ? 'not-attempted' : 'scored',
  submittedAt: points === null ? null : 0,
  dueAt: null,
  openAt: null,
  closeAt: null,
  createdAt: 0,
  attempts: [],
  targetEvidence: [],
  published: true,
  assigned: true,
  updatedAt: 0,
  ...extra,
});

function makeGetter(
  columns: SvColumn[],
  rows: GradeIndexRow[],
  marks: GradebookMark[] = []
) {
  return (sessionId: string, studentUid: string): SvCell => {
    const r =
      rows.find(
        (x) => x.sessionId === sessionId && x.studentUid === studentUid
      ) ?? null;
    const m =
      marks.find(
        (x) => x.sessionId === sessionId && x.studentUid === studentUid
      ) ?? null;
    const c = columns.find((x) => x.sessionId === sessionId) ?? null;
    return {
      row: r,
      mark: m,
      final: resolveFinalScore(r, m, c?.config ?? null, {
        flagDefs: DEFAULT_GRADEBOOK_SETTINGS.flags,
        autoFlags: true,
        now: NOW,
      }),
      published: true,
    };
  };
}

describe('card layout', () => {
  it('drops unknown ids and appends new cards', () => {
    expect(resolveCardOrder(['habits', 'bogus', 'habits'])).toEqual([
      'habits',
      'performance',
      'standards',
      'compare',
      'insights',
      'assignments',
    ]);
  });
  it('moves within bounds only', () => {
    const order = resolveCardOrder(undefined);
    expect(moveCard(order, 'performance', -1)).toBe(order);
    expect(moveCard(order, 'performance', 1).slice(0, 2)).toEqual([
      'habits',
      'performance',
    ]);
  });
});

describe('median', () => {
  it('handles even, odd and empty', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('student view math', () => {
  const columns = [col('a', 10), col('b', 20), col('c', 200)];
  const rows = [
    row('a', 's1', 8),
    row('a', 's2', 6),
    row('a', 's3', 10),
    row('b', 's1', null, { dueAt: 20 * DAY }),
    row('b', 's2', 5, { submittedAt: 21 * DAY, dueAt: 20 * DAY }),
    row('c', 's1', null),
  ];
  const get = makeGetter(columns, rows);
  const uids = ['s1', 's2', 's3'];

  it('trend uses counted percents and the class median', () => {
    const t = trendPoints(columns, get, 's1', uids);
    expect(t.map((p) => p.sessionId)).toEqual(['a', 'b', 'c']);
    expect(t[0]).toMatchObject({ pct: 80, median: 80, fromFlag: false });
    expect(t[1]).toMatchObject({ pct: 0, fromFlag: true });
  });

  it('what-if adds one scored assignment', () => {
    const base = whatIfOverall(columns, get, 's1', false, [], {
      categoryId: 'achievement',
      points: 0,
      max: 0,
    });
    expect(base).toBeNull();
    const pct = whatIfOverall(columns, get, 's1', false, [], {
      categoryId: 'achievement',
      points: 10,
      max: 10,
    });
    expect(pct).toBeCloseTo(((8 + 0 + 10) / 30) * 100);
  });

  it('category grades split by resolved category', () => {
    const cols = [col('a', 10), col('b', 20, { categoryId: 'practice' })];
    const g = categoryGrades(
      cols,
      get,
      's1',
      DEFAULT_GRADEBOOK_SETTINGS.categories
    );
    expect(g.map((x) => x.pct)).toEqual([80, 0]);
  });

  it('work habits count due work only', () => {
    const h = workHabits(columns, get, 's2', NOW);
    expect(h).toMatchObject({ onTime: 1, late: 1, missing: 0 });
    const h1 = workHabits(columns, get, 's1', NOW);
    expect(h1).toMatchObject({ onTime: 1, missing: 1, completionRate: 50 });
  });

  it('comparison excludes the student and future work', () => {
    const c = comparisonRows(columns, get, 's1', uids, NOW);
    expect(c.map((r) => r.sessionId)).toEqual(['a', 'b']);
    expect([...c[0].classmates].sort((x, y) => x - y)).toEqual([60, 100]);
  });

  it('standards combine evidence per target', () => {
    const r2 = [
      row('a', 's1', 8, {
        targetEvidence: [
          { targetId: 'T1', kind: 'standard', earned: 4, possible: 5 },
        ],
        submittedAt: 1,
      }),
      row('b', 's1', 5, {
        targetEvidence: [
          { targetId: 'T1', kind: 'standard', earned: 1, possible: 2 },
        ],
        submittedAt: 2,
      }),
    ];
    const g2 = makeGetter(columns, r2);
    const s = standardsRows(
      columns,
      g2,
      's1',
      'mean',
      DEFAULT_PROFICIENCY_SCALE,
      (id) => `Label ${id}`
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ label: 'Label T1', pct: 65, level: 1 });
    expect(s[0].evidence.map((e) => e.sessionId)).toEqual(['a', 'b']);
  });
});

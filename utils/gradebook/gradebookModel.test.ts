import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  type GradebookColumnConfig,
  type GradebookMark,
  type GradeIndexRow,
} from './gradebookCore';
import {
  buildColumns,
  columnInPeriod,
  formatScore,
  periodForDate,
  sortStudents,
  studentName,
} from './gradebookModel';

const row = (over: Partial<GradeIndexRow>): GradeIndexRow => ({
  kind: 'quiz',
  sessionId: 's1',
  studentUid: 'u1',
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: [],
  title: 'Quiz',
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: 1,
  dueAt: null,
  openAt: null,
  closeAt: null,
  createdAt: 100,
  attempts: [],
  targetEvidence: [],
  published: true,
  assigned: true,
  updatedAt: 1,
  ...over,
});

describe('buildColumns', () => {
  it('orders by due, then open, then created date (D18, D19)', () => {
    const cols = buildColumns(
      [
        row({ sessionId: 'a', dueAt: 300 }),
        row({ sessionId: 'b', dueAt: null, openAt: 200 }),
        row({ sessionId: 'c', createdAt: 50 }),
      ],
      new Map(),
      new Map(),
      'r1',
      DEFAULT_GRADEBOOK_SETTINGS
    );
    expect(cols.map((c) => c.sessionId)).toEqual(['c', 'b', 'a']);
  });

  it('marks unpublished and ungraded work and honours per-student publish', () => {
    const mark = {
      sessionId: 's1',
      studentUid: 'u1',
      publishOverride: 'published',
    } as GradebookMark;
    const [col] = buildColumns(
      [
        row({ published: false }),
        row({ studentUid: 'u2', state: 'awaiting-grade', points: null }),
      ],
      new Map(),
      new Map([['s1__u1', mark]]),
      'r1',
      DEFAULT_GRADEBOOK_SETTINGS
    );
    expect(col.hasUnpublished).toBe(false);
    expect(col.ungradedCount).toBe(1);
  });

  it('reads max, category and hidden state from the column config', () => {
    const config = {
      sessionId: 's1',
      maxPointsOverride: 20,
      category: 'practice',
      hiddenInRosterIds: ['r1'],
    } as GradebookColumnConfig;
    const [col] = buildColumns(
      [row({}), row({ studentUid: 'u2' })],
      new Map([['s1', config]]),
      new Map(),
      'r1',
      DEFAULT_GRADEBOOK_SETTINGS
    );
    expect(col).toMatchObject({
      max: 20,
      categoryId: 'practice',
      hidden: true,
    });
    const [plain] = buildColumns(
      [row({})],
      new Map(),
      new Map(),
      'r1',
      DEFAULT_GRADEBOOK_SETTINGS
    );
    expect(plain).toMatchObject({
      max: 10,
      categoryId: 'achievement',
      hidden: false,
    });
  });
});

describe('periods', () => {
  const periods = [
    { id: 'q1', label: 'Q1', start: '2026-09-01', end: '2026-10-31' },
    { id: 'q2', label: 'Q2', start: '2026-11-01', end: '2027-01-20' },
  ];
  it('finds the period for a local date, ends inclusive', () => {
    expect(
      periodForDate(periods, new Date(2026, 9, 31, 23).getTime())?.id
    ).toBe('q1');
    expect(
      periodForDate(periods, new Date(2026, 10, 1, 0, 5).getTime())?.id
    ).toBe('q2');
    expect(periodForDate(periods, new Date(2026, 6, 1).getTime())).toBeNull();
  });
  it('treats no period as all periods', () => {
    expect(columnInPeriod({ sortAt: 0 }, null)).toBe(true);
    expect(
      columnInPeriod({ sortAt: new Date(2026, 9, 1).getTime() }, periods[1])
    ).toBe(false);
  });
});

describe('sortStudents', () => {
  const list = [
    { uid: 'a', firstName: 'Zoe', lastName: 'Adams' },
    { uid: 'b', firstName: 'Amy', lastName: 'Baker' },
    { uid: 'c', firstName: 'Max', lastName: 'Cole' },
  ];
  const scores: Record<string, number | null> = { a: 70, b: null, c: 90 };
  const lookups = {
    overall: (u: string) => scores[u],
    column: (_s: string, u: string) => scores[u],
    missing: (u: string) => (u === 'b' ? 2 : 0),
    hasFlag: () => 0,
    inGroup: (_g: string, u: string) => u === 'c',
  };
  const order = (sort: Parameters<typeof sortStudents>[1]) =>
    sortStudents(list, sort, lookups).map((s) => s.uid);

  it('sorts by last or first name', () => {
    expect(order({ key: 'last', dir: 'asc', ref: null })).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(order({ key: 'last', dir: 'desc', ref: null })).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(order({ key: 'first', dir: 'asc', ref: null })).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
  it('keeps empty scores last in both directions', () => {
    expect(order({ key: 'overall', dir: 'desc', ref: null })).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(order({ key: 'column', dir: 'asc', ref: 's1' })).toEqual([
      'a',
      'c',
      'b',
    ]);
  });
  it('sorts by missing count and group', () => {
    expect(order({ key: 'missing', dir: 'desc', ref: null })[0]).toBe('b');
    expect(order({ key: 'group', dir: 'asc', ref: 'g' })[0]).toBe('c');
  });
});

describe('display helpers', () => {
  it('formats names every way', () => {
    const s = { firstName: 'Ana', lastName: 'Ruiz' };
    expect(studentName(s, 'last-first')).toBe('Ruiz, Ana');
    expect(studentName(s, 'first-last')).toBe('Ana Ruiz');
    expect(studentName(s, 'last-only')).toBe('Ruiz');
    expect(studentName(s, 'first-only')).toBe('Ana');
    expect(studentName({ firstName: 'Ana', lastName: '' }, 'last-first')).toBe(
      'Ana'
    );
  });
  it('formats percent or points', () => {
    const final = { pct: 85, points: 8.5, max: 10 } as Parameters<
      typeof formatScore
    >[0];
    expect(formatScore(final, 'percent')).toBe('85%');
    expect(formatScore(final, 'points')).toBe('8.5/10');
  });
});

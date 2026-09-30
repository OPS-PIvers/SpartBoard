import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADEBOOK_FLAGS,
  type FinalScore,
} from '@/utils/gradebook/gradebookCore';
import {
  buildGradebookExportRows,
  DEFAULT_EXPORT_OPTIONS,
  exportTitle,
  type GradebookExportView,
} from './gradebookExport';
import { gradebookRowsToCsv } from './gradebookExportFiles';

const blank: FinalScore = {
  status: 'empty',
  points: null,
  max: null,
  pct: null,
  source: null,
  flagId: null,
  rawPoints: null,
  flags: [],
  counts: false,
};
const scored = (points: number, max: number, flags: string[] = []) => ({
  ...blank,
  status: 'scored' as const,
  points,
  max,
  pct: (points / max) * 100,
  source: 'raw' as const,
  flags: flags.map((id) => ({ id, auto: false })),
  counts: true,
});

const cells: Record<string, FinalScore> = {
  's1|quiz': scored(7.25, 10),
  's1|wall': { ...blank, status: 'complete' },
  's2|quiz': {
    ...scored(0, 10, ['missing']),
    source: 'flag',
    flagId: 'missing',
  },
  's2|wall': blank,
  's3|quiz': {
    ...blank,
    status: 'excluded',
    flags: [{ id: 'excused', auto: false }],
  },
  's3|wall': blank,
  's4|quiz': { ...blank, status: 'awaiting' },
  's4|wall': blank,
};

const view: GradebookExportView = {
  students: [
    { uid: 's1', firstName: 'Ada', lastName: 'Lovelace' },
    { uid: 's2', firstName: 'Alan', lastName: 'Turing' },
    { uid: 's3', firstName: 'Grace', lastName: 'Hopper' },
    { uid: 's4', firstName: 'Cher', lastName: '' },
  ],
  columns: [
    { sessionId: 'quiz', title: 'Unit 1', kind: 'quiz', max: 10 },
    { sessionId: 'wall', title: 'Opener', kind: 'activity-wall', max: null },
  ],
  cell: (uid, sid) => cells[`${uid}|${sid}`],
  overall: (uid) =>
    uid === 's1' ? { pct: 72.5, points: 7.25, max: 10 } : null,
  flagDefs: DEFAULT_GRADEBOOK_FLAGS,
};

describe('buildGradebookExportRows', () => {
  it('writes percent, flag codes and "Last, First" by default', () => {
    expect(buildGradebookExportRows(view, DEFAULT_EXPORT_OPTIONS)).toEqual([
      ['Student', 'Unit 1 (%)', 'Opener', 'Overall (%)'],
      ['Lovelace, Ada', 73, 'Done', 73],
      ['Turing, Alan', '0 M', '', ''],
      ['Hopper, Grace', 'X', '', ''],
      ['Cher', 'Ungraded', '', ''],
    ]);
  });

  it('writes points, first-last names and no flags when asked', () => {
    const rows = buildGradebookExportRows(view, {
      nameFormat: 'first-last',
      scoreFormat: 'points',
      flagsAsCodes: false,
    });
    expect(rows[0]).toEqual([
      'Student',
      'Unit 1 (10)',
      'Opener',
      'Overall (points)',
    ]);
    expect(rows[1]).toEqual(['Ada Lovelace', 7.3, 'Done', '7.3/10']);
    expect(rows[2]).toEqual(['Alan Turing', 0, '', '']);
    expect(rows[3]).toEqual(['Grace Hopper', 'Excused', '', '']);
  });

  it('skips codes for flags switched off in the settings', () => {
    const rows = buildGradebookExportRows(
      {
        ...view,
        flagDefs: DEFAULT_GRADEBOOK_FLAGS.map((f) =>
          f.id === 'missing' ? { ...f, visibility: 'off' as const } : f
        ),
      },
      DEFAULT_EXPORT_OPTIONS
    );
    expect(rows[2][1]).toBe(0);
  });
});

describe('gradebookRowsToCsv', () => {
  it('quotes commas and neutralises formulas', () => {
    expect(
      gradebookRowsToCsv([
        ['Student', '=SUM(A1)'],
        ['Lovelace, Ada', 90],
      ])
    ).toBe('Student,\'=SUM(A1)\r\n"Lovelace, Ada",90');
  });
});

describe('exportTitle', () => {
  it('names the file after the class and the local date', () => {
    expect(exportTitle('Period 3', new Date(2026, 8, 30, 23, 30))).toBe(
      'Period 3 grades 2026-09-30'
    );
  });
});

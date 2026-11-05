import { describe, expect, it } from 'vitest';
import type { ClassRoster, PaperBatch } from '@/types';
import {
  reprintBlocker,
  reprintClasses,
  reprintSheets,
} from '@/utils/paperReprint';

const roster = (id: string, ids: string[]): ClassRoster => ({
  id,
  name: `Class ${id}`,
  driveFileId: null,
  studentCount: ids.length,
  createdAt: 0,
  students: ids.map((s) => ({
    id: s,
    firstName: s.toUpperCase(),
    lastName: 'Lee',
    pin: s,
  })),
});

const ROSTERS = [roster('r1', ['a', 'b']), roster('r2', ['c'])];

const BATCH: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-1',
  rosterIds: ['r1', 'r2'],
  questionCount: 2,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 'a' },
    2: { rosterId: 'r1', studentId: 'gone' },
    3: { rosterId: 'r2', studentId: 'c' },
    4: { rosterId: 'r1', studentId: 'b' },
  },
  spareSeats: [5],
  choiceOrder: { q1: ['x', 'y'], q2: ['z', 'w'] },
  pagesPerSheet: 1,
  createdAt: 0,
};

describe('paperReprint', () => {
  it('lists seated students by class in seat order, skipping ones no longer on a roster', () => {
    const classes = reprintClasses(BATCH, ROSTERS);
    expect(
      classes.map((c) => [c.roster.id, c.seats.map((s) => s.seat)])
    ).toEqual([
      ['r1', [1, 4]],
      ['r2', [3]],
    ]);
  });

  it('keeps each picked student on their original seat', () => {
    const sheets = reprintSheets(reprintClasses(BATCH, ROSTERS), new Set([4]));
    expect(sheets).toEqual([
      {
        seat: 4,
        student: { rosterId: 'r1', studentId: 'b' },
        displayName: 'Lee, B',
        className: 'Class r1',
        isKeySheet: false,
      },
    ]);
  });

  it('blocks a stack whose quiz changed or that printed in versions', () => {
    const rows = [{ questionId: 'q1' }, { questionId: 'q2' }];
    expect(reprintBlocker(BATCH, { rows } as never)).toBeNull();
    expect(
      reprintBlocker(BATCH, { rows: [...rows, { questionId: 'q3' }] } as never)
    ).toBe('changed');
    expect(
      reprintBlocker(BATCH, {
        rows: [{ questionId: 'q1' }, { questionId: 'q9' }],
      } as never)
    ).toBe('changed');
    expect(
      reprintBlocker(
        {
          ...BATCH,
          versions: [{ label: 'Version A', servedQuestionIds: [], swaps: {} }],
        },
        { rows } as never
      )
    ).toBe('versions');
  });
});

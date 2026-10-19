import { describe, expect, it } from 'vitest';
import type { Rubric, Student } from '@/types';
import { planScoredWork } from './scoredWorkPlan';

const rubric = {
  id: 'r',
  title: 'R',
  criteria: [],
  createdAt: 0,
  updatedAt: 0,
} as Rubric;
const student = (id: string, first: string, last: string): Student => ({
  id,
  firstName: first,
  lastName: last,
  pin: '01',
});

describe('planScoredWork', () => {
  it('gives every copy a unique seat and keeps names out of the record', () => {
    const { work, sheets } = planScoredWork({
      id: 'w',
      title: 'Quiz',
      rubric,
      selections: [
        {
          roster: { id: 'r1', name: 'P1' },
          students: [student('s1', 'Ann', 'Lee'), student('s2', 'Bo', 'Kim')],
        },
        {
          roster: { id: 'r2', name: 'P2' },
          students: [student('s3', 'Cy', 'Ng')],
        },
      ],
      spareCount: 2,
      pageCount: 2,
      now: 5,
    });
    expect(sheets.map((s) => s.seat)).toEqual([1, 2, 3, 4, 5]);
    expect(work.seats[3]).toEqual({ rosterId: 'r2', studentId: 's3' });
    expect(work.spareSeats).toEqual([4, 5]);
    expect(JSON.stringify(work)).not.toContain('Lee');
    expect(sheets[0].displayName).toBe('Lee, Ann');
  });

  it('rejects a page count the marker cannot hold', () => {
    const base = {
      id: 'w',
      title: 'T',
      rubric,
      selections: [],
      spareCount: 0,
      now: 0,
    };
    expect(() => planScoredWork({ ...base, pageCount: 0 })).toThrow(RangeError);
    expect(() => planScoredWork({ ...base, pageCount: 64 })).toThrow(
      RangeError
    );
  });
});

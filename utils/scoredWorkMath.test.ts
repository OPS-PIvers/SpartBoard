import { describe, expect, it } from 'vitest';
import type { Rubric } from '@/types';
import {
  buildScoreDoc,
  cleanLevels,
  isFullyScored,
  percentOf,
  rubricMaxPoints,
  scoreTotals,
} from './scoredWorkMath';

const level = (id: string, points: number) => ({ id, label: id, points });
const rubric: Rubric = {
  id: 'r',
  title: 'Essay',
  criteria: [
    {
      id: 'a',
      name: 'Thesis',
      levels: [level('a0', 0), level('a1', 2), level('a2', 4)],
    },
    { id: 'b', name: 'Evidence', levels: [level('b0', 1), level('b1', 3)] },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('scoredWorkMath', () => {
  it('sums the top level of every criterion', () => {
    expect(rubricMaxPoints(rubric)).toBe(7);
  });

  it('drops picks that name no real criterion or level', () => {
    expect(cleanLevels(rubric, { a: 5, b: 1, z: 0, c: -1 })).toEqual({ b: 1 });
  });

  it('totals only the criteria that have a level', () => {
    expect(scoreTotals(rubric, { a: 2 })).toEqual({ points: 4, max: 7 });
  });

  it('is fully scored only when every criterion is picked', () => {
    expect(isFullyScored(rubric, { a: 1 })).toBe(false);
    expect(isFullyScored(rubric, { a: 1, b: 0 })).toBe(true);
  });

  it('builds a score doc only when complete', () => {
    expect(buildScoreDoc(rubric, 3, { a: 1 }, 9)).toBeNull();
    expect(buildScoreDoc(rubric, 3, { a: 1, b: 1 }, 9, ['f1'])).toEqual({
      seat: 3,
      levels: { a: 1, b: 1 },
      points: 5,
      max: 7,
      scoredAt: 9,
      scanFileIds: ['f1'],
    });
  });

  it('rounds percent and guards a zero max', () => {
    expect(percentOf(5, 7)).toBe(71);
    expect(percentOf(1, 0)).toBe(0);
  });
});

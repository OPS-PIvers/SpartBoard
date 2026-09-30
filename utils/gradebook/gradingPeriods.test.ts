import { describe, expect, it } from 'vitest';
import {
  columnPeriodDate,
  currentPeriod,
  inPeriod,
  periodSetForBuildings,
  type GradingPeriodSet,
} from './gradingPeriods';

const q = (id: string, start: string, end: string) => ({
  id,
  label: id.toUpperCase(),
  start,
  end,
});
const Q1 = q('q1', '2026-09-02', '2026-11-06');
const Q2 = q('q2', '2026-11-09', '2027-01-22');
const S1 = q('s1', '2026-09-02', '2027-01-22');
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h).getTime();

describe('grading periods', () => {
  it('uses dueAt, then openAt, then createdAt', () => {
    expect(columnPeriodDate({ dueAt: 3, openAt: 2, createdAt: 1 })).toBe(3);
    expect(columnPeriodDate({ dueAt: null, openAt: 2, createdAt: 1 })).toBe(2);
    expect(columnPeriodDate({ createdAt: 1 })).toBe(1);
    expect(columnPeriodDate({})).toBeNull();
  });

  it('includes both end dates in local time', () => {
    expect(inPeriod(at(2026, 9, 2, 0), Q1)).toBe(true);
    expect(inPeriod(at(2026, 11, 6, 23), Q1)).toBe(true);
    expect(inPeriod(at(2026, 11, 7), Q1)).toBe(false);
    expect(inPeriod(null, Q1)).toBe(false);
    expect(
      inPeriod(at(2026, 10, 1), q('bad', '2026-12-01', '2026-01-01'))
    ).toBe(false);
  });

  it('picks the period containing today, the shortest when they overlap', () => {
    expect(currentPeriod([S1, Q2, Q1], at(2026, 10, 1))?.id).toBe('q1');
    expect(currentPeriod([S1, Q2, Q1], at(2026, 12, 1))?.id).toBe('s1');
  });

  it('falls back to the last ended period, then the first', () => {
    expect(currentPeriod([Q1, Q2], at(2027, 6, 1))?.id).toBe('q2');
    expect(currentPeriod([Q1, Q2], at(2026, 8, 1))?.id).toBe('q1');
    expect(currentPeriod([], at(2026, 8, 1))).toBeNull();
  });

  it('matches a set to the teacher building', () => {
    const set = (id: string, name: string, buildingIds: string[]) =>
      ({
        id,
        name,
        orgId: 'o',
        buildingIds,
        periods: [],
        updatedAt: 0,
      }) as GradingPeriodSet;
    const sets = [
      set('b', 'Middle', ['middle']),
      set('a', 'High', ['high']),
      set('c', 'All MS', ['middle', 'intermediate']),
    ];
    expect(periodSetForBuildings(sets, ['middle'])?.id).toBe('c');
    expect(periodSetForBuildings(sets, ['high'])?.id).toBe('a');
    expect(periodSetForBuildings(sets, ['elementary'])).toBeNull();
    expect(periodSetForBuildings(sets, [])).toBeNull();
  });
});

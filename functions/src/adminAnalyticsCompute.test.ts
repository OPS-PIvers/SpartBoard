import { describe, expect, it } from 'vitest';
import { countActiveStudents } from './adminAnalyticsCompute';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 5, 10);

describe('countActiveStudents', () => {
  it('counts rolling 30-day and 24-hour windows', () => {
    expect(
      countActiveStudents(
        [NOW - 1000, NOW - DAY, NOW - 2 * DAY, NOW - 30 * DAY, NOW - 31 * DAY],
        NOW
      )
    ).toEqual({ monthly: 4, daily: 2 });
  });

  it('skips students with no sign-in time', () => {
    expect(countActiveStudents([0, Number.NaN], NOW)).toEqual({
      monthly: 0,
      daily: 0,
    });
  });
});

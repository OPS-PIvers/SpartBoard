import { describe, it, expect } from 'vitest';
import {
  buildActivitySeries,
  buildCohorts,
  buildNewUsersByMonth,
  chicagoDateKey,
  estimateActivityDays,
  measuredDateKey,
} from './adminAnalyticsHistory';

describe('adminAnalyticsHistory', () => {
  it('keys dates in Central time and reports a 5 AM run as the previous day', () => {
    // 2026-03-03 02:00 UTC is still March 2 in Minnesota.
    expect(chicagoDateKey(Date.UTC(2026, 2, 3, 2))).toBe('2026-03-02');
    // 5 AM CDT on Oct 2 = 10:00 UTC.
    expect(measuredDateKey(Date.UTC(2026, 9, 2, 10))).toBe('2026-10-01');
  });

  it('fills gaps and computes a trailing 30-day MAU', () => {
    const series = buildActivitySeries([
      { date: '2026-01-01', activeUids: ['a', 'b'], estimated: true },
      { date: '2026-01-03', activeUids: ['c'], estimated: false },
      { date: '2026-02-01', activeUids: ['a'], estimated: false },
    ]);
    expect(series).toHaveLength(32);
    expect(series[1]).toEqual({
      date: '2026-01-02',
      dau: 0,
      mau: 2,
      estimated: true,
    });
    expect(series[2]).toMatchObject({ dau: 1, mau: 3, estimated: false });
    // Jan 1 has left the window by Feb 1; Jan 3 has not.
    expect(series[31]).toMatchObject({ date: '2026-02-01', dau: 1, mau: 2 });
  });

  it('counts sign-ups per month including empty months', () => {
    const now = Date.UTC(2026, 3, 10);
    expect(
      buildNewUsersByMonth(
        [
          Date.UTC(2026, 0, 5, 18),
          Date.UTC(2026, 0, 20, 18),
          Date.UTC(2026, 2, 1, 18),
          0,
        ],
        now
      )
    ).toEqual([
      { month: '2026-01', count: 2 },
      { month: '2026-02', count: 0 },
      { month: '2026-03', count: 1 },
      { month: '2026-04', count: 0 },
    ]);
  });

  it('builds retention cohorts and leaves months before history empty', () => {
    const signups = new Map([
      ['a', Date.UTC(2026, 0, 10, 18)],
      ['b', Date.UTC(2026, 0, 12, 18)],
      ['c', Date.UTC(2026, 1, 3, 18)],
    ]);
    const cohorts = buildCohorts(
      signups,
      [
        { date: '2026-02-04', activeUids: ['a', 'c'], estimated: false },
        { date: '2026-03-04', activeUids: ['a', 'b'], estimated: false },
      ],
      Date.UTC(2026, 2, 20)
    );
    expect(cohorts).toEqual([
      { month: '2026-01', users: 2, retained: [null, 50, 100] },
      { month: '2026-02', users: 1, retained: [100, 0] },
    ]);
  });

  it('groups dated events into estimated days before the first measured day', () => {
    const days = estimateActivityDays(
      [
        ['a', Date.UTC(2026, 4, 1, 15)],
        ['b', Date.UTC(2026, 4, 1, 16)],
        ['a', Date.UTC(2026, 4, 1, 17)],
        ['a', Date.UTC(2026, 4, 9, 15)],
        ['a', 0],
      ],
      '2026-05-09'
    );
    expect(days).toEqual([
      { date: '2026-05-01', activeUids: ['a', 'b'], estimated: true },
    ]);
  });
});

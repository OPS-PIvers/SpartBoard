import { describe, it, expect } from 'vitest';
import {
  buildActivitySeries,
  addSchoolMonths,
  buildCohorts,
  buildNewUsersByMonth,
  buildRetention,
  chicagoDateKey,
  estimateActivityDays,
  measuredDateKey,
  nextChicagoHourMs,
} from './adminAnalyticsHistory';

describe('adminAnalyticsHistory', () => {
  it('keys dates in Central time and reports a 5 AM run as the previous day', () => {
    // 2026-03-03 02:00 UTC is still March 2 in Minnesota.
    expect(chicagoDateKey(Date.UTC(2026, 2, 3, 2))).toBe('2026-03-02');
    // 5 AM CDT on Oct 2 = 10:00 UTC.
    expect(measuredDateKey(Date.UTC(2026, 9, 2, 10))).toBe('2026-10-01');
  });

  it('finds the next 5 AM, 12 PM or 3 PM run in Central time', () => {
    const hours = [5, 12, 15];
    // 5:00:30 AM CDT -> noon CDT.
    expect(nextChicagoHourMs(Date.UTC(2026, 9, 2, 10, 0, 30), hours)).toBe(
      Date.UTC(2026, 9, 2, 17)
    );
    // 3 PM CDT -> 5 AM CDT next day.
    expect(nextChicagoHourMs(Date.UTC(2026, 9, 2, 20, 1), hours)).toBe(
      Date.UTC(2026, 9, 3, 10)
    );
    // 3 PM CST in January -> 5 AM CST = 11:00 UTC.
    expect(nextChicagoHourMs(Date.UTC(2026, 0, 15, 21, 1), hours)).toBe(
      Date.UTC(2026, 0, 16, 11)
    );
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

  it('skips June and July when counting school months', () => {
    expect(addSchoolMonths('2026-04', 0)).toBe('2026-04');
    expect(addSchoolMonths('2026-04', 2)).toBe('2026-08');
    expect(addSchoolMonths('2026-07', 0)).toBe('2026-08');
    expect(addSchoolMonths('2025-12', 1)).toBe('2026-01');
  });

  it('builds school-year retention by month and season with fall return', () => {
    const at = (y: number, m: number) => Date.UTC(y, m - 1, 10, 18);
    const signups = new Map([
      ['a', at(2026, 4)],
      ['b', at(2026, 4)],
      ['c', at(2026, 1)],
      ['d', at(2026, 7)],
      ['e', at(2026, 10)],
      ['old', 0],
    ]);
    const day = (date: string, activeUids: string[]) => ({
      date,
      activeUids,
      estimated: false,
    });
    const retention = buildRetention(
      signups,
      [
        day('2026-01-12', ['c']),
        day('2026-04-12', ['a', 'b']),
        day('2026-05-12', ['a', 'c']),
        day('2026-06-12', ['a', 'b']),
        day('2026-08-20', ['b', 'd']),
        day('2026-09-12', ['a', 'c']),
        day('2026-10-12', ['a', 'e']),
      ],
      Date.UTC(2026, 9, 20, 18)
    );
    if (!retention) throw new Error('expected retention');
    expect(retention.currentMonth).toBe('2026-10');
    const april = retention.byMonth.find((r) => r.key === '2026-04');
    // Apr, May, Aug, Sep, Oct: June activity never counts.
    expect(april?.cells.map((c) => c?.pct)).toEqual([100, 50, 50, 50, 50]);
    expect(april?.cells.map((c) => c?.partial)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(april?.fallReturn).toEqual({
      year: 2026,
      spring: 2,
      returned: 1,
      partial: false,
    });
    // A July sign-up starts counting in August.
    const july = retention.byMonth.find((r) => r.key === '2026-07');
    expect(july?.cells).toEqual([
      { pct: 100, active: 1, n: 1, partial: false },
      { pct: 0, active: 0, n: 1, partial: false },
      { pct: 0, active: 0, n: 1, partial: true },
    ]);
    expect(july?.fallReturn).toBeNull();
    expect(retention.bySeason.map((r) => [r.key, r.users])).toEqual([
      ['2026-spring', 3],
      ['2026-fall', 2],
    ]);
    // Each teacher's own school month k; October counts only where nothing else does.
    const spring = retention.bySeason[0];
    expect(spring.cells[0]).toEqual({
      pct: 100,
      active: 3,
      n: 3,
      partial: false,
    });
    expect(spring.cells[4]).toEqual({
      pct: 100,
      active: 1,
      n: 1,
      partial: false,
    });
    expect(spring.cells[5]).toEqual({
      pct: 0,
      active: 0,
      n: 1,
      partial: false,
    });
    expect(spring.cells[6]).toEqual({
      pct: 100,
      active: 1,
      n: 1,
      partial: false,
    });
    expect(spring.cells[7]).toEqual({
      pct: 0,
      active: 0,
      n: 1,
      partial: true,
    });
    expect(spring.cells).toHaveLength(8);
    expect(retention.fallReturn).toEqual({
      year: 2026,
      spring: 3,
      returned: 2,
      partial: false,
    });
  });

  it('leaves fall return empty before a September with spring history', () => {
    const retention = buildRetention(
      new Map([['a', Date.UTC(2026, 7, 10, 18)]]),
      [{ date: '2026-08-12', activeUids: ['a'], estimated: false }],
      Date.UTC(2026, 9, 20, 18)
    );
    expect(retention?.fallReturn).toBeNull();
    expect(buildRetention(new Map(), [], 0)).toBeUndefined();
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

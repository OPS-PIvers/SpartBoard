import { describe, it, expect } from 'vitest';
import {
  activityStats,
  filterRange,
  joinWeeks,
  lastActiveOf,
  recencyBuckets,
  toWeekly,
  type ActivityPoint,
} from '@/components/admin/Analytics/overviewMetrics';

const DAY = 24 * 60 * 60 * 1000;

const series = (start: string, values: number[], mau = 10): ActivityPoint[] =>
  values.map((dau, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      dau,
      mau: mau + i,
      estimated: false,
    };
  });

describe('overviewMetrics', () => {
  it('falls back to edit and sign-in times for older snapshots', () => {
    expect(lastActiveOf({ lastSignInMs: 5, lastEditMs: 9 })).toBe(9);
    expect(
      lastActiveOf({ lastSignInMs: 5, lastEditMs: 9, lastActiveMs: 3 })
    ).toBe(3);
  });

  it('averages school days per week and keeps the closing MAU', () => {
    // 2026-09-13 is a Sunday.
    const weeks = toWeekly(
      series('2026-09-13', [1, 10, 20, 30, 40, 50, 2, 99])
    );
    expect(weeks).toEqual([
      { week: '2026-09-13', dau: 30, mau: 16, estimated: false },
      { week: '2026-09-20', dau: 99, mau: 17, estimated: false },
    ]);
  });

  it('marks a week estimated when any day in it is', () => {
    const days = series('2026-09-13', [1, 2]);
    days[0].estimated = true;
    expect(toWeekly(days)[0].estimated).toBe(true);
  });

  it('joins staff and student weeks, leaving gaps where a series has none', () => {
    const staff = [
      { week: '2026-09-13', dau: 3, mau: 9, estimated: true },
      { week: '2026-09-20', dau: 4, mau: 10, estimated: false },
    ];
    const students = [
      { week: '2026-09-06', dau: 20, mau: 50, estimated: false },
      { week: '2026-09-20', dau: 30, mau: 60, estimated: true },
    ];
    expect(joinWeeks(staff, students)).toEqual([
      { week: '2026-09-06', studentDau: 20, studentMau: 50, estimated: false },
      { week: '2026-09-13', dau: 3, mau: 9, estimated: true },
      {
        week: '2026-09-20',
        dau: 4,
        mau: 10,
        studentDau: 30,
        studentMau: 60,
        estimated: true,
      },
    ]);
  });

  it('trims to the selected range', () => {
    const days = series(
      '2025-01-01',
      Array.from({ length: 400 }, () => 1)
    );
    expect(filterRange(days, '90d')).toHaveLength(90);
    expect(filterRange(days, '1y')).toHaveLength(365);
    expect(filterRange(days, 'all')).toHaveLength(400);
  });

  it('computes stickiness, monthly change and peak', () => {
    const days = series(
      '2026-08-01',
      Array.from({ length: 40 }, () => 5),
      20
    );
    days[5].dau = 30;
    const stats = activityStats(days);
    expect(stats.mauChange).toBe(30);
    expect(stats.peak?.date).toBe(days[5].date);
    expect(stats.stickiness).toBe(Math.round((5 / 59) * 100));
  });

  it('buckets users by last activity', () => {
    const now = 1_000 * DAY;
    const at = (daysAgo: number) => ({
      lastSignInMs: 0,
      lastEditMs: 0,
      lastActiveMs: now - daysAgo * DAY,
    });
    const rows = recencyBuckets(
      [
        at(0.5),
        at(3),
        at(20),
        at(60),
        at(200),
        { lastSignInMs: 0, lastEditMs: 0, lastActiveMs: 0 },
      ],
      now
    );
    expect(rows.map((r) => r.value)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyAvailability,
  closesBeforeOpens,
  defaultAvailability,
  resolveAvailability,
  type AssignAvailability,
} from './assignAvailability';
import type { PeriodRoster } from './periodPlan';
import { EMPTY_ASSIGN_TARGETING_VALUE } from './studentTargetRef';

const at = (day: string, time: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
};

const p3: PeriodRoster = {
  id: 'r3',
  name: 'Period 3',
  bellPeriod: { buildingId: 'b', periodId: '3' },
};
const p5: PeriodRoster = {
  id: 'r5',
  name: 'Period 5',
  bellPeriod: { buildingId: 'b', periodId: '5' },
};
const untagged: PeriodRoster = { id: 'rx', name: 'No period' };

const BELLS: Record<string, [string, string]> = {
  '3': ['09:05', '09:52'],
  '5': ['11:40', '12:27'],
};
const bellWindow = (roster: PeriodRoster, date: Date) => {
  const bell = roster.bellPeriod && BELLS[roster.bellPeriod.periodId];
  if (!bell) return null;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { openAt: at(day, bell[0]), closeAt: at(day, bell[1]) };
};

const bellToBell = (day: string): AssignAvailability => ({
  all: { opens: { day, time: 'bell' }, closes: { day, time: 'bell' } },
  allowLate: false,
});

describe('defaultAvailability', () => {
  it('uses the bells when they are known', () => {
    const av = defaultAvailability(new Date(2026, 9, 2, 13, 7), true);
    expect(av.all).toEqual({
      opens: { day: '2026-10-02', time: 'bell' },
      closes: { day: '2026-10-02', time: 'bell' },
    });
    expect(av.allowLate).toBe(false);
  });

  it('opens now and closes at the end of the day without bells', () => {
    const av = defaultAvailability(new Date(2026, 9, 2, 13, 7), false);
    expect(av.all).toEqual({
      opens: { day: '2026-10-02', time: '13:05' },
      closes: { day: '2026-10-02', time: '23:59' },
    });
  });
});

describe('resolveAvailability', () => {
  it('gives each class its own bell window and closes on the latest', () => {
    const r = resolveAvailability(
      bellToBell('2026-10-02'),
      [p3, p5],
      bellWindow
    );
    expect(r.openAt).toBe(at('2026-10-02', '09:05'));
    expect(r.closeAt).toBe(at('2026-10-02', '12:27'));
    expect(r.dueAt).toBe(at('2026-10-02', '12:27'));
    expect(r.periodPlan).toEqual({
      mode: 'assignment',
      rows: {
        r3: {
          source: 'custom',
          openAt: at('2026-10-02', '09:05'),
          closeAt: at('2026-10-02', '09:52'),
        },
        r5: {
          source: 'custom',
          openAt: at('2026-10-02', '11:40'),
          closeAt: at('2026-10-02', '12:27'),
        },
      },
    });
    expect(r.dueAtByRosterId).toEqual({
      r3: at('2026-10-02', '09:52'),
      r5: at('2026-10-02', '12:27'),
    });
  });

  it('falls back to the whole day for a class with no period', () => {
    const r = resolveAvailability(
      bellToBell('2026-10-02'),
      [untagged],
      bellWindow
    );
    expect(r.openAt).toBe(at('2026-10-02', '00:00'));
    expect(r.closeAt).toBe(at('2026-10-02', '23:59'));
    expect(r.periodPlan).toBeUndefined();
  });

  it('leaves the window open but keeps the due date when late work is allowed', () => {
    const av: AssignAvailability = {
      all: {
        opens: { day: '2026-10-02', time: '08:00' },
        closes: { day: '2026-10-06', time: '23:59' },
      },
      allowLate: true,
    };
    const r = resolveAvailability(av, [p3, p5], bellWindow);
    expect(r.closeAt).toBeUndefined();
    expect(r.dueAt).toBe(at('2026-10-06', '23:59'));
    expect(r.periodPlan?.rows?.r3.closeAt).toBeUndefined();
  });

  it('uses each class its own dates', () => {
    const av: AssignAvailability = {
      ...bellToBell('2026-10-02'),
      byRoster: {
        r5: {
          opens: { day: '2026-10-05', time: 'bell' },
          closes: { day: '2026-10-05', time: '14:15' },
        },
      },
    };
    const r = resolveAvailability(av, [p3, p5], bellWindow);
    expect(r.periodPlan?.rows?.r3.openAt).toBe(at('2026-10-02', '09:05'));
    expect(r.periodPlan?.rows?.r5.openAt).toBe(at('2026-10-05', '11:40'));
    expect(r.periodPlan?.rows?.r5.closeAt).toBe(at('2026-10-05', '14:15'));
  });
});

describe('resolveAvailability with one class left', () => {
  it('ignores per-class dates the section no longer shows', () => {
    const av: AssignAvailability = {
      ...bellToBell('2026-10-02'),
      byRoster: {
        r3: {
          opens: { day: '2026-10-09', time: '08:00' },
          closes: { day: '2026-10-09', time: '09:00' },
        },
      },
    };
    const r = resolveAvailability(av, [p3], bellWindow);
    expect(r.openAt).toBe(at('2026-10-02', '09:05'));
  });
});

describe('closesBeforeOpens', () => {
  it('flags a set open time after the bell close', () => {
    const spec = {
      opens: { day: '2026-10-02', time: '10:00' },
      closes: { day: '2026-10-02', time: 'bell' },
    };
    expect(closesBeforeOpens(spec, [p3], bellWindow)).toBe(true);
    expect(closesBeforeOpens(spec, [p5], bellWindow)).toBe(false);
  });

  it('accepts a bell to bell window', () => {
    expect(
      closesBeforeOpens(bellToBell('2026-10-02').all, [p3, p5], bellWindow)
    ).toBe(false);
  });
});

describe('applyAvailability', () => {
  it('leaves the value alone when the flag is off', () => {
    const value = { ...EMPTY_ASSIGN_TARGETING_VALUE, openAt: 5 };
    expect(
      applyAvailability(value, { enabled: false, rosters: [], bellWindow })
        .targeting
    ).toEqual(value);
  });

  it('resolves the default and drops the section state', () => {
    const { targeting } = applyAvailability(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        availability: bellToBell('2026-10-02'),
      },
      { enabled: true, rosters: [p3], bellWindow }
    );
    expect(targeting.availability).toBeUndefined();
    expect(targeting.openAt).toBe(at('2026-10-02', '09:05'));
    expect(targeting.closeAt).toBe(at('2026-10-02', '09:52'));
    expect(targeting.dueAt).toBe(at('2026-10-02', '09:52'));
  });

  it('uses today without bells when nothing was changed', () => {
    const { targeting } = applyAvailability(EMPTY_ASSIGN_TARGETING_VALUE, {
      enabled: true,
      rosters: [],
      bellWindow: undefined,
      now: new Date(2026, 9, 2, 13, 7),
    });
    expect(targeting.openAt).toBe(at('2026-10-02', '13:05'));
    expect(targeting.closeAt).toBe(at('2026-10-02', '23:59'));
  });
});

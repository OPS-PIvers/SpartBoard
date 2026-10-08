import { describe, expect, it } from 'vitest';
import {
  applyAvailability,
  applyWhen,
  applyWindowEdit,
  availabilityFromStored,
  changedWindow,
  closesBeforeOpens,
  defaultAvailability,
  manualStartAvailable,
  periodAccessWindowEdits,
  resolveAvailability,
  type AssignAvailability,
} from './assignAvailability';
import { BELL_CLOSE_CUSHION_MS, type PeriodRoster } from './periodPlan';
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
    expect(r.closeAt).toBe(at('2026-10-02', '12:27') + BELL_CLOSE_CUSHION_MS);
    expect(r.dueAt).toBe(at('2026-10-02', '12:27'));
    expect(r.periodPlan).toEqual({
      mode: 'assignment',
      rows: {
        r3: {
          source: 'custom',
          openAt: at('2026-10-02', '09:05'),
          closeAt: at('2026-10-02', '09:52') + BELL_CLOSE_CUSHION_MS,
        },
        r5: {
          source: 'custom',
          openAt: at('2026-10-02', '11:40'),
          closeAt: at('2026-10-02', '12:27') + BELL_CLOSE_CUSHION_MS,
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
    expect(targeting.closeAt).toBe(
      at('2026-10-02', '09:52') + BELL_CLOSE_CUSHION_MS
    );
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

describe('study resources', () => {
  const base = { ...EMPTY_ASSIGN_TARGETING_VALUE };

  it('saves no work kind unless the setting is on', () => {
    const { targeting } = applyAvailability(
      { ...base, workKind: 'resource' },
      { enabled: true, rosters: [], bellWindow: undefined }
    );
    expect(targeting.workKind).toBeUndefined();
  });

  it('keeps the kind default for work and leaves the due date alone', () => {
    const { targeting } = applyAvailability(
      { ...base, availability: bellToBell('2026-10-02') },
      {
        enabled: true,
        rosters: [p3],
        bellWindow,
        workKind: { default: 'work' },
      }
    );
    expect(targeting.workKind).toBe('work');
    expect(targeting.dueAt).toBe(at('2026-10-02', '09:52'));
  });

  it('defaults a resource to no end date and no due date', () => {
    const { targeting } = applyAvailability(base, {
      enabled: true,
      rosters: [],
      bellWindow: undefined,
      workKind: { default: 'resource' },
      now: new Date(2026, 9, 2, 13, 7),
    });
    expect(targeting.workKind).toBe('resource');
    expect(targeting.openAt).toBe(at('2026-10-02', '13:05'));
    expect(targeting.closeAt).toBeUndefined();
    expect(targeting.dueAt).toBeUndefined();
  });

  it('closes a resource at the chosen date with no due date', () => {
    const { targeting } = applyAvailability(
      { ...base, workKind: 'resource', availability: bellToBell('2026-10-02') },
      {
        enabled: true,
        rosters: [p3],
        bellWindow,
        workKind: { default: 'work' },
      }
    );
    expect(targeting.closeAt).toBe(at('2026-10-02', '09:52'));
    expect(targeting.dueAt).toBeUndefined();
  });

  it('ignores the teacher choice when the kind is locked', () => {
    const { targeting } = applyAvailability(
      { ...base, workKind: 'work' },
      {
        enabled: true,
        rosters: [],
        bellWindow: undefined,
        workKind: { default: 'resource', locked: true },
      }
    );
    expect(targeting.workKind).toBe('resource');
  });

  it('gives each class no due date or close for a resource with no end', () => {
    const resolved = resolveAvailability(
      { ...bellToBell('2026-10-02'), noEnd: true },
      [p3, p5],
      bellWindow,
      'resource'
    );
    expect(resolved.closeAt).toBeUndefined();
    expect(resolved.dueAtByRosterId).toBeUndefined();
    expect(resolved.periodPlan?.rows?.r3.closeAt).toBeUndefined();
    expect(resolved.periodPlan?.rows?.r3.openAt).toBe(
      at('2026-10-02', '09:05')
    );
  });

  it('ignores a stale no-end flag on work', () => {
    const resolved = resolveAvailability(
      { ...bellToBell('2026-10-02'), noEnd: true },
      [p3],
      bellWindow,
      'work'
    );
    expect(resolved.closeAt).toBe(
      at('2026-10-02', '09:52') + BELL_CLOSE_CUSHION_MS
    );
  });

  it('keeps a clock-time close exact, with no cushion', () => {
    const resolved = resolveAvailability(
      {
        all: {
          opens: { day: '2026-10-02', time: '09:05' },
          closes: { day: '2026-10-02', time: '09:52' },
        },
        allowLate: false,
      },
      [p3],
      bellWindow
    );
    expect(resolved.closeAt).toBe(at('2026-10-02', '09:52'));
  });
});

describe('editing a saved window', () => {
  const createdAt = at('2026-10-02', '08:13');

  it('hydrates set times from the stored window', () => {
    const value = availabilityFromStored(
      {
        openAt: at('2026-10-02', '09:00'),
        closeAt: at('2026-10-03', '15:00'),
        dueAt: at('2026-10-03', '15:00'),
        createdAt,
      },
      []
    );
    expect(value.all).toEqual({
      opens: { day: '2026-10-02', time: '09:00' },
      closes: { day: '2026-10-03', time: '15:00' },
    });
    expect(value.allowLate).toBe(false);
  });

  it('shows the class bell when the stored close carries the cushion', () => {
    const due = at('2026-10-02', '09:52');
    const value = availabilityFromStored(
      {
        openAt: at('2026-10-02', '09:05'),
        closeAt: due + BELL_CLOSE_CUSHION_MS,
        dueAt: due,
        createdAt,
      },
      []
    );
    expect(value.all.closes).toEqual({ day: '2026-10-02', time: '09:52' });
  });

  it('reads a due date with no close as late work allowed', () => {
    const value = availabilityFromStored(
      { dueAt: at('2026-10-03', '15:00'), createdAt },
      []
    );
    expect(value.allowLate).toBe(true);
    expect(value.all.opens).toEqual({ day: '2026-10-02', time: '08:13' });
  });

  it('splits per-class due dates into each class', () => {
    const value = availabilityFromStored(
      {
        closeAt: at('2026-10-04', '15:00'),
        dueAtByRosterId: {
          r3: at('2026-10-03', '15:00'),
          r5: at('2026-10-04', '15:00'),
        },
        createdAt,
      },
      ['r3', 'r5']
    );
    expect(value.byRoster?.r3.closes).toEqual({
      day: '2026-10-03',
      time: '15:00',
    });
    const resolved = resolveAvailability(value, [p3, p5], undefined);
    expect(resolved.dueAtByRosterId).toEqual({
      r3: at('2026-10-03', '15:00'),
      r5: at('2026-10-04', '15:00'),
    });
  });

  it('reports only the fields that changed', () => {
    expect(
      changedWindow(
        { openAt: 1, closeAt: 2, dueAt: 2 },
        { openAt: 1, closeAt: 3, dueAt: 3 }
      )
    ).toEqual({ closeAt: 3, dueAt: 3 });
  });

  it('leaves a window with no close untouched when only opens moves', () => {
    const stored = { openAt: at('2026-10-02', '09:00'), createdAt };
    const availability = availabilityFromStored(stored, []);
    const next = applyWindowEdit(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        openAt: stored.openAt,
        availability: {
          ...availability,
          all: {
            ...availability.all,
            opens: { day: '2026-10-02', time: '10:00' },
          },
        },
      },
      stored,
      true
    );
    expect(next.openAt).toBe(at('2026-10-02', '10:00'));
    expect(next.closeAt).toBeUndefined();
    expect(next.dueAt).toBeUndefined();
    expect('availability' in next).toBe(false);
  });

  it('clears the close and keeps the due date when late work is allowed', () => {
    const stored = {
      openAt: at('2026-10-02', '09:00'),
      closeAt: at('2026-10-03', '15:00'),
      dueAt: at('2026-10-03', '15:00'),
      createdAt,
    };
    const availability = availabilityFromStored(stored, []);
    const next = applyWindowEdit(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        openAt: stored.openAt,
        closeAt: stored.closeAt,
        dueAt: stored.dueAt,
        availability: { ...availability, allowLate: true },
      },
      stored,
      true
    );
    expect(next.closeAt).toBeUndefined();
    expect(next.dueAt).toBe(stored.dueAt);
  });
});

describe('editing per-class windows', () => {
  const row = (rosterId: string, openAt: number, closeAt: number) => ({
    state: 'open' as const,
    openAt,
    closeAt,
    bellPeriodId: null,
    verified: true,
    label: rosterId,
    rosterId,
  });
  const periodAccess = {
    k3: row('r3', at('2026-10-02', '09:05'), at('2026-10-03', '09:52')),
    k5: row('r5', at('2026-10-02', '11:40'), at('2026-10-03', '12:27')),
  };
  const stored = { createdAt: at('2026-10-01', '08:00'), periodAccess };

  it('hydrates each class from its own row', () => {
    const value = availabilityFromStored(stored, ['r3', 'r5']);
    expect(value.byRoster?.r5.opens).toEqual({
      day: '2026-10-02',
      time: '11:40',
    });
    expect(value.all.opens.time).toBe('09:05');
  });

  it('writes only the row that changed', () => {
    const value = availabilityFromStored(stored, ['r3', 'r5']);
    const before = resolveAvailability(value, [p3, p5], undefined);
    const after = resolveAvailability(
      {
        ...value,
        byRoster: {
          ...value.byRoster,
          r5: {
            ...(value.byRoster?.r5 ?? value.all),
            opens: { day: '2026-10-02', time: '13:00' },
          },
        },
      },
      [p3, p5],
      undefined
    );
    expect(periodAccessWindowEdits(periodAccess, before, after)).toEqual({
      'periodAccess.k5.openAt': at('2026-10-02', '13:00'),
    });
  });
});

describe('applyWhen', () => {
  const value = {
    ...EMPTY_ASSIGN_TARGETING_VALUE,
    availability: bellToBell('2026-10-02'),
    openAt: 1,
    closeAt: 2,
    dueAt: 3,
  };

  it('needs bell periods for Manual', () => {
    expect(manualStartAvailable(bellWindow)).toBe(true);
    expect(manualStartAvailable(undefined)).toBe(false);
  });

  it('writes Manual as closed per-period access with no window or due date', () => {
    const { targeting, dueAtByRosterId } = applyWhen(value, {
      mode: 'manual',
      rosters: [p3, p5],
      bellWindow,
    });
    expect(targeting).toEqual({
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      periodPlan: { mode: 'assessment' },
    });
    expect(dueAtByRosterId).toBeUndefined();
  });

  it('keeps Manual for a single class', () => {
    const { targeting } = applyWhen(value, {
      mode: 'manual',
      rosters: [p3],
      bellWindow,
    });
    expect(targeting.periodPlan).toEqual({ mode: 'assessment' });
    expect(targeting.dueAt).toBeUndefined();
  });

  it('saves the work kind with Manual when the setting is on', () => {
    const { targeting } = applyWhen(value, {
      mode: 'manual',
      rosters: [p3],
      bellWindow,
      workKind: { default: 'work' },
    });
    expect(targeting.workKind).toBe('work');
  });

  it('falls back to the dates without bell periods', () => {
    const { targeting } = applyWhen(value, {
      mode: 'manual',
      rosters: [p3],
      bellWindow: undefined,
    });
    expect(targeting.periodPlan).toBeUndefined();
    expect(targeting.openAt).toBe(at('2026-10-02', '00:00'));
    expect(targeting.dueAt).toBe(at('2026-10-02', '23:59'));
  });

  it('resolves Scheduled like the availability section, with per-class rows', () => {
    const { targeting, dueAtByRosterId } = applyWhen(value, {
      mode: 'scheduled',
      rosters: [p3, p5],
      bellWindow,
    });
    expect(targeting.availability).toBeUndefined();
    expect(targeting.openAt).toBe(at('2026-10-02', '09:05'));
    expect(targeting.dueAt).toBe(at('2026-10-02', '12:27'));
    expect(targeting.periodPlan?.mode).toBe('assignment');
    expect(dueAtByRosterId).toEqual({
      r3: at('2026-10-02', '09:52'),
      r5: at('2026-10-02', '12:27'),
    });
  });

  it('never makes a study resource manual', () => {
    const { targeting } = applyWhen(value, {
      mode: 'manual',
      rosters: [p3],
      bellWindow,
      workKind: { default: 'resource', locked: true },
    });
    expect(targeting.workKind).toBe('resource');
    expect(targeting.periodPlan).toBeUndefined();
    expect(targeting.dueAt).toBeUndefined();
    expect(targeting.openAt).toBe(at('2026-10-02', '09:05'));
  });
});

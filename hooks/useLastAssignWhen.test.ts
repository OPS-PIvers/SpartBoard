import { describe, expect, it } from 'vitest';
import {
  lastWhenFrom,
  parseLastAssignWhen,
  withRememberedWhen,
} from './useLastAssignWhen';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';

const seed: AssignWhenValue = {
  mode: 'scheduled',
  availability: {
    all: {
      opens: { day: '2026-11-14', time: '08:00' },
      closes: { day: '2026-11-14', time: '23:59' },
    },
    allowLate: false,
  },
};
const now = new Date(2026, 10, 14, 9, 0);

describe('withRememberedWhen', () => {
  it('starts on When ended and Opens Now with nothing saved', () => {
    const when = withRememberedWhen(seed, null, now);
    expect(when.mode).toBe('scheduled');
    expect(when.availability.manualDue).toEqual({
      kind: 'ended',
      time: '23:59',
    });
    expect(when.availability.opensOnAssign).toBe(true);
  });

  it('keeps the last due time behind When ended', () => {
    const when = withRememberedWhen(
      seed,
      {
        mode: 'manual',
        allowLate: false,
        opens: 'now',
        due: 'ended',
        dueTime: '14:30',
      },
      now
    );
    expect(when.availability.manualDue).toEqual({
      kind: 'ended',
      time: '14:30',
    });
  });

  it('applies the last choices, with a date due today at the last time', () => {
    const when = withRememberedWhen(
      seed,
      {
        mode: 'manual',
        allowLate: true,
        opens: 'date',
        due: 'date',
        dueTime: '15:10',
      },
      now
    );
    expect(when.mode).toBe('manual');
    expect(when.availability.allowLate).toBe(true);
    expect(when.availability.opensOnAssign).toBe(false);
    expect(when.availability.manualDue).toEqual({
      kind: 'date',
      day: '2026-11-14',
      time: '15:10',
    });
  });
});

describe('withRememberedWhen after the due time', () => {
  it('moves a remembered due time that has passed today to tomorrow', () => {
    const when = withRememberedWhen(
      seed,
      {
        mode: 'manual',
        allowLate: false,
        opens: 'now',
        due: 'date',
        dueTime: '08:00',
      },
      now
    );
    expect(when.availability.manualDue).toEqual({
      kind: 'date',
      day: '2026-11-15',
      time: '08:00',
    });
  });
});

describe('withRememberedWhen without the Manual due date', () => {
  it('leaves the due date unset', () => {
    const when = withRememberedWhen(
      seed,
      {
        mode: 'manual',
        allowLate: false,
        opens: 'now',
        due: 'date',
        dueTime: '15:00',
      },
      now,
      false
    );
    expect(when.availability.manualDue).toBeUndefined();
    expect(when.availability.opensOnAssign).toBe(true);
  });
});

describe('lastWhenFrom', () => {
  it('round-trips the choices and keeps the last time when due when ended', () => {
    const saved = lastWhenFrom(
      {
        mode: 'manual',
        availability: {
          ...seed.availability,
          opensOnAssign: true,
          manualDue: { kind: 'ended' },
        },
      },
      {
        mode: 'manual',
        allowLate: false,
        opens: 'now',
        due: 'date',
        dueTime: '14:00',
      }
    );
    expect(saved).toEqual({
      mode: 'manual',
      allowLate: false,
      opens: 'now',
      due: 'ended',
      dueTime: '14:00',
    });
  });
});

describe('lastWhenFrom with a picked time', () => {
  it('saves the time a teacher picked before switching back to When ended', () => {
    const saved = lastWhenFrom(
      {
        mode: 'manual',
        availability: {
          ...seed.availability,
          manualDue: { kind: 'ended', time: '10:15' },
        },
      },
      null
    );
    expect(saved.due).toBe('ended');
    expect(saved.dueTime).toBe('10:15');
  });
});

describe('parseLastAssignWhen', () => {
  it('rejects junk and fills bad fields with defaults', () => {
    expect(parseLastAssignWhen(null)).toBeNull();
    expect(parseLastAssignWhen({ mode: 'live' })).toBeNull();
    expect(parseLastAssignWhen({ mode: 'manual', dueTime: '25:00' })).toEqual({
      mode: 'manual',
      allowLate: false,
      opens: 'now',
      due: 'ended',
      dueTime: '23:59',
    });
  });
});

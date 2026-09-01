import { describe, it, expect } from 'vitest';
import {
  parseTime,
  computeIsPast,
  resolveRotationDayNumber,
  countPreStartSchoolDays,
  formatRotationDayLabel,
} from '@/components/widgets/SpecialistSchedule/utils';

describe('parseTime', () => {
  it('parses a valid HH:MM string', () => {
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('13:45')).toBe(825);
  });

  it('returns -1 for undefined', () => {
    expect(parseTime(undefined)).toBe(-1);
  });

  it('returns -1 for empty string', () => {
    expect(parseTime('')).toBe(-1);
  });

  it('returns -1 for a string without a colon', () => {
    expect(parseTime('0830')).toBe(-1);
  });

  it('returns -1 when hour or minute is NaN', () => {
    expect(parseTime('ab:cd')).toBe(-1);
  });
});

describe('computeIsPast', () => {
  // 10:00 AM expressed as minutes since midnight
  const NOW_MINUTES = 600;

  it('returns false when the item is currently active', () => {
    // Even if the time is clearly in the past, active items are never "past"
    expect(computeIsPast('08:00', '07:00', true, NOW_MINUTES)).toBe(false);
  });

  it('returns true when endTime is before now', () => {
    expect(computeIsPast('09:30', '08:00', false, NOW_MINUTES)).toBe(true);
  });

  it('returns true when endTime is absent and startTime is before now', () => {
    // Falls back to startTime
    expect(computeIsPast(undefined, '09:00', false, NOW_MINUTES)).toBe(true);
  });

  it('returns false when endTime is after now', () => {
    expect(computeIsPast('10:30', '09:00', false, NOW_MINUTES)).toBe(false);
  });

  it('returns false when endTime equals now (not strictly before)', () => {
    expect(computeIsPast('10:00', '09:00', false, NOW_MINUTES)).toBe(false);
  });

  it('returns false when endTime is undefined and startTime is after now', () => {
    expect(computeIsPast(undefined, '11:00', false, NOW_MINUTES)).toBe(false);
  });

  // --- Regression: missing/invalid time must NOT cause isPast = true ---
  it('returns false when both endTime and startTime are undefined (missing time data)', () => {
    // Before the fix: parseTime(undefined ?? undefined) = parseTime(undefined) = -1
    // and -1 < 600 was true, so this returned true (bug).
    // After the fix: -1 < 0 guard short-circuits, returning false.
    expect(computeIsPast(undefined, undefined, false, NOW_MINUTES)).toBe(false);
  });

  it('returns false when endTime is an empty string and startTime is valid future time', () => {
    // Regression for `||` vs `??`: with `??`, '' would be passed to parseTime
    // and return -1, hiding the valid startTime fallback. With `||`,
    // the empty-string endTime is skipped and startTime drives the result.
    expect(computeIsPast('', '11:00', false, NOW_MINUTES)).toBe(false);
  });

  it('returns false when startTime is an empty string (invalid time data)', () => {
    // parseTime('') = -1 → should not be considered past
    expect(computeIsPast(undefined, '', false, NOW_MINUTES)).toBe(false);
  });

  it('returns false when startTime is a malformed string', () => {
    expect(computeIsPast(undefined, 'not-a-time', false, NOW_MINUTES)).toBe(
      false
    );
  });

  it('returns false at midnight (nowMinutes = 0) even when time is 00:00', () => {
    // 00:00 means 0 minutes; 0 < 0 is false — item at midnight is not past at midnight
    expect(computeIsPast('00:00', '00:00', false, 0)).toBe(false);
  });
});

describe('resolveRotationDayNumber', () => {
  const SEPT = [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-07',
    '2026-09-08',
  ];

  it('starts the rotation at day 1 on the start date', () => {
    expect(
      resolveRotationDayNumber(
        { cycleLength: 6, startDate: '2026-09-01', schoolDays: SEPT },
        '2026-09-01'
      )
    ).toBe(1);
  });

  it('ignores marked school days that fall before the start date', () => {
    // The reported bug: one leftover August day shifted every day by one.
    expect(
      resolveRotationDayNumber(
        {
          cycleLength: 6,
          startDate: '2026-09-01',
          schoolDays: ['2026-08-31', ...SEPT],
        },
        '2026-09-01'
      )
    ).toBe(1);
  });

  it('ignores a whole prior school year of marked days', () => {
    expect(
      resolveRotationDayNumber(
        {
          cycleLength: 6,
          startDate: '2026-09-01',
          schoolDays: ['2025-09-02', '2025-09-03', '2026-06-05', ...SEPT],
        },
        '2026-09-02'
      )
    ).toBe(2);
  });

  it('advances only on marked days, skipping weekends', () => {
    expect(
      resolveRotationDayNumber(
        { cycleLength: 6, startDate: '2026-09-01', schoolDays: SEPT },
        '2026-09-07'
      )
    ).toBe(5);
  });

  it('wraps back to day 1 after a full cycle', () => {
    expect(
      resolveRotationDayNumber(
        {
          cycleLength: 6,
          startDate: '2026-09-01',
          schoolDays: [...SEPT, '2026-09-09'],
        },
        '2026-09-09'
      )
    ).toBe(1);
  });

  it('is unaffected by duplicate entries', () => {
    expect(
      resolveRotationDayNumber(
        {
          cycleLength: 6,
          startDate: '2026-09-01',
          schoolDays: ['2026-09-01', '2026-09-01', ...SEPT],
        },
        '2026-09-02'
      )
    ).toBe(2);
  });

  it('returns null for an unmarked date', () => {
    expect(
      resolveRotationDayNumber(
        { cycleLength: 6, startDate: '2026-09-01', schoolDays: SEPT },
        '2026-09-05'
      )
    ).toBeNull();
  });

  it('falls back to raw ordering when startDate is undefined', () => {
    // Legacy building docs predate the field, so it can be absent at runtime.
    expect(
      resolveRotationDayNumber(
        { cycleLength: 6, startDate: undefined, schoolDays: SEPT },
        '2026-09-01'
      )
    ).toBe(1);
  });

  it('falls back to raw ordering when no start date is set', () => {
    expect(
      resolveRotationDayNumber(
        { cycleLength: 6, schoolDays: ['2026-08-31', ...SEPT] },
        '2026-09-01'
      )
    ).toBe(2);
  });

  it('prefers an explicit block over the school-day count', () => {
    expect(
      resolveRotationDayNumber(
        {
          cycleLength: 10,
          startDate: '2026-09-01',
          schoolDays: SEPT,
          blocks: [
            { dayNumber: 4, startDate: '2026-09-01', endDate: '2026-09-30' },
          ],
        },
        '2026-09-02'
      )
    ).toBe(4);
  });

  it('returns null for a non-positive cycle length', () => {
    expect(
      resolveRotationDayNumber(
        { cycleLength: 0, startDate: '2026-09-01', schoolDays: SEPT },
        '2026-09-01'
      )
    ).toBeNull();
  });
});

describe('countPreStartSchoolDays', () => {
  it('counts unique marked days before the start date', () => {
    expect(
      countPreStartSchoolDays(
        ['2026-08-30', '2026-08-31', '2026-08-31', '2026-09-01'],
        '2026-09-01'
      )
    ).toBe(2);
  });

  it('returns 0 when no start date is set', () => {
    expect(countPreStartSchoolDays(['2026-08-31'], '')).toBe(0);
    expect(countPreStartSchoolDays(['2026-08-31'], undefined)).toBe(0);
  });
});

describe('formatRotationDayLabel', () => {
  it('uses the custom day name when present', () => {
    expect(formatRotationDayLabel(1, { 1: 'Loon' }, 'Day')).toBe('Loon');
  });

  it('falls back to the day label for a blank custom name', () => {
    expect(formatRotationDayLabel(2, { 2: '   ' }, 'Day')).toBe('Day 2');
  });

  it('falls back to "Day" when no label is configured', () => {
    expect(formatRotationDayLabel(3, undefined, undefined)).toBe('Day 3');
  });
});

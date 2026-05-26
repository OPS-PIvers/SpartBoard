import { describe, it, expect } from 'vitest';
import {
  parseTime,
  computeIsPast,
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
    expect(
      computeIsPast(
        undefined,
        undefined as unknown as string,
        false,
        NOW_MINUTES
      )
    ).toBe(false);
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

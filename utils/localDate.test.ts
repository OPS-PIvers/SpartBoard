import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getLocalIsoDate,
  combineDateAndTime,
  splitDueAtToInputs,
  dueInputsToEpoch,
  DEFAULT_DUE_TIME,
} from '@/utils/localDate';

describe('getLocalIsoDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a date as YYYY-MM-DD', () => {
    const date = new Date(2023, 4, 15); // May 15, 2023
    expect(getLocalIsoDate(date)).toBe('2023-05-15');
  });

  it('pads months with leading zeros', () => {
    const date = new Date(2023, 0, 5); // Jan 5, 2023
    expect(getLocalIsoDate(date)).toBe('2023-01-05');
  });

  it('pads days with leading zeros', () => {
    const date = new Date(2023, 10, 9); // Nov 9, 2023
    expect(getLocalIsoDate(date)).toBe('2023-11-09');
  });

  it('handles year-end dates correctly', () => {
    const date = new Date(2023, 11, 31); // Dec 31, 2023
    expect(getLocalIsoDate(date)).toBe('2023-12-31');
  });

  it('handles leap years correctly', () => {
    const date = new Date(2024, 1, 29); // Feb 29, 2024
    expect(getLocalIsoDate(date)).toBe('2024-02-29');
  });

  it('uses the current date if no argument is provided', () => {
    const mockDate = new Date(2025, 2, 10); // March 10, 2025
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    expect(getLocalIsoDate()).toBe('2025-03-10');
  });
});

describe('splitDueAtToInputs', () => {
  it('returns an empty date (and the default time) for no due date', () => {
    expect(splitDueAtToInputs(null)).toEqual({
      date: '',
      time: DEFAULT_DUE_TIME,
    });
    expect(splitDueAtToInputs(undefined)).toEqual({
      date: '',
      time: DEFAULT_DUE_TIME,
    });
    expect(splitDueAtToInputs(0)).toEqual({ date: '', time: DEFAULT_DUE_TIME });
    expect(splitDueAtToInputs(Number.NaN)).toEqual({
      date: '',
      time: DEFAULT_DUE_TIME,
    });
  });

  it('surfaces a date-only value (no time flag) as its UTC calendar date + default time', () => {
    // What a bare <input type="date"> produced before the time picker landed.
    const legacy = Date.UTC(2026, 5, 10, 0, 0, 0);
    expect(splitDueAtToInputs(legacy)).toEqual({
      date: '2026-06-10',
      time: DEFAULT_DUE_TIME,
    });
  });

  it('round-trips a date+time pick back to the same input strings (hasTime)', () => {
    const epoch = dueInputsToEpoch('2026-06-10', '18:30');
    expect(epoch).not.toBeNull();
    expect(splitDueAtToInputs(epoch, true)).toEqual({
      date: '2026-06-10',
      time: '18:30',
    });
  });

  it('the hasTime FLAG (not the epoch value) governs at UTC midnight — the evening-pick regression', () => {
    // A 7pm-CDT pick lands on exactly UTC midnight; with no flag the old
    // value-based heuristic mangled it. Now the flag alone decides: same epoch,
    // two different correct readings.
    const epoch = combineDateAndTime('2026-06-10', '00:00');
    expect(epoch).not.toBeNull();
    expect(splitDueAtToInputs(epoch, false)).toEqual({
      date: '2026-06-10',
      time: DEFAULT_DUE_TIME,
    });
    expect(splitDueAtToInputs(epoch, true)).toEqual({
      date: '2026-06-10',
      time: '00:00',
    });
  });
});

/**
 * Regression test: AssignBehaviorSummary UTC date-parsing bug.
 *
 * Before the fix, QuizManager and VideoActivityManager used:
 *   dateInputValue = new Date(dueAt).toISOString().slice(0, 10)  // UTC date
 *   onDueAtChange(new Date(val).getTime())                        // UTC midnight
 *
 * `new Date('YYYY-MM-DD')` parses the string as UTC midnight.  In a UTC−5
 * school timezone that epoch is 7 PM on the PRIOR day — so "due July 4"
 * expired at 7 PM on July 3 for US teachers, and the date input showed July 3
 * after reload because toISOString() returned the UTC calendar date.
 *
 * After the fix the two components use dueInputsToEpoch + splitDueAtToInputs
 * (hasTime=true) so the stored epoch is LOCAL end-of-day and the displayed
 * date round-trips through local getters without a timezone shift.
 */
describe('AssignBehaviorSummary due-date UTC regression', () => {
  it('dueInputsToEpoch produces a LOCAL end-of-day epoch, not UTC midnight', () => {
    // UTC midnight and local end-of-day are always different (by 23:59 min at
    // most in UTC, or an entire timezone offset in non-UTC zones).
    const utcMidnight = new Date('2026-07-04').getTime();
    const localEndOfDay = dueInputsToEpoch('2026-07-04', DEFAULT_DUE_TIME);

    // The local end-of-day epoch must be strictly greater than UTC midnight
    // (even in UTC the end-of-day is 23 hours 59 minutes later than midnight).
    expect(localEndOfDay).not.toBeNull();
    expect(localEndOfDay as number).toBeGreaterThan(utcMidnight);

    // Specifically it should equal local July 4 at 23:59.
    const expectedEndOfDay = new Date(2026, 6, 4, 23, 59, 0, 0).getTime();
    expect(localEndOfDay).toBe(expectedEndOfDay);
  });

  it('splitDueAtToInputs(hasTime=true) round-trips the picker value with no timezone shift', () => {
    // Simulate the full write→display round-trip:
    //   1. Teacher picks "2026-07-04" in the date input.
    //   2. handleDateChange stores dueInputsToEpoch('2026-07-04', DEFAULT_DUE_TIME).
    //   3. On the next render, dateInputValue = splitDueAtToInputs(dueAt, true).date.
    // The displayed date must equal the date the teacher entered — no off-by-one.
    const stored = dueInputsToEpoch('2026-07-04', DEFAULT_DUE_TIME);
    expect(stored).not.toBeNull();
    const { date: displayed } = splitDueAtToInputs(stored, true);
    expect(displayed).toBe('2026-07-04');
  });

  it('the old new Date(string).getTime() path would have stored UTC midnight, not local end-of-day', () => {
    // Confirm the bug that the fix removes: `new Date('YYYY-MM-DD').getTime()`
    // always returns UTC midnight, which is different from local end-of-day.
    // This test documents the pre-fix behavior so reviewers can see exactly
    // what changed and why the fix is necessary.
    const buggyEpoch = new Date('2026-07-04').getTime(); // UTC midnight
    const { date: displayedAfterBuggyRoundTrip } = splitDueAtToInputs(
      buggyEpoch,
      true // as the fixed code would read it back — local getters
    );
    // In UTC the local date of UTC-midnight July 4 IS July 4 (no shift),
    // but the epoch value itself was midnight not 23:59 — meaning the
    // assignment expired 23h59m earlier than the teacher intended.
    // In UTC− zones this also shifts the displayed date backward one day.
    // Here in the UTC test environment the date matches but the epoch is wrong:
    expect(buggyEpoch).not.toBe(
      dueInputsToEpoch('2026-07-04', DEFAULT_DUE_TIME)
    );
    // The display round-trip shows '2026-07-04' in UTC but would show
    // '2026-07-03' in UTC-5 — demonstrating the timezone sensitivity of the bug.
    expect(displayedAfterBuggyRoundTrip).toBe('2026-07-04'); // only correct in UTC
  });
});

describe('dueInputsToEpoch', () => {
  it('returns null when there is no date (no due date)', () => {
    expect(dueInputsToEpoch('', '12:00')).toBeNull();
    expect(dueInputsToEpoch('', '')).toBeNull();
  });

  it('defaults an empty time to end-of-day', () => {
    expect(dueInputsToEpoch('2026-06-10', '')).toBe(
      combineDateAndTime('2026-06-10', DEFAULT_DUE_TIME)
    );
  });

  it('combines a date + time into a local-datetime epoch (number)', () => {
    expect(dueInputsToEpoch('2026-06-10', '18:30')).toBe(
      combineDateAndTime('2026-06-10', '18:30')
    );
  });

  it('returns null for a malformed date/time', () => {
    expect(dueInputsToEpoch('not-a-date', '18:30')).toBeNull();
  });
});

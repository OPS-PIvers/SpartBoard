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

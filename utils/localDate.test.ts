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

  it('surfaces a UTC-midnight value at its actual local wall-clock (no legacy rewrite)', () => {
    // A UTC-midnight epoch is NOT special-cased: in a behind-UTC timezone a
    // legitimate evening pick (7:00 PM CDT / 6:00 PM CST) lands on exact UTC
    // midnight, so rewriting it to 23:59 would corrupt a real pick. In the
    // UTC test env this surfaces verbatim as 00:00.
    const utcMidnight = Date.UTC(2026, 5, 10, 0, 0, 0);
    expect(splitDueAtToInputs(utcMidnight)).toEqual({
      date: '2026-06-10',
      time: '00:00',
    });
  });

  it('round-trips a midnight pick without rewriting it to end-of-day', () => {
    // Regression guard for the timezone-collision bug: a 00:00 pick must come
    // back as 00:00, never the default end-of-day time.
    const epoch = dueInputsToEpoch('2026-06-10', '00:00');
    expect(epoch).not.toBeNull();
    expect(splitDueAtToInputs(epoch)).toEqual({
      date: '2026-06-10',
      time: '00:00',
    });
  });

  it('round-trips a date+time pick back to the same input strings', () => {
    const epoch = dueInputsToEpoch('2026-06-10', '18:30');
    expect(epoch).not.toBeNull();
    expect(splitDueAtToInputs(epoch)).toEqual({
      date: '2026-06-10',
      time: '18:30',
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

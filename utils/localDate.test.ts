import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLocalIsoDate, combineDateAndTime } from './localDate';

describe('getLocalIsoDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns YYYY-MM-DD for the given date', () => {
    expect(getLocalIsoDate(new Date(2026, 4, 5, 14, 30))).toBe('2026-05-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(getLocalIsoDate(new Date(2026, 0, 3, 0, 0))).toBe('2026-01-03');
  });

  it('uses the current date when no argument is provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 25, 9, 0));
    expect(getLocalIsoDate()).toBe('2026-12-25');
  });
});

describe('combineDateAndTime', () => {
  it('returns null when date is missing', () => {
    expect(combineDateAndTime(undefined, '08:00')).toBeNull();
    expect(combineDateAndTime('', '08:00')).toBeNull();
  });

  it('returns null when time is missing', () => {
    expect(combineDateAndTime('2026-05-05', undefined)).toBeNull();
    expect(combineDateAndTime('2026-05-05', '')).toBeNull();
  });

  it('returns null for malformed date strings', () => {
    expect(combineDateAndTime('2026/05/05', '08:00')).toBeNull();
    expect(combineDateAndTime('not-a-date', '08:00')).toBeNull();
    expect(combineDateAndTime('2026-5-5', '08:00')).toBeNull(); // not zero-padded
  });

  it('returns null for malformed time strings', () => {
    expect(combineDateAndTime('2026-05-05', '8am')).toBeNull();
    expect(combineDateAndTime('2026-05-05', '08')).toBeNull();
  });

  it('returns a millisecond timestamp for valid input', () => {
    const ms = combineDateAndTime('2026-05-05', '14:30');
    expect(ms).not.toBeNull();
    const dt = new Date(ms as number);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(4); // May, 0-indexed
    expect(dt.getDate()).toBe(5);
    expect(dt.getHours()).toBe(14);
    expect(dt.getMinutes()).toBe(30);
  });

  it('rejects month 0 and month 13 (out of range)', () => {
    expect(combineDateAndTime('2026-00-05', '08:00')).toBeNull();
    expect(combineDateAndTime('2026-13-05', '08:00')).toBeNull();
  });

  it('rejects day 0 and day 32 (out of range)', () => {
    expect(combineDateAndTime('2026-05-00', '08:00')).toBeNull();
    expect(combineDateAndTime('2026-05-32', '08:00')).toBeNull();
  });

  it('rejects Feb 31 (would silently roll to Mar 3 without round-trip check)', () => {
    expect(combineDateAndTime('2026-02-31', '08:00')).toBeNull();
  });

  it('rejects Feb 30 in a non-leap year', () => {
    expect(combineDateAndTime('2026-02-30', '08:00')).toBeNull();
  });

  it('accepts Feb 29 in a leap year', () => {
    const ms = combineDateAndTime('2024-02-29', '08:00');
    expect(ms).not.toBeNull();
    const dt = new Date(ms as number);
    expect(dt.getMonth()).toBe(1); // February
    expect(dt.getDate()).toBe(29);
  });

  it('rejects Feb 29 in a non-leap year', () => {
    expect(combineDateAndTime('2026-02-29', '08:00')).toBeNull();
  });

  it('rejects hour 24 and hour -1', () => {
    expect(combineDateAndTime('2026-05-05', '24:00')).toBeNull();
  });

  it('rejects minute 60', () => {
    expect(combineDateAndTime('2026-05-05', '08:60')).toBeNull();
  });

  it('accepts boundary values 00:00 and 23:59', () => {
    expect(combineDateAndTime('2026-05-05', '00:00')).not.toBeNull();
    expect(combineDateAndTime('2026-05-05', '23:59')).not.toBeNull();
  });
});

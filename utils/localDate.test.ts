import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLocalIsoDate } from '@/utils/localDate';

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

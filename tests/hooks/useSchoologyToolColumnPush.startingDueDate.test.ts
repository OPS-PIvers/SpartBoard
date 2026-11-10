import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ functions: {} }));

import {
  localDateString,
  startingDueDate,
} from '@/hooks/useSchoologyToolColumnPush';

describe('startingDueDate', () => {
  it('prefers the close time, read as a local date', () => {
    const close = new Date(2026, 10, 14, 15, 30).getTime();
    expect(startingDueDate(close, Date.UTC(2026, 10, 20))).toBe('2026-11-14');
  });

  it('reads a date-only due date as its UTC calendar date', () => {
    expect(startingDueDate(null, Date.UTC(2026, 5, 10))).toBe('2026-06-10');
  });

  it('reads a due date with a time as a local date', () => {
    const due = new Date(2026, 5, 10, 8, 15).getTime();
    expect(startingDueDate(undefined, due)).toBe('2026-06-10');
  });

  it('falls back to today', () => {
    expect(startingDueDate(null, null)).toBe(localDateString(Date.now()));
  });
});

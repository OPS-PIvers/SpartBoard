import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCentralDayKey,
  hasSubmittedToday,
  reportRowLabel,
} from './lunchCountFormat';

describe('hasSubmittedToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const label = reportRowLabel('11:30', 'Grade 2', 'Smith');
  const today = () => ({
    lastSubmittedDate: getCentralDayKey(),
    lastSubmittedWidgetId: 'w1',
    lastSubmittedLabel: label,
  });

  it('blocks the same row from the same widget on the same day', () => {
    expect(hasSubmittedToday(today(), 'w1', label)).toBe(true);
  });

  it('lets the same widget send a different class the same day', () => {
    const other = reportRowLabel('12:00', 'Grade 3', 'Smith');
    expect(hasSubmittedToday(today(), 'w1', other)).toBe(false);
  });

  it('lets a duplicated widget submit', () => {
    expect(hasSubmittedToday(today(), 'w2', label)).toBe(false);
  });

  it('resets the next Central day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'));
    const config = today();
    vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));
    expect(hasSubmittedToday(config, 'w1', label)).toBe(false);
  });

  it('uses the Central date near UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T03:00:00Z'));
    expect(getCentralDayKey()).toBe('2026-11-05');
  });
});

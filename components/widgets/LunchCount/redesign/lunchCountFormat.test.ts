import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCentralDayKey,
  hasSubmittedToday,
  reportClassKey,
  submittedMarker,
} from './lunchCountFormat';

describe('Lunch Count submitted marker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const classA = reportClassKey('11:30', 'GR2');
  const classB = reportClassKey('12:00', 'GR3');
  const sentA = () => submittedMarker({}, 'w1', getCentralDayKey(), classA);

  it('blocks the same class from the same widget on the same day', () => {
    expect(hasSubmittedToday(sentA(), 'w1', classA)).toBe(true);
  });

  it('lets the same widget send a different class the same day', () => {
    expect(hasSubmittedToday(sentA(), 'w1', classB)).toBe(false);
  });

  it('still blocks the first class after a second one is sent', () => {
    const both = submittedMarker(sentA(), 'w1', getCentralDayKey(), classB);
    expect(both.lastSubmittedClasses).toEqual([classA, classB]);
    expect(hasSubmittedToday(both, 'w1', classA)).toBe(true);
    expect(hasSubmittedToday(both, 'w1', classB)).toBe(true);
  });

  it('ignores the reporter name, so a co-teacher on a synced board is blocked too', () => {
    expect(classA).toBe('11:30 - GR2');
    expect(
      hasSubmittedToday(sentA(), 'w1', reportClassKey('11:30', 'GR2'))
    ).toBe(true);
  });

  it('lets a duplicated widget submit', () => {
    expect(hasSubmittedToday(sentA(), 'w2', classA)).toBe(false);
  });

  it('blocks on an older marker that has no class list', () => {
    const legacy = {
      lastSubmittedDate: getCentralDayKey(),
      lastSubmittedWidgetId: 'w1',
    };
    expect(hasSubmittedToday(legacy, 'w1', classB)).toBe(true);
  });

  it('starts a fresh list on a new day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'));
    const yesterday = sentA();
    vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));
    expect(hasSubmittedToday(yesterday, 'w1', classA)).toBe(false);
    const today = submittedMarker(yesterday, 'w1', getCentralDayKey(), classB);
    expect(today.lastSubmittedClasses).toEqual([classB]);
  });

  it('uses the Central date near UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T03:00:00Z'));
    expect(getCentralDayKey()).toBe('2026-11-05');
  });
});

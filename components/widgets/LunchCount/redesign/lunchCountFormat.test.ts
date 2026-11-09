import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCentralDayKey,
  hasSubmittedToday,
  reportClassKey,
  submittedClassKey,
  sentDetailsToday,
  submittedMarker,
} from './lunchCountFormat';

describe('Lunch Count submitted marker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const classA = reportClassKey('11:30', 'GR2');
  const classB = reportClassKey('12:00', 'GR3');
  const details = { notes: '2 gluten free', extraPizza: 3 };
  const sentA = () =>
    submittedMarker({}, 'w1', getCentralDayKey(), classA, details);

  it('blocks the same class from the same widget on the same day', () => {
    expect(hasSubmittedToday(sentA(), 'w1', classA)).toBe(true);
  });

  it('lets the same widget send a different class the same day', () => {
    expect(hasSubmittedToday(sentA(), 'w1', classB)).toBe(false);
  });

  it('still blocks the first class after a second one is sent', () => {
    const both = submittedMarker(
      sentA(),
      'w1',
      getCentralDayKey(),
      classB,
      details
    );
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

  it('lets the same widget send another class roster with the same time and grade', () => {
    const day = getCentralDayKey();
    const first = submittedClassKey('11:30', 'GR2', 'roster-a');
    const second = submittedClassKey('11:30', 'GR2', 'roster-b');
    const sent = submittedMarker({}, 'w1', day, first, details);
    expect(hasSubmittedToday(sent, 'w1', first)).toBe(true);
    expect(hasSubmittedToday(sent, 'w1', second)).toBe(false);
    expect(submittedClassKey('11:30', 'GR2', null)).toBe('11:30 - GR2');
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
    const today = submittedMarker(
      yesterday,
      'w1',
      getCentralDayKey(),
      classB,
      details
    );
    expect(today.lastSubmittedClasses).toEqual([classB]);
  });

  it('keeps what was sent per class and drops it on a new day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'));
    const sent = sentA();
    expect(sentDetailsToday(sent, 'w1', classA)).toEqual(details);
    expect(sentDetailsToday(sent, 'w1', classB)).toBeUndefined();
    expect(sentDetailsToday(sent, 'w2', classA)).toBeUndefined();
    vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));
    expect(sentDetailsToday(sent, 'w1', classA)).toBeUndefined();
  });

  it('uses the Central date near UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T03:00:00Z'));
    expect(getCentralDayKey()).toBe('2026-11-05');
  });
});

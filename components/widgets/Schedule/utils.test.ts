import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeEffectiveTimes,
  formatCountdown,
  getItemDurationSeconds,
  parseScheduleTime,
  parseScheduleTimeSeconds,
} from './utils';
import { ScheduleItem } from '@/types';

const clockItem = (
  startTime: string,
  endTime?: string,
  overrides: Partial<ScheduleItem> = {}
): ScheduleItem => ({
  task: 'Clock event',
  startTime,
  ...(endTime !== undefined ? { endTime } : {}),
  ...overrides,
});

const timerItem = (
  durationSeconds: number | undefined,
  overrides: Partial<ScheduleItem> = {}
): ScheduleItem => ({
  task: 'Timer event',
  mode: 'timer',
  ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  ...overrides,
});

describe('parseScheduleTime / parseScheduleTimeSeconds', () => {
  it('parses HH:MM to minutes since midnight', () => {
    expect(parseScheduleTime('09:30')).toBe(9 * 60 + 30);
  });

  it('returns -1 for invalid inputs', () => {
    expect(parseScheduleTime(undefined)).toBe(-1);
    expect(parseScheduleTime('')).toBe(-1);
    expect(parseScheduleTime('9:30')).toBe(9 * 60 + 30); // single-digit hour tolerated
    expect(parseScheduleTime('25:00')).toBe(-1);
    expect(parseScheduleTime('09:61')).toBe(-1);
    expect(parseScheduleTime('abc')).toBe(-1);
  });

  it('parses HH:MM to seconds since midnight', () => {
    expect(parseScheduleTimeSeconds('10:05')).toBe(10 * 3600 + 5 * 60);
  });
});

describe('getItemDurationSeconds', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns durationSeconds when valid', () => {
    expect(getItemDurationSeconds(timerItem(300))).toBe(300);
  });

  it('falls back to endTime-startTime for legacy timer items', () => {
    const legacy = timerItem(undefined, {
      startTime: '09:00',
      endTime: '09:15',
    });
    expect(getItemDurationSeconds(legacy)).toBe(15 * 60);
  });

  it('returns 0 when duration is zero', () => {
    expect(getItemDurationSeconds(timerItem(0))).toBe(0);
  });

  it('returns 0 when duration is negative', () => {
    expect(getItemDurationSeconds(timerItem(-5))).toBe(0);
  });

  it('returns 0 when duration is NaN', () => {
    expect(getItemDurationSeconds(timerItem(NaN))).toBe(0);
  });

  it('returns 0 when duration is Infinity', () => {
    expect(getItemDurationSeconds(timerItem(Infinity))).toBe(0);
  });

  it('returns 0 when no duration or legacy fallback is available', () => {
    expect(getItemDurationSeconds(timerItem(undefined))).toBe(0);
  });
});

describe('computeEffectiveTimes', () => {
  it('returns empty array for empty input', () => {
    expect(computeEffectiveTimes([])).toEqual([]);
  });

  it('computes clock-mode items from explicit start/end times', () => {
    const items = [clockItem('09:00', '09:30'), clockItem('10:00', '10:45')];
    const result = computeEffectiveTimes(items);
    expect(result[0]).toEqual({
      startSec: 9 * 3600,
      endSec: 9 * 3600 + 30 * 60,
      isIdle: false,
    });
    expect(result[1]).toEqual({
      startSec: 10 * 3600,
      endSec: 10 * 3600 + 45 * 60,
      isIdle: false,
    });
  });

  it('infers endSec from the next clock-mode start when endTime is missing', () => {
    const items = [clockItem('09:00'), clockItem('10:00', '10:30')];
    const result = computeEffectiveTimes(items);
    expect(result[0].endSec).toBe(10 * 3600);
    expect(result[0].isIdle).toBe(false);
  });

  it('marks first timer-mode item as idle (no prior anchor)', () => {
    const items = [timerItem(300), timerItem(600)];
    const result = computeEffectiveTimes(items);
    expect(result[0].isIdle).toBe(true);
    // Cascades: idle item leaves no anchor for the next timer item either.
    expect(result[1].isIdle).toBe(true);
  });

  it('chains timer-mode items off previous clock-mode endSec', () => {
    const items = [
      clockItem('09:00', '09:10'), // ends at 09:10
      timerItem(120), // 2 min after 09:10 -> 09:12
      timerItem(60), // 1 min after 09:12 -> 09:13
    ];
    const result = computeEffectiveTimes(items);
    expect(result[1]).toEqual({
      startSec: 9 * 3600 + 10 * 60,
      endSec: 9 * 3600 + 12 * 60,
      isIdle: false,
    });
    expect(result[2]).toEqual({
      startSec: 9 * 3600 + 12 * 60,
      endSec: 9 * 3600 + 13 * 60,
      isIdle: false,
    });
  });

  it('marks timer item as idle when duration is 0', () => {
    const items = [clockItem('09:00', '09:10'), timerItem(0)];
    const result = computeEffectiveTimes(items);
    expect(result[1].isIdle).toBe(true);
  });

  it('uses legacy endTime inference for timer items without durationSeconds', () => {
    const items = [
      clockItem('09:00', '09:10'),
      timerItem(undefined, { startTime: '09:10', endTime: '09:20' }),
    ];
    const result = computeEffectiveTimes(items);
    expect(result[1].isIdle).toBe(false);
    expect(result[1].endSec - result[1].startSec).toBe(10 * 60);
  });

  it('cascades idle when a timer item follows an idle item', () => {
    const items = [timerItem(300), timerItem(300), timerItem(300)];
    const result = computeEffectiveTimes(items);
    expect(result.every((e) => e.isIdle)).toBe(true);
  });

  it('clock-mode item with invalid startTime is idle', () => {
    const items = [clockItem('', '10:00')];
    const result = computeEffectiveTimes(items);
    expect(result[0].isIdle).toBe(true);
  });

  it('mixed schedule: clock, timer, clock works as expected', () => {
    const items = [
      clockItem('09:00', '09:15'),
      timerItem(600), // 10 min after 09:15 -> 09:25
      clockItem('10:00', '10:30'),
    ];
    const result = computeEffectiveTimes(items);
    expect(result[0].isIdle).toBe(false);
    expect(result[1]).toEqual({
      startSec: 9 * 3600 + 15 * 60,
      endSec: 9 * 3600 + 25 * 60,
      isIdle: false,
    });
    expect(result[2]).toEqual({
      startSec: 10 * 3600,
      endSec: 10 * 3600 + 30 * 60,
      isIdle: false,
    });
  });
});

describe('formatCountdown', () => {
  it('formats seconds under an hour as M:SS', () => {
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('formats seconds over an hour as H:MM:SS', () => {
    expect(formatCountdown(3661)).toBe('1:01:01');
  });

  it('clamps negative values to 0', () => {
    expect(formatCountdown(-10)).toBe('0:00');
  });
});

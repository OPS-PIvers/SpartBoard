import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTourRun, startTourRunLog, type TourRun } from './tourRuns';

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: false }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
});

const writer = () => vi.fn((_run: TourRun) => Promise.resolve());

describe('startTourRunLog', () => {
  it('writes at start, at most once per interval while running, and at the end', () => {
    const write = writer();
    const log = startTourRunLog(
      'set',
      'uid',
      { v: 7, furthest: 0 },
      write,
      30_000
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual({
      v: 7,
      startedAt: 1000,
      furthest: 0,
      done: false,
      misses: [],
    });
    log.update({ furthest: 1 });
    log.miss('b');
    log.update({ furthest: 2 });
    log.update({ furthest: 1 });
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toMatchObject({
      furthest: 2,
      misses: ['b'],
    });

    log.miss('b');
    log.end({ done: false, exit: 2 });
    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls[2][0]).toMatchObject({ done: false, exit: 2 });
    log.update({ furthest: 3 });
    log.end({ done: true });
    vi.advanceTimersByTime(60_000);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('marks a finished run done without an exit step', () => {
    const write = writer();
    const log = startTourRunLog('set', 'uid', { v: 1, furthest: 0 }, write);
    log.end({ done: true });
    expect(write.mock.calls[1][0]).toMatchObject({ done: true });
    expect(write.mock.calls[1][0]).not.toHaveProperty('exit');
  });

  it('stops adding misses at the rules cap', () => {
    const write = writer();
    const log = startTourRunLog('set', 'uid', { v: 1, furthest: 0 }, write);
    for (let i = 0; i < 60; i++) log.miss(`s${i}`);
    log.flush();
    expect(write.mock.calls[1][0].misses).toHaveLength(50);
  });
});

describe('parseTourRun', () => {
  it('reads a run and rejects malformed docs', () => {
    expect(
      parseTourRun({
        v: 1,
        startedAt: 2,
        furthest: 3,
        done: true,
        misses: ['a', 4],
      })
    ).toEqual({ v: 1, startedAt: 2, furthest: 3, done: true, misses: ['a'] });
    expect(parseTourRun({ v: 'x', furthest: 0, misses: [] })).toBeNull();
    expect(parseTourRun(null)).toBeNull();
  });
});

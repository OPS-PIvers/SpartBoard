import { describe, expect, it } from 'vitest';
import {
  appendPauseSpan,
  attemptClockRanOut,
  clampQuizTimeLimitMinutes,
  formatTimeLeft,
  pausedMsSince,
  resolveAttemptDeadline,
  timestampMillis,
} from './quizTimeLimit';

describe('clampQuizTimeLimitMinutes', () => {
  it('keeps whole minutes in range', () => {
    expect(clampQuizTimeLimitMinutes(30)).toBe(30);
    expect(clampQuizTimeLimitMinutes('45')).toBe(45);
    expect(clampQuizTimeLimitMinutes(999)).toBe(240);
    expect(clampQuizTimeLimitMinutes(0.4)).toBe(1);
  });

  it('treats missing, zero and junk as no limit', () => {
    expect(clampQuizTimeLimitMinutes(null)).toBeNull();
    expect(clampQuizTimeLimitMinutes(undefined)).toBeNull();
    expect(clampQuizTimeLimitMinutes(0)).toBeNull();
    expect(clampQuizTimeLimitMinutes('abc')).toBeNull();
  });
});

describe('resolveAttemptDeadline', () => {
  const start = 1_000_000;

  it('adds the limit to the attempt start', () => {
    expect(resolveAttemptDeadline(start, 30, undefined)).toBe(
      start + 30 * 60_000
    );
  });

  it('scales by extended time', () => {
    expect(resolveAttemptDeadline(start, 30, 1.5)).toBe(start + 45 * 60_000);
    expect(resolveAttemptDeadline(start, 30, 2)).toBe(start + 60 * 60_000);
  });

  it('has no deadline for unlimited time, no limit, or no start yet', () => {
    expect(resolveAttemptDeadline(start, 30, 'unlimited')).toBeNull();
    expect(resolveAttemptDeadline(start, null, undefined)).toBeNull();
    expect(resolveAttemptDeadline(null, 30, undefined)).toBeNull();
  });
});

describe('pauses and the deadline', () => {
  const start = 1_000_000;
  const min = 60_000;

  it('pushes the deadline out by a pause that happened during the attempt', () => {
    const spans = [{ from: start + 5 * min, to: start + 15 * min }];
    expect(resolveAttemptDeadline(start, 30, undefined, spans)).toBe(
      start + 40 * min
    );
  });

  it('counts only the part of a pause after the attempt started', () => {
    const spans = [{ from: start - 10 * min, to: start + 2 * min }];
    expect(pausedMsSince(start, spans)).toBe(2 * min);
    expect(pausedMsSince(start, [{ from: start - 9, to: start - 1 }])).toBe(0);
  });

  it('ignores malformed spans', () => {
    expect(pausedMsSince(start, [{ from: 5, to: 1 }])).toBe(0);
    expect(pausedMsSince(start, undefined)).toBe(0);
  });

  it('appends a closed span on resume and keeps the newest 100', () => {
    expect(appendPauseSpan(undefined, 100, 250)).toEqual([
      { from: 100, to: 250 },
    ]);
    expect(appendPauseSpan([{ from: 1, to: 2 }], undefined, 250)).toBeNull();
    const many = Array.from({ length: 100 }, (_, i) => ({
      from: i,
      to: i + 1,
    }));
    const next = appendPauseSpan(many, 500, 800);
    expect(next).toHaveLength(100);
    expect(next?.[99]).toEqual({ from: 500, to: 800 });
    expect(next?.[0]).toEqual({ from: 1, to: 2 });
  });

  it('adds nothing for a pause an earlier Resume already closed (reopened run)', () => {
    expect(appendPauseSpan([{ from: 100, to: 200 }], 100, 5000)).toBeNull();
  });
});

describe('formatTimeLeft', () => {
  it('formats minutes and seconds, rounding up', () => {
    expect(formatTimeLeft(12 * 60_000 + 34_000)).toBe('12:34');
    expect(formatTimeLeft(59_001)).toBe('1:00');
    expect(formatTimeLeft(-5)).toBe('0:00');
  });

  it('adds hours from an hour up', () => {
    expect(formatTimeLeft(90 * 60_000)).toBe('1:30:00');
  });
});

describe('timestampMillis', () => {
  it('reads Timestamps and numbers', () => {
    expect(timestampMillis({ toMillis: () => 42 })).toBe(42);
    expect(timestampMillis(7)).toBe(7);
    expect(timestampMillis(null)).toBeNull();
  });
});

describe('attemptClockRanOut', () => {
  const start = 1_000_000;

  it('is true for a time-up attempt', () => {
    expect(attemptClockRanOut(true, start, 30, start)).toBe(true);
  });

  it('is true once the base limit has passed, even without timeUp', () => {
    expect(attemptClockRanOut(undefined, start, 30, start + 30 * 60_000)).toBe(
      true
    );
  });

  it('is false while time remains or with no limit', () => {
    expect(attemptClockRanOut(undefined, start, 30, start + 60_000)).toBe(
      false
    );
    expect(attemptClockRanOut(undefined, start, null, start + 1e9)).toBe(false);
    expect(attemptClockRanOut(undefined, null, 30, start + 1e9)).toBe(false);
  });

  it('does not count closed pauses as used time', () => {
    const spans = [{ from: start + 10 * 60_000, to: start + 70 * 60_000 }];
    expect(
      attemptClockRanOut(undefined, start, 30, start + 75 * 60_000, spans)
    ).toBe(false);
    expect(
      attemptClockRanOut(undefined, start, 30, start + 90 * 60_000, spans)
    ).toBe(true);
  });
});

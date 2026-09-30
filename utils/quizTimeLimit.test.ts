import { describe, expect, it } from 'vitest';
import {
  clampQuizTimeLimitMinutes,
  formatTimeLeft,
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

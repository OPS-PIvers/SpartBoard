import { describe, it, expect } from 'vitest';
import {
  resolveResultsVisibility,
  resultsExpiryFromPreset,
  resultsOverrideState,
} from '@/utils/quizResultsVisibility';
import type { QuizResultsOverride } from '@/types';

const NOW = 1_000_000;
const KEY = { q1: 'A' };

const published = {
  scoreVisibility: 'score-responses-and-answers' as const,
  scorePublishedAt: 500,
};
const shown = (
  extra: Partial<Extract<QuizResultsOverride, { mode: 'shown' }>> = {}
): QuizResultsOverride => ({
  mode: 'shown',
  visibility: 'score-only',
  publishedAt: 900,
  ...extra,
});

describe('resolveResultsVisibility', () => {
  it('follows the class when there is no override', () => {
    expect(resolveResultsVisibility({}, {}, NOW)).toEqual({
      visibility: 'none',
      source: 'class',
    });
    expect(
      resolveResultsVisibility(
        { scoreVisibility: 'score-only', scorePublishedAt: 500 },
        {},
        NOW
      )
    ).toEqual({ visibility: 'score-only', publishedAt: 500, source: 'class' });
  });

  it('reads the class answer key from the response first, then the legacy session copy', () => {
    expect(
      resolveResultsVisibility(
        { ...published, revealedAnswers: { q1: 'legacy' } },
        { revealedAnswers: KEY },
        NOW
      ).revealedAnswers
    ).toEqual(KEY);
    expect(
      resolveResultsVisibility(
        { ...published, revealedAnswers: { q1: 'legacy' } },
        {},
        NOW
      ).revealedAnswers
    ).toEqual({ q1: 'legacy' });
  });

  it('shows a Shown student at their own level when the class is unpublished', () => {
    expect(
      resolveResultsVisibility(
        {},
        {
          resultsOverride: shown({
            visibility: 'score-responses-and-answers',
            revealedAnswers: KEY,
          }),
        },
        NOW
      )
    ).toEqual({
      visibility: 'score-responses-and-answers',
      publishedAt: 900,
      source: 'student',
      revealedAnswers: KEY,
    });
  });

  it('keeps a Shown level independent of a higher class publish (D3)', () => {
    const r = resolveResultsVisibility(
      { ...published, revealedAnswers: { q1: 'legacy' } },
      { resultsOverride: shown(), revealedAnswers: KEY },
      NOW
    );
    expect(r.visibility).toBe('score-only');
    expect(r.revealedAnswers).toBeUndefined();
  });

  it('hides a Hidden student even when the class is published', () => {
    expect(
      resolveResultsVisibility(
        published,
        { resultsOverride: { mode: 'hidden', publishedAt: 900 } },
        NOW
      )
    ).toEqual({ visibility: 'none', source: 'student' });
  });

  it('falls back to the class once the override expires (D7)', () => {
    const expired = shown({ expiresAt: NOW });
    expect(
      resolveResultsVisibility({}, { resultsOverride: expired }, NOW)
    ).toEqual({ visibility: 'none', source: 'class' });
    expect(
      resolveResultsVisibility(published, { resultsOverride: expired }, NOW)
        .visibility
    ).toBe('score-responses-and-answers');
    expect(
      resolveResultsVisibility(
        {},
        { resultsOverride: shown({ expiresAt: NOW + 1 }) },
        NOW
      ).visibility
    ).toBe('score-only');
  });
});

describe('resultsOverrideState', () => {
  it('names each state', () => {
    expect(resultsOverrideState(undefined, NOW)).toBe('follows');
    expect(resultsOverrideState(shown(), NOW)).toBe('shown');
    expect(resultsOverrideState({ mode: 'hidden', publishedAt: 1 }, NOW)).toBe(
      'hidden'
    );
    expect(resultsOverrideState(shown({ expiresAt: NOW - 1 }), NOW)).toBe(
      'expired'
    );
    expect(resultsOverrideState(shown({ expiresAt: null }), NOW)).toBe('shown');
  });
});

describe('resultsExpiryFromPreset', () => {
  it('computes each preset', () => {
    const now = new Date(2026, 8, 21, 10, 0, 0).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    expect(resultsExpiryFromPreset('none', now)).toBeNull();
    expect(resultsExpiryFromPreset('3days', now)).toBe(now + 3 * DAY);
    expect(resultsExpiryFromPreset('1week', now)).toBe(now + 7 * DAY);
    const eod = new Date(resultsExpiryFromPreset('today', now) as number);
    expect([eod.getDate(), eod.getHours(), eod.getMinutes()]).toEqual([
      21, 23, 59,
    ]);
  });
});

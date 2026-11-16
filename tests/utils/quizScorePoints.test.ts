import { describe, it, expect } from 'vitest';
import {
  formatScorePoints,
  publishedScorePoints,
} from '@/utils/quizResultsVisibility';

describe('publishedScorePoints', () => {
  it('returns the points when they match the score', () => {
    expect(
      publishedScorePoints({
        completedAttempts: 1,
        score: 75,
        scorePoints: { earned: 18, possible: 24, attempt: 1 },
      })
    ).toEqual({ earned: 18, possible: 24 });
  });

  it('accepts unrounded partial credit that matches the score', () => {
    expect(
      publishedScorePoints({
        completedAttempts: 1,
        score: 8,
        scorePoints: { earned: 1 / 6, possible: 2, attempt: 1 },
      })
    ).toEqual({ earned: 1 / 6, possible: 2 });
  });

  it('ignores points from an earlier attempt', () => {
    expect(
      publishedScorePoints({
        completedAttempts: 2,
        score: 75,
        scorePoints: { earned: 18, possible: 24, attempt: 1 },
      })
    ).toBeNull();
  });

  it('ignores points a later score-only write left stale', () => {
    expect(
      publishedScorePoints({
        completedAttempts: 1,
        score: 50,
        scorePoints: { earned: 18, possible: 24, attempt: 1 },
      })
    ).toBeNull();
  });

  it('ignores points without a score or with nothing possible', () => {
    expect(
      publishedScorePoints({
        completedAttempts: 1,
        score: null,
        scorePoints: { earned: 1, possible: 2, attempt: 1 },
      })
    ).toBeNull();
    expect(
      publishedScorePoints({
        completedAttempts: 1,
        score: 0,
        scorePoints: { earned: 0, possible: 0, attempt: 1 },
      })
    ).toBeNull();
    expect(publishedScorePoints({ score: 75 })).toBeNull();
  });
});

describe('formatScorePoints', () => {
  it('keeps whole numbers plain and partial credit short', () => {
    expect(formatScorePoints(18)).toBe('18');
    expect(formatScorePoints(17.5)).toBe('17.5');
    expect(formatScorePoints(2 / 3)).toBe('0.67');
  });
});

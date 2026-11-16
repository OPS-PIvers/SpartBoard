import { describe, it, expect } from 'vitest';
import {
  formatScorePoints,
  publishedScorePoints,
} from '@/utils/quizResultsVisibility';

describe('publishedScorePoints', () => {
  it('returns the points when they match the score', () => {
    expect(
      publishedScorePoints({
        score: 75,
        scorePoints: { earned: 18, possible: 24 },
      })
    ).toEqual({ earned: 18, possible: 24 });
  });

  it('ignores points a later score-only write left stale', () => {
    expect(
      publishedScorePoints({
        score: 50,
        scorePoints: { earned: 18, possible: 24 },
      })
    ).toBeNull();
  });

  it('ignores points without a score or with nothing possible', () => {
    expect(
      publishedScorePoints({
        score: null,
        scorePoints: { earned: 1, possible: 2 },
      })
    ).toBeNull();
    expect(
      publishedScorePoints({
        score: 0,
        scorePoints: { earned: 0, possible: 0 },
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

import { describe, it, expect } from 'vitest';
import { videoActivityMaxPoints } from '@/utils/videoActivityGrading';
import type { VideoActivityQuestion } from '@/types';

/**
 * The VA mirror of quizMaxPoints. It MUST stay identical in shape to the picker's
 * deep-link line-item denominator and the VA Results push denominator (both call
 * this), so a Schoology grade can't post against the wrong scale.
 */
const q = (points?: number): VideoActivityQuestion =>
  ({ id: 'x', type: 'MC', points }) as unknown as VideoActivityQuestion;

describe('videoActivityMaxPoints', () => {
  it('sums per-question points', () => {
    expect(videoActivityMaxPoints([q(2), q(3), q(5)])).toBe(10);
  });

  it('defaults a missing/undefined points to 1', () => {
    expect(videoActivityMaxPoints([q(), q(), q(4)])).toBe(6);
  });

  it('falls back to 100 when there are no questions', () => {
    expect(videoActivityMaxPoints([])).toBe(100);
  });

  it('falls back to 100 when the summed points are 0', () => {
    expect(videoActivityMaxPoints([q(0)])).toBe(100);
  });
});

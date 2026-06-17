import { describe, it, expect } from 'vitest';
import { videoActivityMaxPoints } from '@/utils/videoActivityGrading';
import type { VideoActivityQuestion } from '@/types';

/**
 * The VA mirror of quizMaxPoints. It MUST stay identical in shape to the picker's
 * deep-link line-item denominator and the VA Results push denominator (both call
 * this), so a Schoology grade can't post against the wrong scale.
 */
const q = (points?: number, id = 'x'): VideoActivityQuestion =>
  ({ id, type: 'MC', points }) as unknown as VideoActivityQuestion;

describe('videoActivityMaxPoints', () => {
  it('sums per-question points', () => {
    expect(videoActivityMaxPoints([q(2, 'a'), q(3, 'b'), q(5, 'c')])).toBe(10);
  });

  it('defaults a missing/undefined points to 1', () => {
    expect(
      videoActivityMaxPoints([q(undefined, 'a'), q(undefined, 'b'), q(4, 'c')])
    ).toBe(6);
  });

  it('falls back to 100 when there are no questions', () => {
    expect(videoActivityMaxPoints([])).toBe(100);
  });

  it('falls back to 100 when the summed points are 0', () => {
    expect(videoActivityMaxPoints([q(0)])).toBe(100);
  });

  it('deduplicates questions with the same id (Drive-sync duplicate guard)', () => {
    // Drive-sync or arrayUnion races can write the same question ID twice.
    // videoActivityMaxPoints is frozen into the Schoology scoreMaximum at
    // attach time and reused at push time; if duplicates inflate it, the
    // pushed fraction is wrong (e.g. 2/4 instead of the correct 2/2).
    // computeVideoActivityScorePct already deduplicates via a Set<string>;
    // this function must do the same so the denominator stays consistent.
    const dup = q(2); // id === 'x' on both entries
    expect(videoActivityMaxPoints([dup, dup])).toBe(2);
  });
});

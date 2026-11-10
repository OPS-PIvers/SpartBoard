import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep, TourReview } from '@/types';
import { tourPlaytestKey } from '@/components/tours/tourPlaytest';
import { liveCheckNeeded, newestOpenNote } from './liveCheck';

const steps = [
  { id: 'a', tour: { anchor: 'dock.open-tools', action: 'click' } },
  { id: 'b', tour: { anchor: 'board.whole', action: 'observe' } },
] as GuidedLearningStep[];
const note = (at: number) => ({ text: 'Fix this', by: 'a@b.org', at });
const playtest = (at: number, reached = true) => ({
  at,
  by: 'a@b.org',
  fingerprint: tourPlaytestKey(steps),
  steps: steps.map((s) => ({
    stepId: s.id,
    result: reached ? ('found' as const) : ('not-reached' as const),
  })),
});

describe('liveCheckNeeded', () => {
  it('needs no check without open notes', () => {
    expect(liveCheckNeeded(null, steps)).toBe(false);
    expect(liveCheckNeeded({}, steps)).toBe(false);
    expect(liveCheckNeeded({ stepNotes: { gone: note(5) } }, steps)).toBe(
      false
    );
  });

  it('needs a check while a note is newer than the last full play', () => {
    const review: TourReview = { tourNote: note(10), playtest: playtest(5) };
    expect(liveCheckNeeded(review, steps)).toBe(true);
  });

  it('is satisfied by a full play of the current steps after the notes', () => {
    expect(
      liveCheckNeeded(
        { stepNotes: { a: note(10) }, playtest: playtest(20) },
        steps
      )
    ).toBe(false);
    expect(
      liveCheckNeeded(
        { stepNotes: { a: note(10) }, playtest: playtest(20, false) },
        steps
      )
    ).toBe(true);
  });

  it('expires the play when the steps change', () => {
    const review: TourReview = { tourNote: note(1), playtest: playtest(20) };
    expect(liveCheckNeeded(review, [...steps].reverse())).toBe(true);
  });
});

describe('newestOpenNote', () => {
  it('takes the newest note on the tour or a current step', () => {
    expect(
      newestOpenNote(
        { tourNote: note(3), stepNotes: { a: note(7), gone: note(9) } },
        steps
      )
    ).toBe(7);
  });
});

import type { GuidedLearningStep, TourReview } from '@/types';
import { tourPlaytestKey } from '@/components/tours/tourPlaytest';

/** Newest note left on the tour or one of its current steps; null when none are open. */
export const newestOpenNote = (
  review: TourReview | null | undefined,
  steps: readonly Pick<GuidedLearningStep, 'id'>[]
): number | null => {
  if (!review) return null;
  const ids = new Set(steps.map((s) => s.id));
  const times = [
    ...(review.tourNote ? [review.tourNote.at] : []),
    ...Object.entries(review.stepNotes ?? {})
      .filter(([id]) => ids.has(id))
      .map(([, note]) => note.at),
  ];
  return times.length > 0 ? Math.max(...times) : null;
};

/** A Live tour needs a check only while playtest notes are open and it hasn't been played through since. */
export const liveCheckNeeded = (
  review: TourReview | null | undefined,
  steps: readonly Pick<GuidedLearningStep, 'id' | 'tour'>[]
): boolean => {
  const noted = newestOpenNote(review, steps);
  if (noted === null) return false;
  const played = review?.playtest;
  return !(
    played &&
    played.fingerprint === tourPlaytestKey(steps) &&
    played.at > noted &&
    played.steps.every((s) => s.result !== 'not-reached')
  );
};

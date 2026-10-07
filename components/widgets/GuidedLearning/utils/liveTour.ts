import type {
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningTourThumbnail,
} from '@/types';

/** A live tour is a set in tour mode; an anchored step alone does not make one. */
export const isLiveTourSet = (set: Pick<GuidedLearningSet, 'mode'>): boolean =>
  set.mode === 'tour';

/** A tour step's picture, or null when it has none. */
export const tourThumbnail = (
  step: Pick<GuidedLearningStep, 'tour'>
): GuidedLearningTourThumbnail | null =>
  step.tour?.thumbnail?.url ? step.tour.thumbnail : null;

/** The step's picture when it was taken of the step's current anchor. */
export const freshTourThumbnail = (
  step: Pick<GuidedLearningStep, 'tour'>
): GuidedLearningTourThumbnail | null => {
  const thumb = tourThumbnail(step);
  return thumb && thumb.anchor === step.tour?.anchor ? thumb : null;
};

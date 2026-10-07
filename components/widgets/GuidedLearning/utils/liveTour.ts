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

type PictureStep = Pick<GuidedLearningStep, 'tour' | 'imageIndex'>;
type PictureSet = Pick<GuidedLearningSet, 'imageUrls' | 'imageKinds'>;

/** The step's still slide from a tour recorded before thumbnails, or null. */
const legacySlideUrl = (step: PictureStep, set: PictureSet): string | null => {
  const index = step.imageIndex ?? 0;
  const url = set.imageUrls?.[index];
  return url && set.imageKinds?.[index] !== 'video' ? url : null;
};

/** The step's picture URL, falling back to its legacy slide when it has no thumbnail. */
export const tourPictureUrl = (
  step: PictureStep,
  set: PictureSet
): string | null => tourThumbnail(step)?.url ?? legacySlideUrl(step, set);

/** Like `tourPictureUrl`, but a thumbnail of a different anchor counts as none. */
export const freshTourPictureUrl = (
  step: PictureStep,
  set: PictureSet
): string | null =>
  tourThumbnail(step)
    ? (freshTourThumbnail(step)?.url ?? null)
    : legacySlideUrl(step, set);

import type { GuidedLearningSet } from '@/types';

/** Tour mode, or a set from before the mode existed that has a bound step. */
export const isLiveTourSet = (
  set: Pick<GuidedLearningSet, 'mode' | 'steps'>
): boolean => set.mode === 'tour' || set.steps.some((s) => !!s.tour);

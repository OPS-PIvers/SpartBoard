import type { GuidedLearningSet } from '@/types';

/** A live tour is a set in tour mode; an anchored step alone does not make one. */
export const isLiveTourSet = (set: Pick<GuidedLearningSet, 'mode'>): boolean =>
  set.mode === 'tour';

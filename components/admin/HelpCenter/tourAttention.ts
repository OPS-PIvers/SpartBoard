import type { GuidedLearningSet } from '@/types';
import {
  stepVerdict,
  tourHealthOf,
  type TourFieldStats,
} from '@/components/tours/tourHealth';

/** A Live tour needs attention when any step is broken or needs something the tour doesn't open (H18). */
export function tourNeedsAttention(
  set: GuidedLearningSet,
  field: TourFieldStats | null = null
): boolean {
  return tourHealthOf(set).some(
    (health) =>
      stepVerdict(health, set.tourSetup, field, undefined).state !== 'ok'
  );
}

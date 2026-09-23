import type { GuidedLearningStep } from '@/types';

/** Puts a reordered slide's steps back into the slots those steps held in the full list. */
export function reorderSlideSteps(
  steps: GuidedLearningStep[],
  reorderedSlide: GuidedLearningStep[]
): GuidedLearningStep[] {
  const ids = new Set(reorderedSlide.map((s) => s.id));
  let next = 0;
  return steps.map((s) => (ids.has(s.id) ? reorderedSlide[next++] : s));
}

import type { GuidedLearningInteractionType } from '@/types';

/** Interaction types in the order the Studio offers them. */
export const INTERACTION_ORDER: readonly GuidedLearningInteractionType[] = [
  'text-popover',
  'tooltip',
  'audio',
  'video',
  'pan-zoom',
  'pan-zoom-spotlight',
  'spotlight',
  'question',
];

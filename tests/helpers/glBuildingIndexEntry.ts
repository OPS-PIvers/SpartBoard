import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';

// Test fixture: the index entry the glBuildingIndexMirror function would write for a set.
export const toBuildingIndexEntry = (
  set: GuidedLearningSet
): GuidedLearningBuildingSetIndex => ({
  id: set.id,
  title: set.title,
  description: set.description ?? null,
  stepCount: set.steps.length,
  mode: set.mode,
  thumbnail: set.imageUrls[0] ?? '',
  createdAt: set.createdAt,
  updatedAt: set.updatedAt,
  hasLiveTour: set.hasLiveTour ?? set.steps.some((step) => !!step.tour),
  isHelpCenter: set.helpCenter === true,
  folderId: null,
  order: null,
});

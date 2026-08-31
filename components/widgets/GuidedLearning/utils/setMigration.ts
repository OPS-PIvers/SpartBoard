import { GuidedLearningSet, GuidedLearningStep } from '@/types';

type LegacyGuidedLearningSet = GuidedLearningSet & {
  imageUrl?: string;
  imagePath?: string;
};

/** Schema version stamped on new/re-saved sets (zoom persistence + image-relative spotlight). */
export const GL_SET_SCHEMA_VERSION = 2;

/** Absent/1 = legacy semantics; existing sets are never rewritten. */
export function isGuidedLearningSetV2(
  set: Pick<GuidedLearningSet, 'schemaVersion'>
): boolean {
  return (set.schemaVersion ?? 1) >= GL_SET_SCHEMA_VERSION;
}

export function normalizeGuidedLearningSet(
  input: GuidedLearningSet
): GuidedLearningSet {
  const legacy = input as LegacyGuidedLearningSet;

  const imageUrls =
    input.imageUrls && input.imageUrls.length > 0
      ? input.imageUrls
      : legacy.imageUrl
        ? [legacy.imageUrl]
        : [];

  const imagePaths =
    input.imagePaths && input.imagePaths.length > 0
      ? input.imagePaths
      : legacy.imagePath
        ? [legacy.imagePath]
        : undefined;

  const lastImageIndex = Math.max(imageUrls.length - 1, 0);
  const steps: GuidedLearningStep[] = (input.steps ?? []).map((step) => ({
    ...step,
    imageIndex: Math.min(
      Math.max(step.imageIndex ?? 0, 0),
      imageUrls.length > 0 ? lastImageIndex : 0
    ),
    showOverlay: step.showOverlay ?? 'none',
  }));

  return {
    ...input,
    imageUrls,
    imagePaths,
    steps,
  };
}

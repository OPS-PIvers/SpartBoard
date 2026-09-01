import { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { ImageOffset, toImageSpotlightRadiusPct } from './imageUtils';

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

/** True when the step renders a spotlight (and thus reads spotlightRadius). */
export function stepUsesSpotlight(step: GuidedLearningStep): boolean {
  return (
    step.interactionType === 'spotlight' ||
    step.interactionType === 'pan-zoom-spotlight'
  );
}

/** Measured slide footprint used to convert legacy spotlight radii. */
export interface SlideMeasurement {
  imgOffset: ImageOffset;
  containerWidth: number;
  containerHeight: number;
}

/**
 * One-time v1→v2 radius migration: rewrites each spotlight step's
 * container-relative radius as image-relative so the rendered size is
 * preserved. Returns null when any spotlight step's slide is unmeasured —
 * callers must then keep the set on legacy semantics.
 */
export function convertLegacySpotlightRadii(
  steps: GuidedLearningStep[],
  measurements: ReadonlyMap<number, SlideMeasurement>
): GuidedLearningStep[] | null {
  const out: GuidedLearningStep[] = [];
  for (const step of steps) {
    if (!stepUsesSpotlight(step)) {
      out.push(step);
      continue;
    }
    const m = measurements.get(step.imageIndex);
    if (!m) return null;
    const radius = toImageSpotlightRadiusPct(
      step.spotlightRadius ?? 25,
      m.imgOffset,
      m.containerWidth,
      m.containerHeight
    );
    out.push({ ...step, spotlightRadius: Math.round(radius * 100) / 100 });
  }
  return out;
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

import type {
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningTourBinding,
} from '@/types';
import { requiredSchemaVersion } from './setMigration';

const STORAGE_HOST = 'firebasestorage.googleapis.com';

// Drive slides need the author's sign-in, so only Storage pictures carry over.
const storageStill = (
  set: Pick<GuidedLearningSet, 'imageUrls' | 'imageKinds'>,
  index: number
): string | null => {
  const url = set.imageUrls[index];
  if (typeof url !== 'string' || set.imageKinds?.[index] === 'video') {
    return null;
  }
  try {
    return new URL(url).hostname === STORAGE_HOST ? url : null;
  } catch {
    return null;
  }
};

const tourStep = (
  step: GuidedLearningStep,
  set: Pick<GuidedLearningSet, 'imageUrls' | 'imageKinds'>
): GuidedLearningStep => {
  const base: GuidedLearningTourBinding = step.tour ?? {
    anchor: '',
    action: 'click',
  };
  const still = base.thumbnail ? null : storageStill(set, step.imageIndex);
  const tour = still
    ? { ...base, thumbnail: { url: still, anchor: base.anchor, w: 0, h: 0 } }
    : base;
  const label = step.label?.trim();
  const text = [step.text, step.question?.text]
    .map((part) => part?.trim())
    .find((part) => !!part);
  return {
    id: step.id,
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'text-popover',
    calloutTone: 'light',
    ...(label ? { label } : {}),
    ...(text ? { text } : {}),
    tour,
  };
};

/** A new building live tour drafted from a Guided Learning set: one step per step, each waiting for its control. */
export function glSetToLiveTour(
  source: GuidedLearningSet,
  opts: { id: string; now: number; authorUid?: string }
): GuidedLearningSet {
  const steps = source.steps.map((step) => tourStep(step, source));
  return {
    id: opts.id,
    schemaVersion: requiredSchemaVersion({ steps }),
    title: source.title,
    ...(source.description ? { description: source.description } : {}),
    // Tour steps play on the real board, so the set keeps no slides.
    imageUrls: [],
    steps,
    mode: 'tour',
    createdAt: opts.now,
    updatedAt: opts.now,
    isBuilding: true,
    ...(opts.authorUid ? { authorUid: opts.authorUid } : {}),
    tourSetup: { widgets: [] },
    hasLiveTour: steps.length > 0,
  };
}

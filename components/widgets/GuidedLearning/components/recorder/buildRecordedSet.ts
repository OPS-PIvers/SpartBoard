import type { GuidedLearningSet, WidgetType } from '@/types';
import type { TourRecording } from './useTourCapture';

interface BuildOptions {
  id: string;
  title: string;
  /** Uploaded slide URLs, one per recorded frame, in order. */
  imageUrls: string[];
  imagePaths?: string[];
  slideThumbnails?: Record<string, string>;
  /** Widget types on the board when recording started. */
  widgets: WidgetType[];
  now?: number;
}

/** A v3 building set from a recording: one slide per frame, one tooltip step per click. */
export function buildRecordedSet(
  recording: Pick<TourRecording, 'steps'>,
  opts: BuildOptions
): GuidedLearningSet {
  const now = opts.now ?? Date.now();
  return {
    id: opts.id,
    schemaVersion: 3,
    title: opts.title,
    imageUrls: opts.imageUrls,
    ...(opts.imagePaths?.length ? { imagePaths: opts.imagePaths } : {}),
    ...(opts.slideThumbnails && Object.keys(opts.slideThumbnails).length > 0
      ? { slideThumbnails: opts.slideThumbnails }
      : {}),
    steps: recording.steps.map((s) => ({
      id: s.id,
      xPct: s.xPct,
      yPct: s.yPct,
      imageIndex: s.frameIndex,
      label: '',
      interactionType: 'tooltip',
      showOverlay: 'tooltip',
      region: s.region,
      tour: s.tour,
    })),
    mode: 'structured',
    createdAt: now,
    updatedAt: now,
    isBuilding: true,
    tourSetup: { widgets: [...new Set(opts.widgets)] },
    hasLiveTour: recording.steps.length > 0,
  };
}

/** Untagged recorded steps, for the "tag these in code" list. */
export const untaggedSteps = (recording: Pick<TourRecording, 'steps'>) =>
  recording.steps.filter((s) => s.untagged);

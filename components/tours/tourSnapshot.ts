import type { GuidedLearningSet } from '@/types';
import { normalizeGuidedLearningSet } from '@/components/widgets/GuidedLearning/utils/setMigration';

export const GL_TOURS_COLLECTION = 'building_guided_learning_tours';
/** Written by the server once every pre-publishing tour has its snapshot. */
export const TOURS_META_ID = '_meta';

export interface PublishedTour {
  set: GuidedLearningSet;
  publishedAt: number;
  publishedBy: string | null;
}

// Must match NOT_PUBLISHED in functions/src/glTours.ts.
const NOT_PUBLISHED = new Set([
  'imagePaths',
  'imagePath',
  'imageUrl',
  'driveFileIds',
  'authorUid',
  'helpCenter',
  'isBuilding',
  'folderId',
  'order',
  'description',
  'createdAt',
  'updatedAt',
  'hasLiveTour',
]);

/** What a tour run shows, as Firestore will store it (no undefined values). */
export function buildTourContent(set: GuidedLearningSet): GuidedLearningSet {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(normalizeGuidedLearningSet(set))) {
    if (!NOT_PUBLISHED.has(key) && value !== undefined) out[key] = value;
  }
  return JSON.parse(JSON.stringify(out)) as GuidedLearningSet;
}

/** Reads a published tour doc, or null when it is missing or malformed. */
export function parsePublishedTour(
  setId: string,
  data: unknown
): PublishedTour | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const raw = d.set as Partial<GuidedLearningSet> | undefined;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) return null;
  const publishedAt = typeof d.publishedAt === 'number' ? d.publishedAt : 0;
  return {
    set: normalizeGuidedLearningSet({
      mode: 'structured',
      title: '',
      imageUrls: [],
      ...raw,
      steps: raw.steps,
      id: setId,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    }),
    publishedAt,
    publishedBy: typeof d.publishedBy === 'string' ? d.publishedBy : null,
  };
}

const sortKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    : value;

const fingerprint = (set: GuidedLearningSet): string =>
  JSON.stringify(buildTourContent(set), sortKeys);

export type TourPublishStatus = 'draft' | 'published' | 'changed';

/** Draft = never published; changed = the set differs from what teachers run. */
export function tourPublishStatus(
  set: GuidedLearningSet,
  published: PublishedTour | null
): TourPublishStatus {
  if (!published) return 'draft';
  return fingerprint(set) === fingerprint(published.set)
    ? 'published'
    : 'changed';
}

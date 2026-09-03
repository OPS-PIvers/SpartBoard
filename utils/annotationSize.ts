import type { DrawableObject } from '@/types';

// The overlay shares the dashboard document, which Firestore caps at 1 MiB.
// Warn well before that and refuse new ink past a hard ceiling.
export const ANNOTATION_SOFT_LIMIT_BYTES = 300_000;
export const ANNOTATION_HARD_LIMIT_BYTES = 600_000;

/** Approximate serialized size of the overlay objects in bytes. */
export const estimateAnnotationBytes = (objects: DrawableObject[]): number =>
  JSON.stringify(objects).length;

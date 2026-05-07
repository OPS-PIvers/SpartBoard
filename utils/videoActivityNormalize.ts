/**
 * Read-side normalization for Video Activity question payloads.
 *
 * Pre-PR2a Drive blobs / session docs may have questions with a missing
 * `type` (always treated as MC by the V1 editor) and missing `points`.
 * Routing all reads through `normalizeQuestion` lets the rest of the
 * pipeline assume the post-PR2a shape — every call site can rely on
 * `q.type` and `q.points` being present.
 *
 * Pure function; safe to call repeatedly.
 */

import type { VideoActivityQuestion } from '@/types';

export function normalizeVideoActivityQuestion(
  q: VideoActivityQuestion
): VideoActivityQuestion {
  return {
    ...q,
    type: q.type ?? 'MC',
    points: q.points ?? 1,
  };
}

export function normalizeVideoActivityQuestions(
  qs: VideoActivityQuestion[] | undefined
): VideoActivityQuestion[] {
  return (qs ?? []).map(normalizeVideoActivityQuestion);
}

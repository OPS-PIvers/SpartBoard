/**
 * Read-side mapper for the synced-quiz linkage on `QuizMetadata`.
 *
 * Pre-sub-object docs carried two flat optional fields
 * (`syncGroupId` + `lastSyncedVersion`) instead of the canonical
 * `sync: { groupId, lastSyncedVersion }` object. This helper folds
 * them into the new shape so the rest of the codebase only ever sees
 * one form, regardless of when the doc was written.
 *
 * Lifted out of `hooks/useQuiz.ts` and `hooks/useQuizAssignments.ts`
 * so the same rules drive every read site — duplicate copies in two
 * hooks had already started to drift on validation strictness, which
 * is the exact failure mode the abstraction prevents.
 *
 * Behavior:
 * - If `sync` is already populated AND well-formed, pass through.
 * - If `sync` is populated but malformed (empty groupId, non-numeric
 *   `lastSyncedVersion`), strip the linkage and treat as unsynced.
 *   Matches the non-synced read path so consumers don't have to
 *   reason about partial state.
 * - If both legacy fields are populated, build `sync` from them and
 *   strip the legacy fields.
 * - Otherwise: return the doc with no `sync` linkage.
 */

import type { QuizMetadata } from '../types';

export function migrateQuizMetadataShape(raw: unknown): QuizMetadata {
  const data = (raw ?? {}) as QuizMetadata & {
    syncGroupId?: string;
    lastSyncedVersion?: number;
  };
  const { syncGroupId, lastSyncedVersion, ...rest } = data;
  if (rest.sync) {
    if (
      typeof rest.sync.groupId === 'string' &&
      rest.sync.groupId.length > 0 &&
      typeof rest.sync.lastSyncedVersion === 'number'
    ) {
      return rest;
    }
    // Malformed sub-object — drop and treat as unsynced.
    const { sync: _sync, ...cleaned } = rest;
    void _sync;
    return cleaned;
  }
  if (
    typeof syncGroupId === 'string' &&
    syncGroupId.length > 0 &&
    typeof lastSyncedVersion === 'number'
  ) {
    return { ...rest, sync: { groupId: syncGroupId, lastSyncedVersion } };
  }
  return rest;
}

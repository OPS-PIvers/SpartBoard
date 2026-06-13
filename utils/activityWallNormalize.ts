/**
 * Read-side normalization for Activity Wall library entry docs.
 *
 * Previously the snapshot mapping lived as an inline `docs.map(...)` callback
 * inside `hooks/useActivityWallLibrary.ts`. The hand-enumerated literal return
 * silently dropped every optional field on `ActivityWallLibraryEntry` not
 * explicitly listed — including the newly-added `classIds` and `rosterIds`
 * (Phase 5A multi-class targeting). When `onSnapshot` fired and the library
 * was refreshed, those dropped fields caused data loss in the teacher UI:
 * Class-gated activities would lose their `classIds` on every live update,
 * making the assignment invisible to students.
 *
 * Fix: destructure the known fields (applying their original normalization
 * logic unchanged), then spread `...restData` to preserve ALL other optional
 * fields that arrive in the Firestore snapshot.
 *
 * Pure function; safe to call repeatedly.
 */

import type { ActivityWallLibraryEntry } from '@/types';

/**
 * Normalize a raw Firestore `activity_wall_activities/{activityId}` document
 * into a fully-typed `ActivityWallLibraryEntry`.
 *
 * Fields with required runtime defaults are explicitly normalized:
 *   - `id`                falls back to `docId` when absent
 *   - `title`             falls back to `''`
 *   - `prompt`            falls back to `''`
 *   - `mode`              falls back to `'text'`
 *   - `moderationEnabled` coerced to boolean via `!!`
 *   - `identificationMode` falls back to `'anonymous'`
 *   - `createdAt`         falls back to `0`
 *   - `updatedAt`         falls back to `0`
 *   - `classId`           omitted when absent or empty string (preserves the
 *                         Firestore rule invariant: an empty string must not
 *                         be stored in `passesStudentClassGate`)
 *
 * All other optional fields (e.g. `classIds`, `rosterIds`, and any future
 * additions) are preserved via `...restData` so the hook never silently
 * loses data added by a newer code path.
 */
export function normalizeActivityWallLibraryEntry(
  docId: string,
  data: Partial<ActivityWallLibraryEntry>
): ActivityWallLibraryEntry {
  const {
    id: storedId,
    title,
    prompt,
    mode,
    moderationEnabled,
    identificationMode,
    classId,
    createdAt,
    updatedAt,
    ...restData
  } = data;

  const entry: ActivityWallLibraryEntry = {
    ...restData,
    id: storedId ?? docId,
    title: typeof title === 'string' ? title : '',
    prompt: typeof prompt === 'string' ? prompt : '',
    mode: mode ?? 'text',
    moderationEnabled: !!moderationEnabled,
    identificationMode: identificationMode ?? 'anonymous',
    createdAt: typeof createdAt === 'number' ? createdAt : 0,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
  };

  // Only include `classId` when it is a non-empty string. An empty string must
  // not reach Firestore because the `passesStudentClassGate` security rule
  // treats its presence as a class-restriction signal; an empty value would
  // block all students from joining.
  if (typeof classId === 'string' && classId.length > 0) {
    entry.classId = classId;
  }

  return entry;
}

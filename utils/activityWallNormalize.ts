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

import type {
  ActivityWallAppearance,
  ActivityWallIdentificationMode,
  ActivityWallLayout,
  ActivityWallLibraryEntry,
  ActivityWallMode,
  ActivityWallSession,
  ActivityWallSubmission,
} from '@/types';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';
import type { ActivityWallActivityDefaults } from '@/components/widgets/ActivityWall/buildingDefaults';

/** `allowedTypes` shape shared by the library entry and the session mirror. */
type ActivityWallAllowedTypes = {
  photo: boolean;
  link: boolean;
  file: boolean;
  video: boolean;
};

const DEFAULT_ALLOWED_TYPES: ActivityWallAllowedTypes = {
  photo: false,
  link: false,
  file: false,
  video: false,
};

/** Legacy `mode` → new `layout` default (data model: text→wordcloud, photo→wall). */
const layoutFromLegacyMode = (mode: ActivityWallMode): ActivityWallLayout =>
  mode === 'photo' ? 'wall' : 'wordcloud';

/**
 * Legacy `identificationMode` → `allowGuests`. The pre-redesign student page
 * always signed in anonymously regardless of `identificationMode` — none of
 * the four legacy modes represented real authentication — so every legacy
 * activity maps to `allowGuests: true`.
 */
const allowGuestsFromLegacyIdentificationMode = (
  _mode: ActivityWallIdentificationMode
): boolean => true;

/** Legacy `identificationMode` → `showNames` ('name' | 'name-pin' show names). */
const showNamesFromLegacyIdentificationMode = (
  mode: ActivityWallIdentificationMode
): boolean => mode === 'name' || mode === 'name-pin';

/** Legacy `mode` → `allowedTypes` default (a legacy photo wall accepted photos). */
const allowedTypesFromLegacyMode = (
  mode: ActivityWallMode
): ActivityWallAllowedTypes => ({
  ...DEFAULT_ALLOWED_TYPES,
  photo: mode === 'photo',
});

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
    layout,
    allowedTypes,
    appearance,
    allowGuests,
    showNames,
    maxPostsPerStudent,
    allowStudentEdit,
    allowStudentDelete,
    acceptingResponses,
    ...restData
  } = data;

  const resolvedMode: ActivityWallMode = mode ?? 'text';
  const resolvedIdentificationMode: ActivityWallIdentificationMode =
    identificationMode ?? 'anonymous';

  const entry: ActivityWallLibraryEntry = {
    ...restData,
    id: storedId ?? docId,
    title: typeof title === 'string' ? title : '',
    prompt: typeof prompt === 'string' ? prompt : '',
    mode: resolvedMode,
    moderationEnabled: !!moderationEnabled,
    identificationMode: resolvedIdentificationMode,
    createdAt: typeof createdAt === 'number' ? createdAt : 0,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    // Padlet-lite redesign (P1-1): derive every new field from the legacy
    // mode/identificationMode when the document predates the field, per the
    // mapping in docs/plans/ACTIVITY_WALL_REDESIGN.md's Data model section.
    layout: layout ?? layoutFromLegacyMode(resolvedMode),
    allowedTypes: allowedTypes ?? allowedTypesFromLegacyMode(resolvedMode),
    appearance: appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE,
    allowGuests:
      allowGuests ??
      allowGuestsFromLegacyIdentificationMode(resolvedIdentificationMode),
    showNames:
      showNames ??
      showNamesFromLegacyIdentificationMode(resolvedIdentificationMode),
    maxPostsPerStudent:
      typeof maxPostsPerStudent === 'number' ? maxPostsPerStudent : 0,
    allowStudentEdit: !!allowStudentEdit,
    allowStudentDelete: !!allowStudentDelete,
    acceptingResponses:
      typeof acceptingResponses === 'boolean' ? acceptingResponses : true,
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

/**
 * Normalize a raw Firestore Activity Wall submission document. Legacy
 * submissions have no `type`: a `content` starting with `http` on a photo
 * wall normalizes to `photo`, otherwise `text` (data model, "Legacy
 * submissions" note). `isModePhoto` is the parent wall's legacy `mode`.
 */
export function normalizeActivityWallSubmission(
  docId: string,
  data: Partial<ActivityWallSubmission>,
  isModePhoto = false
): ActivityWallSubmission {
  const { id: storedId, content, submittedAt, status, type, ...rest } = data;
  const resolvedContent = typeof content === 'string' ? content : '';
  const resolvedType =
    type ??
    (isModePhoto && resolvedContent.startsWith('http') ? 'photo' : 'text');

  return {
    ...rest,
    id: storedId ?? docId,
    content: resolvedContent,
    submittedAt: typeof submittedAt === 'number' ? submittedAt : 0,
    status: status === 'pending' ? 'pending' : 'approved',
    type: resolvedType,
  };
}

/**
 * Normalize a raw Firestore `activity_wall_sessions/{sessionId}` document,
 * defaulting every Padlet-lite field so students on a legacy session still
 * get a usable configuration.
 */
export function normalizeActivityWallSession(
  docId: string,
  data: Partial<ActivityWallSession>
): ActivityWallSession {
  const {
    id: storedId,
    activityId,
    teacherUid,
    title,
    prompt,
    mode,
    moderationEnabled,
    identificationMode,
    updatedAt,
    layout,
    allowedTypes,
    appearance,
    allowGuests,
    showNames,
    maxPostsPerStudent,
    allowStudentEdit,
    allowStudentDelete,
    acceptingResponses,
    driveVisibility,
    ...rest
  } = data;

  const resolvedMode: ActivityWallMode = mode ?? 'text';
  const resolvedIdentificationMode: ActivityWallIdentificationMode =
    identificationMode ?? 'anonymous';
  const resolvedAllowGuests =
    allowGuests ??
    allowGuestsFromLegacyIdentificationMode(resolvedIdentificationMode);

  return {
    ...rest,
    id: storedId ?? docId,
    activityId: activityId ?? '',
    teacherUid: teacherUid ?? '',
    title: typeof title === 'string' ? title : '',
    prompt: typeof prompt === 'string' ? prompt : '',
    mode: resolvedMode,
    moderationEnabled: !!moderationEnabled,
    identificationMode: resolvedIdentificationMode,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    layout: layout ?? layoutFromLegacyMode(resolvedMode),
    allowedTypes: allowedTypes ?? allowedTypesFromLegacyMode(resolvedMode),
    appearance: appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE,
    allowGuests: resolvedAllowGuests,
    showNames:
      showNames ??
      showNamesFromLegacyIdentificationMode(resolvedIdentificationMode),
    maxPostsPerStudent:
      typeof maxPostsPerStudent === 'number' ? maxPostsPerStudent : 0,
    allowStudentEdit: !!allowStudentEdit,
    allowStudentDelete: !!allowStudentDelete,
    acceptingResponses:
      typeof acceptingResponses === 'boolean' ? acceptingResponses : true,
    driveVisibility:
      driveVisibility ?? (resolvedAllowGuests ? 'anyone' : 'domain'),
  };
}

/** Returns a blank `ActivityWallLibraryEntry`, seeded with building defaults. */
export function buildDefaultWall(
  defaults: ActivityWallActivityDefaults = {}
): ActivityWallLibraryEntry {
  const mode: ActivityWallMode = defaults.mode ?? 'text';
  const identificationMode: ActivityWallIdentificationMode =
    defaults.identificationMode ?? 'anonymous';
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    title: '',
    prompt: '',
    mode,
    moderationEnabled: defaults.moderationEnabled ?? false,
    identificationMode,
    createdAt: now,
    updatedAt: now,
    // New walls start on the free-form board; the legacy mode mapping only backfills existing entries.
    layout: 'wall',
    allowedTypes: allowedTypesFromLegacyMode(mode),
    appearance: ACTIVITY_WALL_DEFAULT_APPEARANCE,
    allowGuests: allowGuestsFromLegacyIdentificationMode(identificationMode),
    showNames: showNamesFromLegacyIdentificationMode(identificationMode),
    maxPostsPerStudent: 0,
    allowStudentEdit: false,
    allowStudentDelete: false,
    acceptingResponses: true,
  };
}

/**
 * Pure projection of a library entry into the session doc the widget mirrors
 * to `activity_wall_sessions/{uid}_{activityId}` on every active-wall change.
 * `driveVisibility` is computed here (not read by the archive function from
 * the library doc) so the archive pipeline never needs owner-collection access.
 */
export function mirrorSessionFromEntry(
  entry: ActivityWallLibraryEntry,
  uid: string
): ActivityWallSession {
  const allowGuests =
    entry.allowGuests ??
    allowGuestsFromLegacyIdentificationMode(entry.identificationMode);
  const layout: ActivityWallLayout =
    entry.layout ?? layoutFromLegacyMode(entry.mode);
  const appearance: ActivityWallAppearance =
    entry.appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;

  const session: ActivityWallSession = {
    id: `${uid}_${entry.id}`,
    activityId: entry.id,
    teacherUid: uid,
    title: entry.title,
    prompt: entry.prompt,
    mode: entry.mode,
    moderationEnabled: entry.moderationEnabled,
    identificationMode: entry.identificationMode,
    updatedAt: Date.now(),
    layout,
    allowedTypes: entry.allowedTypes ?? allowedTypesFromLegacyMode(entry.mode),
    appearance,
    allowGuests,
    showNames:
      entry.showNames ??
      showNamesFromLegacyIdentificationMode(entry.identificationMode),
    maxPostsPerStudent: entry.maxPostsPerStudent ?? 0,
    allowStudentEdit: entry.allowStudentEdit ?? false,
    allowStudentDelete: entry.allowStudentDelete ?? false,
    acceptingResponses: entry.acceptingResponses ?? true,
    driveVisibility: allowGuests ? 'anyone' : 'domain',
  };

  if (entry.classId) session.classId = entry.classId;
  if (entry.classIds) session.classIds = entry.classIds;
  if (entry.rosterIds) session.rosterIds = entry.rosterIds;
  if (entry.sections) session.sections = entry.sections;
  if (entry.tableRows) session.tableRows = entry.tableRows;
  if (entry.tableCols) session.tableCols = entry.tableCols;
  if (entry.mapCenter) session.mapCenter = entry.mapCenter;

  return session;
}

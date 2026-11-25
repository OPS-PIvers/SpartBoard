import { useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcQuizEntry, QuizSessionMode, QuizSessionOptions } from '@/types';
import { logError } from '@/utils/logError';
import {
  isLivePlcLibraryEntry,
  usePlcLibraryEntries,
  type PlcLibrarySpec,
} from '@/hooks/usePlcLibraryEntries';

const PLCS_COLLECTION = 'plcs';
const QUIZZES_SUBCOLLECTION = 'quizzes';

/**
 * Recognized boolean toggle keys on `QuizSessionOptions` (plus the inherited
 * `BaseSessionOptions` fields). Used by `parsePlcQuizEntry` to validate that a stored
 * `sessionOptions` object carries at least one real run-setting before we cast
 * it — guards against `{}` / malformed objects being treated as valid.
 */
const SESSION_OPTION_KEYS: readonly (keyof QuizSessionOptions)[] = [
  'tabWarningsEnabled',
  'blockCopyPaste',
  'allowStimulusQuotes',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
  'showCorrectOnBoard',
  'shuffleQuestions',
  'shuffleAnswerOptions',
  'speedBonusEnabled',
  'streakBonusEnabled',
  'showPodiumBetweenQuestions',
  'soundEffectsEnabled',
];

interface ShareQuizWithPlcInput {
  /** Firestore doc id for the new PLC quiz entry. Caller mints (uuid). */
  plcQuizId: string;
  /** Pointer to the canonical `/synced_quizzes/{groupId}` doc. */
  syncGroupId: string;
  /** Mirrored from the synced group at share time. */
  title: string;
  /** Mirrored from the synced group's questions array length. */
  questionCount: number;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot for display. */
  sharedByEmail: string;
  /**
   * Optional default session mode a teacher can pick up when assigning the
   * shared quiz. Omitted from the Firestore doc when absent.
   */
  sessionMode?: QuizSessionMode;
  /**
   * Optional default session options. Omitted from the Firestore doc when
   * absent.
   */
  sessionOptions?: QuizSessionOptions;
  /**
   * Optional default attempt limit (`null` = unlimited). Omitted from the
   * Firestore doc when absent.
   */
  attemptLimit?: number | null;
  /** Optional source quiz id — informational only. Omitted when absent. */
  quizId?: string;
}

/**
 * Build the optional run-settings fields, omitting any that are `undefined`
 * so we never write `undefined` to Firestore. `attemptLimit: null` is a
 * meaningful value (unlimited) and is preserved.
 */
function runSettingsFields(
  input: ShareQuizWithPlcInput
): Partial<PlcQuizEntry> {
  const fields: Partial<PlcQuizEntry> = {};
  if (input.sessionMode !== undefined) fields.sessionMode = input.sessionMode;
  if (input.sessionOptions !== undefined) {
    fields.sessionOptions = input.sessionOptions;
  }
  if (input.attemptLimit !== undefined)
    fields.attemptLimit = input.attemptLimit;
  if (input.quizId !== undefined) fields.quizId = input.quizId;
  return fields;
}

/** Mirrorable header fields: title/count plus the run-settings a pickup inherits. */
export interface PlcQuizHeaderPatch {
  title?: string;
  questionCount?: number;
  sessionMode?: QuizSessionMode;
  sessionOptions?: QuizSessionOptions;
  attemptLimit?: number | null;
}

/** Firestore update payload for a header mirror; skips undefined so nothing is wiped. */
function headerPatchFields(patch: PlcQuizHeaderPatch): Record<string, unknown> {
  const fields: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.questionCount !== undefined) {
    fields.questionCount = patch.questionCount;
  }
  if (patch.sessionMode !== undefined) fields.sessionMode = patch.sessionMode;
  if (patch.sessionOptions !== undefined) {
    fields.sessionOptions = patch.sessionOptions;
  }
  if (patch.attemptLimit !== undefined)
    fields.attemptLimit = patch.attemptLimit;
  return fields;
}

/**
 * Mirror a published quiz's header onto every PLC library row that points at
 * `syncGroupId`, across the given PLCs. Used by the board editor, which has no
 * PLC in scope; best-effort per PLC, never rejects.
 */
export async function mirrorPlcQuizHeadersBySyncGroup(
  plcIds: readonly string[],
  syncGroupId: string,
  patch: PlcQuizHeaderPatch
): Promise<void> {
  const fields = headerPatchFields(patch);
  await Promise.all(
    plcIds.map(async (plcId) => {
      try {
        const snap = await getDocs(
          query(
            collection(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION),
            where('syncGroupId', '==', syncGroupId)
          )
        );
        await Promise.all(snap.docs.map((d) => updateDoc(d.ref, fields)));
      } catch (err) {
        logError('usePlcQuizzes.mirrorHeadersBySyncGroup', err, {
          plcId,
          syncGroupId,
        });
      }
    })
  );
}

interface UsePlcQuizzesResult {
  quizzes: PlcQuizEntry[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `quizzes`
   * array is "couldn't load," not "no items yet" — consumers should
   * distinguish so the UI doesn't render a misleading empty state.
   */
  error: Error | null;
  /**
   * Write a new PLC quiz entry. Caller is responsible for first standing
   * up the canonical `synced_quizzes/{syncGroupId}` doc (via
   * `createSyncedQuizGroup`). Doc id = `plcQuizId`. The signed-in user is
   * stamped as `sharedBy`.
   */
  shareQuizWithPlc: (input: ShareQuizWithPlcInput) => Promise<void>;
  /**
   * Mirror title/questionCount onto the PLC quiz doc after a peer's
   * publish. Fire-and-forget — failures log but don't reject so the
   * caller's primary action (e.g. `publishSyncedQuiz`) returns cleanly.
   */
  mirrorPlcQuizHeader: (
    plcQuizId: string,
    patch: PlcQuizHeaderPatch
  ) => Promise<void>;
  /**
   * Unshare (soft-delete, Decision 3.1) a PLC quiz entry. Any member can
   * unshare (PLC-owned model). Writes a `deletedAt` tombstone so the entry
   * drops out of the live library but stays restorable from Trash; the
   * canonical synced group is untouched. Restore with `restoreQuizInPlc`.
   */
  unshareQuizFromPlc: (plcQuizId: string) => Promise<void>;
  /** Restore a soft-deleted PLC quiz entry by clearing its `deletedAt`. */
  restoreQuizInPlc: (plcQuizId: string) => Promise<void>;
}

export function parsePlcQuizEntry(
  id: string,
  data: Record<string, unknown>
): PlcQuizEntry | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.questionCount !== 'number' ||
    typeof data.syncGroupId !== 'string' ||
    typeof data.sharedBy !== 'string' ||
    typeof data.sharedAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  const entry: PlcQuizEntry = {
    id,
    title: data.title,
    questionCount: data.questionCount,
    syncGroupId: data.syncGroupId,
    sharedBy: data.sharedBy,
    sharedByEmail:
      typeof data.sharedByEmail === 'string' ? data.sharedByEmail : '',
    sharedByName:
      typeof data.sharedByName === 'string' ? data.sharedByName : '',
    sharedAt: data.sharedAt,
    updatedAt: data.updatedAt,
  };
  // Optional run-settings — present only on entries shared after run-settings
  // moved onto the quiz library. Absent on legacy entries.
  if (
    data.sessionMode === 'teacher' ||
    data.sessionMode === 'auto' ||
    data.sessionMode === 'student'
  ) {
    entry.sessionMode = data.sessionMode;
  }
  // Only attach `sessionOptions` if it's a non-null object that carries at
  // least one recognized boolean toggle. This rejects obvious garbage (`{}`,
  // arrays, malformed shapes) without being so strict it drops valid data —
  // any single known key is enough to treat the object as real run-settings.
  if (
    typeof data.sessionOptions === 'object' &&
    data.sessionOptions !== null &&
    !Array.isArray(data.sessionOptions) &&
    SESSION_OPTION_KEYS.some(
      (key) =>
        typeof (data.sessionOptions as Record<string, unknown>)[key] ===
        'boolean'
    )
  ) {
    entry.sessionOptions = data.sessionOptions;
  }
  if (data.attemptLimit === null || typeof data.attemptLimit === 'number') {
    entry.attemptLimit = data.attemptLimit;
  }
  if (typeof data.quizId === 'string') entry.quizId = data.quizId;
  // Soft-delete tombstone (Decision 3.1): optional so legacy entries parse
  // cleanly; written as a plain int (Date.now()) like the other time fields.
  if (typeof data.deletedAt === 'number') {
    entry.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    entry.deletedAt = null;
  }
  if (typeof data.archived === 'boolean') {
    entry.archived = data.archived;
  }
  if (typeof data.folderId === 'string' || data.folderId === null) {
    entry.folderId = data.folderId;
  }
  if (typeof data.order === 'number') entry.order = data.order;
  return entry;
}

const QUIZ_LIBRARY: PlcLibrarySpec<PlcQuizEntry, ShareQuizWithPlcInput> = {
  kind: 'quiz',
  subcollection: QUIZZES_SUBCOLLECTION,
  parse: parsePlcQuizEntry,
  keep: isLivePlcLibraryEntry,
  orderByUpdatedAt: true,
  fromProvider: (s) => s.quizzes,
  share: writePlcQuizEntry,
};

/** Live PLC quiz library, newest edit first; `null` plcId disables the listener. */
export const usePlcQuizzes = (plcId: string | null): UsePlcQuizzesResult => {
  const { user } = useAuth();
  const { entries, loading, error, share, unshare, restore } =
    usePlcLibraryEntries(plcId, QUIZ_LIBRARY);

  const mirrorPlcQuizHeader = useCallback(
    async (plcQuizId: string, patch: PlcQuizHeaderPatch): Promise<void> => {
      if (!plcId || !user) return;
      try {
        await updateDoc(
          doc(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION, plcQuizId),
          headerPatchFields(patch)
        );
      } catch (err) {
        // Best-effort: `not-found` means a teammate unshared it meanwhile.
        logError('usePlcQuizzes.mirrorHeader', err, { plcId, plcQuizId });
      }
    },
    [plcId, user]
  );

  return useMemo(
    () => ({
      quizzes: entries,
      loading,
      error,
      shareQuizWithPlc: share,
      mirrorPlcQuizHeader,
      unshareQuizFromPlc: unshare,
      restoreQuizInPlc: restore,
    }),
    [entries, loading, error, share, mirrorPlcQuizHeader, unshare, restore]
  );
};

/**
 * One-shot write of a PLC quiz entry. Used from the QuizWidget's
 * "Share with PLC" handler — the widget knows the target PLC at call
 * time but isn't subscribed to that PLC's `usePlcQuizzes`. Mirrors the
 * `writePlcAssignmentIndexEntry` shape from Phase 1, but rejects on
 * failure (unlike the index writer this is a primary user action, not a
 * fire-and-forget side effect).
 */
export async function writePlcQuizEntry(
  plcId: string,
  uid: string,
  input: ShareQuizWithPlcInput
): Promise<void> {
  const now = Date.now();
  const entry: PlcQuizEntry = {
    id: input.plcQuizId,
    title: input.title,
    questionCount: input.questionCount,
    syncGroupId: input.syncGroupId,
    sharedBy: uid,
    sharedByEmail: input.sharedByEmail,
    sharedByName: input.sharedByName,
    sharedAt: now,
    updatedAt: now,
    ...runSettingsFields(input),
  };
  await setDoc(
    doc(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION, input.plcQuizId),
    entry
  );
}

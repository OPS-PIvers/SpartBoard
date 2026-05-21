import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  PlcAssignmentTemplate,
  QuizSessionMode,
  QuizSessionOptions,
  PlcVideoActivityEntry,
} from '@/types';
import { logError } from '@/utils/logError';
import { notifyPlcWriteFailure } from '@/utils/plcWriteNotifications';

const PLCS_COLLECTION = 'plcs';
const ASSIGNMENTS_SUBCOLLECTION = 'assignments';

const VALID_SESSION_MODES: ReadonlySet<QuizSessionMode> = new Set([
  'teacher',
  'auto',
  'student',
]);

interface ShareAssignmentTemplateInput {
  /** Firestore doc id for the new template. Caller mints (uuid). */
  plcAssignmentId: string;
  /** Source quiz id (informational; importers don't need access). */
  quizId: string;
  /** Mirrored from the source quiz at share time. */
  quizTitle: string;
  /** Pointer to the canonical `/synced_quizzes/{groupId}` doc. */
  syncGroupId: string;
  /** Default session mode the importer's assignment will inherit. */
  sessionMode: QuizSessionMode;
  /** Default session options the importer's assignment will inherit. */
  sessionOptions: QuizSessionOptions;
  /** Default attempt limit. `null` = unlimited. */
  attemptLimit: number | null;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot for display. */
  sharedByEmail: string;
}

interface UsePlcAssignmentsResult {
  templates: PlcAssignmentTemplate[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `templates`
   * array is "couldn't load," not "no items yet" — consumers should
   * distinguish so the UI doesn't render a misleading empty state.
   */
  error: Error | null;
  /**
   * Write a new PLC-authored assignment template. Caller must have first
   * stood up the canonical `synced_quizzes/{syncGroupId}` doc — typically
   * a no-op when the quiz was already promoted via a previous share, or
   * a fresh `createSyncedQuizGroup` call when not. Doc id = caller-minted
   * `plcAssignmentId`.
   */
  shareAssignmentTemplate: (
    input: ShareAssignmentTemplateInput
  ) => Promise<void>;
  /**
   * Remove a template from the PLC. Any current member can unshare
   * (PLC-owned model). Already-imported personal assignments on
   * teammates' boards keep running.
   */
  deleteAssignmentTemplate: (plcAssignmentId: string) => Promise<void>;
}

function parseTemplate(
  id: string,
  data: Record<string, unknown>
): PlcAssignmentTemplate | null {
  if (
    typeof data.quizTitle !== 'string' ||
    typeof data.quizId !== 'string' ||
    typeof data.syncGroupId !== 'string' ||
    typeof data.sharedBy !== 'string' ||
    typeof data.sharedAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  const rawMode = data.sessionMode;
  const sessionMode: QuizSessionMode =
    typeof rawMode === 'string' &&
    VALID_SESSION_MODES.has(rawMode as QuizSessionMode)
      ? (rawMode as QuizSessionMode)
      : 'auto';
  const sessionOptions =
    data.sessionOptions && typeof data.sessionOptions === 'object'
      ? (data.sessionOptions as QuizSessionOptions)
      : ({} as QuizSessionOptions);
  const rawLimit = data.attemptLimit;
  const attemptLimit: number | null =
    typeof rawLimit === 'number' ? rawLimit : null;
  return {
    id,
    quizTitle: data.quizTitle,
    quizId: data.quizId,
    syncGroupId: data.syncGroupId,
    sessionMode,
    sessionOptions,
    attemptLimit,
    sharedBy: data.sharedBy,
    sharedByEmail:
      typeof data.sharedByEmail === 'string' ? data.sharedByEmail : '',
    sharedByName:
      typeof data.sharedByName === 'string' ? data.sharedByName : '',
    sharedAt: data.sharedAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Live subscription to a single PLC's authored-assignment library
 * (Phase 3). Returns entries sorted newest-edit-first by `updatedAt`.
 * Pass `null` for `plcId` to disable the listener (e.g. while the
 * dashboard is closed).
 *
 * Mirrors `usePlcQuizzes.ts` exactly — same parser-drops-malformed
 * defense, same render-time `prevPlcId` reset so the UI never flashes
 * the previous PLC's entries while the new snapshot is in flight.
 */
export const usePlcAssignments = (
  plcId: string | null
): UsePlcAssignmentsResult => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<PlcAssignmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setTemplates([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setTemplates([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      ASSIGNMENTS_SUBCOLLECTION
    );
    const unsub = onSnapshot(
      query(ref, orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: PlcAssignmentTemplate[] = [];
        snap.forEach((d) => {
          const parsed = parseTemplate(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setTemplates(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcAssignments.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const shareAssignmentTemplate = useCallback(
    async (input: ShareAssignmentTemplateInput): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const now = Date.now();
      const entry: PlcAssignmentTemplate = {
        id: input.plcAssignmentId,
        quizTitle: input.quizTitle,
        quizId: input.quizId,
        syncGroupId: input.syncGroupId,
        sessionMode: input.sessionMode,
        sessionOptions: input.sessionOptions,
        attemptLimit: input.attemptLimit,
        sharedBy: user.uid,
        sharedByEmail: input.sharedByEmail,
        sharedByName: input.sharedByName,
        sharedAt: now,
        updatedAt: now,
      };
      await setDoc(
        doc(
          db,
          PLCS_COLLECTION,
          plcId,
          ASSIGNMENTS_SUBCOLLECTION,
          input.plcAssignmentId
        ),
        entry
      );
    },
    [plcId, user]
  );

  const deleteAssignmentTemplate = useCallback(
    async (plcAssignmentId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await deleteDoc(
        doc(
          db,
          PLCS_COLLECTION,
          plcId,
          ASSIGNMENTS_SUBCOLLECTION,
          plcAssignmentId
        )
      );
    },
    [plcId, user]
  );

  return useMemo(
    () => ({
      templates,
      loading,
      error,
      shareAssignmentTemplate,
      deleteAssignmentTemplate,
    }),
    [
      templates,
      loading,
      error,
      shareAssignmentTemplate,
      deleteAssignmentTemplate,
    ]
  );
};

/**
 * One-shot write of a PLC-authored assignment template. Used from
 * `useQuizAssignments.createAssignment` reverse-bubble-up where the call
 * site isn't subscribed to that PLC's `usePlcAssignments`. Mirrors the
 * `writePlcQuizEntry` shape (Phase 2). Failures are non-fatal here too —
 * called fire-and-forget so the canonical assignment commit doesn't get
 * blocked — but they dispatch `spartboard:plc-write-failed` so the UI
 * layer can surface a toast.
 */
export async function writePlcAssignmentTemplate(
  plcId: string,
  uid: string,
  input: ShareAssignmentTemplateInput
): Promise<void> {
  try {
    const now = Date.now();
    const entry: PlcAssignmentTemplate = {
      id: input.plcAssignmentId,
      quizTitle: input.quizTitle,
      quizId: input.quizId,
      syncGroupId: input.syncGroupId,
      sessionMode: input.sessionMode,
      sessionOptions: input.sessionOptions,
      attemptLimit: input.attemptLimit,
      sharedBy: uid,
      sharedByEmail: input.sharedByEmail,
      sharedByName: input.sharedByName,
      sharedAt: now,
      updatedAt: now,
    };
    await setDoc(
      doc(
        db,
        PLCS_COLLECTION,
        plcId,
        ASSIGNMENTS_SUBCOLLECTION,
        input.plcAssignmentId
      ),
      entry
    );
  } catch (err) {
    logError('writePlcAssignmentTemplate.write', err, {
      plcId,
      plcAssignmentId: input.plcAssignmentId,
    });
    notifyPlcWriteFailure({ scope: 'assignmentTemplate', plcId });
  }
}

// ---------------------------------------------------------------------------
// B5: VA assignment template writer
//
// No VA-template subcollection or Firestore rule exists on this branch.
// Per the plan constraint, fall back to writing a `PlcVideoActivityEntry`
// via the existing `plcs/{plcId}/video_activities/{id}` collection and its
// established rule. This makes VA assignments surface in the Video Activities
// tab library like regular VA entries, which is the same discovery path until
// a dedicated VA-template collection + rule is added in a future wave.
//
// The caller (PlcAssignmentConfigModal) already calls writePlcVideoActivityEntry
// directly; this exported function is provided as a named alias so tests and
// future callers can reference it by intent-describing name and the plan's
// Wave 3 can swap the implementation without hunting for all call sites.
// ---------------------------------------------------------------------------

const VA_ACTIVITIES_SUBCOLLECTION = 'video_activities';

export interface WritePlcVideoActivityAssignmentTemplateInput {
  /** Firestore doc id for the new entry. Caller mints (uuid). */
  plcVideoActivityId: string;
  /** Pointer to the canonical `/synced_video_activities/{groupId}` doc. */
  syncGroupId: string;
  /** Display title of the video activity. */
  title: string;
  /** YouTube URL of the source activity. */
  youtubeUrl: string;
  /** Number of questions in the activity at assignment time. */
  questionCount: number;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot. */
  sharedByEmail: string;
}

/**
 * Write a video activity "assignment template" entry for a PLC. Implemented
 * as a write to `plcs/{plcId}/video_activities/{id}` (the established VA
 * collection) because no dedicated VA-template collection/rule exists on this
 * branch. Noted for Wave 3 to upgrade to a proper template subcollection if
 * needed (see Stream B task B5 notes).
 *
 * Non-fatal — logged + dispatches the plc-write-failed event on error so the
 * UI can surface a toast, matching the `writePlcAssignmentTemplate` posture.
 */
export async function writePlcVideoActivityAssignmentTemplate(
  plcId: string,
  uid: string,
  input: WritePlcVideoActivityAssignmentTemplateInput
): Promise<void> {
  try {
    const now = Date.now();
    const entry: PlcVideoActivityEntry = {
      id: input.plcVideoActivityId,
      title: input.title,
      youtubeUrl: input.youtubeUrl,
      questionCount: input.questionCount,
      syncGroupId: input.syncGroupId,
      sharedBy: uid,
      sharedByEmail: input.sharedByEmail,
      sharedByName: input.sharedByName,
      sharedAt: now,
      updatedAt: now,
    };
    await setDoc(
      doc(
        db,
        PLCS_COLLECTION,
        plcId,
        VA_ACTIVITIES_SUBCOLLECTION,
        input.plcVideoActivityId
      ),
      entry
    );
  } catch (err) {
    logError('writePlcVideoActivityAssignmentTemplate.write', err, {
      plcId,
      plcVideoActivityId: input.plcVideoActivityId,
    });
    notifyPlcWriteFailure({ scope: 'assignmentTemplate', plcId });
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcQuizEntry, QuizSessionMode, QuizSessionOptions } from '@/types';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';
const QUIZZES_SUBCOLLECTION = 'quizzes';

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
    patch: { title?: string; questionCount?: number }
  ) => Promise<void>;
  /** Remove a PLC quiz entry. Any member can unshare (PLC-owned model). */
  unshareQuizFromPlc: (plcQuizId: string) => Promise<void>;
}

function parseEntry(
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
  if (data.sessionOptions !== null && typeof data.sessionOptions === 'object') {
    entry.sessionOptions = data.sessionOptions as QuizSessionOptions;
  }
  if (data.attemptLimit === null || typeof data.attemptLimit === 'number') {
    entry.attemptLimit = data.attemptLimit;
  }
  if (typeof data.quizId === 'string') entry.quizId = data.quizId;
  return entry;
}

/**
 * Live subscription to a single PLC's quiz library. Returns entries
 * sorted newest-edit-first by `updatedAt`. Pass `null` for `plcId` to
 * disable the listener (e.g. while the dashboard is closed).
 *
 * Mirrors `usePlcAssignmentIndex.ts` — same parser-drops-malformed
 * defense, same render-time `prevPlcId` reset so the UI never flashes
 * the previous PLC's entries while the new snapshot is in flight.
 */
export const usePlcQuizzes = (plcId: string | null): UsePlcQuizzesResult => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<PlcQuizEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setQuizzes([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setQuizzes([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: PlcQuizEntry[] = [];
        snap.forEach((d) => {
          const parsed = parseEntry(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        setQuizzes(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcQuizzes.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const shareQuizWithPlc = useCallback(
    async (input: ShareQuizWithPlcInput): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const now = Date.now();
      const entry: PlcQuizEntry = {
        id: input.plcQuizId,
        title: input.title,
        questionCount: input.questionCount,
        syncGroupId: input.syncGroupId,
        sharedBy: user.uid,
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
    },
    [plcId, user]
  );

  const mirrorPlcQuizHeader = useCallback(
    async (
      plcQuizId: string,
      patch: { title?: string; questionCount?: number }
    ): Promise<void> => {
      if (!plcId || !user) return;
      try {
        const fields: Record<string, unknown> = { updatedAt: Date.now() };
        if (patch.title !== undefined) fields.title = patch.title;
        if (patch.questionCount !== undefined) {
          fields.questionCount = patch.questionCount;
        }
        await updateDoc(
          doc(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION, plcQuizId),
          fields
        );
      } catch (err) {
        // Mirror writes are best-effort — never reject so callers' primary
        // action (e.g. `publishSyncedQuiz`) returns cleanly. A
        // `not-found` from `updateDoc` here means a teammate unshared the
        // PLC entry between our snapshot read and this mirror write —
        // the entry is already gone, the canonical sync group still has
        // the new content, and the next snapshot tick will reflect both.
        // No remediation needed; logging is sufficient.
        logError('usePlcQuizzes.mirrorHeader', err, { plcId, plcQuizId });
      }
    },
    [plcId, user]
  );

  const unshareQuizFromPlc = useCallback(
    async (plcQuizId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await deleteDoc(
        doc(db, PLCS_COLLECTION, plcId, QUIZZES_SUBCOLLECTION, plcQuizId)
      );
    },
    [plcId, user]
  );

  return useMemo(
    () => ({
      quizzes,
      loading,
      error,
      shareQuizWithPlc,
      mirrorPlcQuizHeader,
      unshareQuizFromPlc,
    }),
    [
      quizzes,
      loading,
      error,
      shareQuizWithPlc,
      mirrorPlcQuizHeader,
      unshareQuizFromPlc,
    ]
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

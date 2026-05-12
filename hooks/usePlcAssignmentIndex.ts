import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcAssignmentIndexEntry, QuizAssignmentStatus } from '@/types';
import { logError } from '@/utils/logError';
import { notifyPlcWriteFailure } from '@/utils/plcWriteNotifications';

const PLCS_COLLECTION = 'plcs';
const ASSIGNMENT_INDEX_SUBCOLLECTION = 'assignment_index';

interface UsePlcAssignmentIndexResult {
  entries: PlcAssignmentIndexEntry[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `entries`
   * array is "couldn't load," not "no items yet" — consumers should
   * distinguish so the UI doesn't render a misleading empty state.
   */
  error: Error | null;
}

const VALID_STATUSES: ReadonlySet<QuizAssignmentStatus> = new Set([
  'active',
  'paused',
  'inactive',
]);

function parseEntry(
  id: string,
  data: Record<string, unknown>
): PlcAssignmentIndexEntry | null {
  if (
    typeof data.ownerUid !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.sheetUrl !== 'string' ||
    typeof data.createdAt !== 'number'
  ) {
    return null;
  }
  // PR3a widened the type union to include 'video-activity'. Pre-PR3a
  // entries lack the `kind` field; default to 'quiz' for backward compat.
  // VA index writes (PR3b) will set `kind: 'video-activity'` explicitly.
  const rawKind = data.kind;
  const kind: PlcAssignmentIndexEntry['kind'] =
    rawKind === 'video-activity' ? 'video-activity' : 'quiz';
  // Phase 3 added `status`. Legacy entries (created pre-Phase-3) lack the
  // field — default to `'active'` so they surface in the In-progress
  // sub-tab until their owner deactivates them. An invalid value is also
  // coerced to `'active'` so a single corrupt write can't hide a row.
  const rawStatus = data.status;
  const status: QuizAssignmentStatus =
    typeof rawStatus === 'string' &&
    VALID_STATUSES.has(rawStatus as QuizAssignmentStatus)
      ? (rawStatus as QuizAssignmentStatus)
      : 'active';
  return {
    id,
    kind,
    ownerUid: data.ownerUid,
    ownerName: typeof data.ownerName === 'string' ? data.ownerName : '',
    ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : '',
    title: data.title,
    sheetUrl: data.sheetUrl,
    status,
    createdAt: data.createdAt,
  };
}

/**
 * Live subscription to a single PLC's assignment index. Returns entries
 * sorted newest-first. Pass `null` for `plcId` to disable the listener
 * (e.g. while the dashboard is closed).
 */
export const usePlcAssignmentIndex = (
  plcId: string | null
): UsePlcAssignmentIndexResult => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PlcAssignmentIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Reset state when the target PLC changes so the UI never flashes the
  // previous PLC's entries while the new snapshot is in flight. This is the
  // "adjusting state while rendering" pattern used elsewhere in the repo
  // (see `useQuizAssignments.ts` lines 523-526) — preferred over an effect
  // because it avoids an extra render pass.
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setEntries([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setEntries([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    // Server-side ordering by `createdAt desc` so the snapshot already
    // arrives newest-first — no client-side `.sort()` pass needed.
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      ASSIGNMENT_INDEX_SUBCOLLECTION
    );
    const unsub = onSnapshot(
      query(ref, orderBy('createdAt', 'desc')),
      (snap) => {
        const list: PlcAssignmentIndexEntry[] = [];
        snap.forEach((d) => {
          const parsed = parseEntry(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        setEntries(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcAssignmentIndex.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return useMemo(
    () => ({ entries, loading, error }),
    [entries, loading, error]
  );
};

/**
 * One-shot write of an index entry. Called from the quiz assignment
 * creation flow when the new assignment opts into PLC mode. Failures are
 * non-fatal — the assignment itself has already committed; the dashboard
 * can recover via a manual reindex later. We log + swallow so a transient
 * Firestore hiccup doesn't break the user's "Assign" action — but a
 * `spartboard:plc-write-failed` event is dispatched so the UI layer can
 * surface a toast.
 */
export async function writePlcAssignmentIndexEntry(
  plcId: string,
  entry: PlcAssignmentIndexEntry
): Promise<void> {
  try {
    await setDoc(
      doc(db, PLCS_COLLECTION, plcId, ASSIGNMENT_INDEX_SUBCOLLECTION, entry.id),
      entry
    );
  } catch (err) {
    logError('writePlcAssignmentIndexEntry.write', err, {
      plcId,
      entryId: entry.id,
    });
    notifyPlcWriteFailure({ scope: 'assignmentIndex', plcId });
  }
}

/**
 * Mirror a status change to the PLC index entry. Called fire-and-forget
 * from `pauseAssignment` / `deactivateAssignment` / `reopenAssignment`
 * whenever the canonical assignment carries `settings.plc`. Failures log
 * but never reject — the canonical assignment update is the primary write
 * and must not be blocked by the mirror.
 *
 * `not-found` here is benign: it means the index entry was deleted (or
 * the PLC was) between the canonical write and this mirror call. The
 * In-progress / Completed sub-tabs will simply not show the entry — same
 * end state as a successful mirror to a deleted row.
 */
export async function mirrorPlcAssignmentStatus(
  plcId: string,
  assignmentId: string,
  status: QuizAssignmentStatus
): Promise<void> {
  try {
    await updateDoc(
      doc(
        db,
        PLCS_COLLECTION,
        plcId,
        ASSIGNMENT_INDEX_SUBCOLLECTION,
        assignmentId
      ),
      { status }
    );
  } catch (err) {
    // `not-found` here is part of the documented benign-state contract
    // (entry was deleted between canonical write and mirror); don't toast
    // for that case to avoid spurious noise. Genuine permission/network
    // failures still surface.
    const code =
      err instanceof Error && 'code' in err
        ? (err as { code?: string }).code
        : undefined;
    logError('mirrorPlcAssignmentStatus.write', err, {
      plcId,
      assignmentId,
      status,
    });
    if (code !== 'not-found') {
      notifyPlcWriteFailure({ scope: 'assignmentStatusMirror', plcId });
    }
  }
}

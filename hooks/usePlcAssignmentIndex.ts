import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcAssignmentIndexEntry } from '@/types';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';
const ASSIGNMENT_INDEX_SUBCOLLECTION = 'assignment_index';

interface UsePlcAssignmentIndexResult {
  entries: PlcAssignmentIndexEntry[];
  loading: boolean;
}

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
  return {
    id,
    kind,
    ownerUid: data.ownerUid,
    ownerName: typeof data.ownerName === 'string' ? data.ownerName : '',
    ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : '',
    title: data.title,
    sheetUrl: data.sheetUrl,
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
      },
      (err) => {
        logError('usePlcAssignmentIndex.snapshot', err, { plcId });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return useMemo(() => ({ entries, loading }), [entries, loading]);
};

/**
 * One-shot write of an index entry. Called from the quiz assignment
 * creation flow when the new assignment opts into PLC mode. Failures are
 * non-fatal — the assignment itself has already committed; the dashboard
 * can recover via a manual reindex later. We log + swallow so a transient
 * Firestore hiccup doesn't break the user's "Assign" action.
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
  }
}

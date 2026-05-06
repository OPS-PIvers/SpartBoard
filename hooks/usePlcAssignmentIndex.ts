import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcAssignmentIndexEntry } from '@/types';

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
  // `kind` is a discriminator for future video-activity entries; default to
  // 'quiz' for legacy or partially-written rows so the dashboard doesn't
  // drop them.
  const kind = data.kind === 'quiz' ? 'quiz' : 'quiz';
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

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setEntries([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    // No `setLoading(true)` here: the initial useState value is already
    // true, and the snapshot callback flips it to false on first emit
    // (success or error). Switching `plcId` mid-mount isn't a supported
    // path — the dashboard remounts when the user picks a different PLC.
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      ASSIGNMENT_INDEX_SUBCOLLECTION
    );
    const unsub = onSnapshot(
      query(ref),
      (snap) => {
        const list: PlcAssignmentIndexEntry[] = [];
        snap.forEach((d) => {
          const parsed = parseEntry(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.error('[usePlcAssignmentIndex] snapshot error:', err);
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
    console.error('[writePlcAssignmentIndexEntry] write failed:', err);
  }
}

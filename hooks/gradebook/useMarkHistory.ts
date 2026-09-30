import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  GRADEBOOK_COLLECTIONS,
  type GradebookHistoryEntry,
} from '@/utils/gradebook/gradebookCore';

export interface MarkHistoryItem extends GradebookHistoryEntry {
  id: string;
}

const HISTORY_LIMIT = 50;

/** D24 change log for one mark; pass null to stay idle until the list is shown. */
export function useMarkHistory(markId: string | null): {
  entries: MarkHistoryItem[];
  loading: boolean;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<{
    key: string | null;
    entries: MarkHistoryItem[];
  }>({ key: null, entries: [] });
  const key = markId && uid ? `${uid}/${markId}` : null;

  useEffect(() => {
    if (!markId || !uid) return;
    const q = query(
      collection(
        db,
        GRADEBOOK_COLLECTIONS.marks,
        markId,
        GRADEBOOK_COLLECTIONS.history
      ),
      where('ownerUid', '==', uid)
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          key: `${uid}/${markId}`,
          entries: snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as GradebookHistoryEntry) }))
            .sort((a, b) => b.at - a.at)
            .slice(0, HISTORY_LIMIT),
        }),
      () => setState({ key: `${uid}/${markId}`, entries: [] })
    );
  }, [markId, uid]);

  if (!key) return { entries: [], loading: false };
  return state.key === key
    ? { entries: state.entries, loading: false }
    : { entries: [], loading: true };
}

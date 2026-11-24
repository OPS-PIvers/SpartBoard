// The student's own returned copies (D12): rules let them read a copy only once it is returned.
import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingDraft } from '@/types';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';

const MAX_RETURNED = 50;

/** One listener over the returned copies only, the newest 50. */
export function useWritingReturnedDrafts(
  sessionId: string,
  studentUid: string | null,
  returnedAt: number | undefined
): WritingDraftWithId[] {
  const [found, setFound] = useState<WritingDraftWithId[]>([]);
  const key = `${sessionId}/${studentUid ?? ''}/${returnedAt ? 1 : 0}`;
  const [previousKey, setPreviousKey] = useState(key);
  if (previousKey !== key) {
    setPreviousKey(key);
    setFound([]);
  }

  useEffect(() => {
    if (!studentUid || !returnedAt) return undefined;
    return onSnapshot(
      query(
        collection(
          db,
          'writing_assignment_sessions',
          sessionId,
          'responses',
          studentUid,
          'drafts'
        ),
        where('returnedAt', '>', 0),
        orderBy('returnedAt', 'desc'),
        limit(MAX_RETURNED)
      ),
      (snap) =>
        setFound(
          snap.docs.map((d) => ({ ...(d.data() as WritingDraft), id: d.id }))
        ),
      () => setFound([])
    );
  }, [sessionId, studentUid, returnedAt]);

  return found;
}

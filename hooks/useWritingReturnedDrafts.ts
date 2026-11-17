// The student's own returned copies (D12): rules let them read a copy only once it is returned.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingDraft } from '@/types';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';

/** Copy ids are `String(seq)` for seq 1..draftSeq; ones not returned are refused and left out. */
export function useWritingReturnedDrafts(
  sessionId: string,
  studentUid: string | null,
  draftSeq: number,
  returnedAt: number | undefined
): WritingDraftWithId[] {
  const [found, setFound] = useState<Record<string, WritingDraftWithId>>({});
  const key = `${sessionId}/${studentUid ?? ''}/${draftSeq}/${returnedAt ?? 0}`;
  const [previousKey, setPreviousKey] = useState(key);
  if (previousKey !== key) {
    setPreviousKey(key);
    setFound({});
  }

  useEffect(() => {
    if (!studentUid || !returnedAt || draftSeq < 1) return undefined;
    const offs: Array<() => void> = [];
    for (let seq = Math.max(1, draftSeq - 49); seq <= draftSeq; seq++) {
      const id = String(seq);
      offs.push(
        onSnapshot(
          doc(
            db,
            'writing_assignment_sessions',
            sessionId,
            'responses',
            studentUid,
            'drafts',
            id
          ),
          (snap) =>
            setFound((all) => {
              const next = { ...all };
              if (snap.exists())
                next[id] = { ...(snap.data() as WritingDraft), id };
              else delete next[id];
              return next;
            }),
          // A copy that is not returned yet is refused; it is simply not shown.
          () => undefined
        )
      );
    }
    return () => offs.forEach((off) => off());
  }, [sessionId, studentUid, draftSeq, returnedAt]);

  return Object.values(found).filter((d) => typeof d.returnedAt === 'number');
}

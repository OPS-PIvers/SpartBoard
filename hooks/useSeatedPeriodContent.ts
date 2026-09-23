import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PeriodAccessSessionFields } from '@/types';
import {
  hasPeriodAccess,
  nextScheduledOpen,
  pickPeriodKey,
} from '@/utils/periodAccess';
import { getServerNow } from '@/utils/serverTime';

interface Options {
  /** e.g. `mini_app_sessions`; the seat is `{collection}/{id}/seats/{uid}`. */
  sessionCollection: string;
  sessionId: string | null;
  session: PeriodAccessSessionFields | null;
  /** The session keeps its hidden content in `content/{contentDoc}`. */
  inContent: boolean;
  contentDoc: string;
  uid: string | null;
}

export interface SeatedPeriodContent<T> {
  /** The period the student's seat names (empty until seated). */
  periodKeys: string[];
  content: T | null;
  /** True while a per-period session's content is hidden or still loading. */
  contentPending: boolean;
  /** Seats the student in one of `candidateKeys`, an open one first; false when there is none. */
  takeSeat: (candidateKeys: readonly string[]) => Promise<boolean>;
}

/** Student side of a per-period session whose period lives on a seat doc (Guided Learning's pattern). */
export function useSeatedPeriodContent<T>({
  sessionCollection,
  sessionId,
  session,
  inContent,
  contentDoc,
  uid,
}: Options): SeatedPeriodContent<T> {
  const [periodKeys, setPeriodKeys] = useState<string[]>([]);
  const [content, setContent] = useState<T | null>(null);
  const [contentRetry, setContentRetry] = useState(0);

  // A denied content read retries on gate-field changes, on seating and at a scheduled open.
  const gateSignature = inContent
    ? JSON.stringify([
        session?.periodAccess ?? null,
        uid ? (session?.studentAccess?.[uid] ?? null) : null,
      ])
    : '';
  useEffect(() => {
    if (!session || !hasPeriodAccess(session)) return;
    const nextOpen = nextScheduledOpen(session, periodKeys, getServerNow());
    if (nextOpen == null) return;
    const id = setTimeout(
      () => setContentRetry((n) => n + 1),
      Math.max(0, nextOpen - getServerNow()) + 1000
    );
    return () => clearTimeout(id);
  }, [session, periodKeys]);
  useEffect(() => {
    if (!inContent || !sessionId) return;
    return onSnapshot(
      doc(db, sessionCollection, sessionId, 'content', contentDoc),
      (snap) => {
        if (snap.exists()) setContent(snap.data() as T);
      },
      (err) => {
        if ((err as { code?: string }).code !== 'permission-denied') {
          console.error('[useSeatedPeriodContent] Content error:', err);
        }
      }
    );
    // gateSignature and contentRetry re-run a denied read.
  }, [
    inContent,
    sessionCollection,
    sessionId,
    contentDoc,
    gateSignature,
    contentRetry,
  ]);

  const takeSeat = useCallback(
    async (candidateKeys: readonly string[]): Promise<boolean> => {
      if (!session || !hasPeriodAccess(session) || !uid || !sessionId)
        return true;
      const key = pickPeriodKey(session, candidateKeys, getServerNow());
      if (!key) return false;
      await setDoc(doc(db, sessionCollection, sessionId, 'seats', uid), {
        classId: key,
      });
      // The rules gate on the seat's one period, so the client does too.
      setPeriodKeys([key]);
      setContentRetry((n) => n + 1);
      return true;
    },
    [session, sessionCollection, sessionId, uid]
  );

  return {
    periodKeys,
    content,
    contentPending: inContent && !content,
    takeSeat,
  };
}

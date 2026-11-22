// The student side of Writing peer review: who I read, my partner's writing, and the notes on mine.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type {
  WritingPeerAccess,
  WritingPeerMark,
  WritingPeerReview,
} from '@/types';
import { logError } from '@/utils/logError';

const SESSIONS = 'writing_assignment_sessions';
const POLL_MS = 20_000;
/** Shown once peer review ends and names are no longer looked up. */
const PARTNER_FALLBACK = 'Your partner';

export interface PeerPerson {
  uid: string;
  name: string;
}

export interface PeerInfo {
  running: boolean;
  access?: WritingPeerAccess;
  reviews?: PeerPerson | null;
  reviewedBy?: PeerPerson[];
}

export interface PartnerWriting {
  html: string;
  started: boolean;
  marks: WritingPeerMark[];
}

export type NewPeerMark =
  | { kind: 'comment'; start: number; end: number; quote: string; body: string }
  | { kind: 'edit'; start: number; end: number; quote: string; insert: string };

const call = httpsCallable<Record<string, unknown>, unknown>(
  functions,
  'writingPeerReviewV1'
);

/** Partner notes on one student's writing, oldest first; read by that student or the teacher. */
export function useWritingPeerNotes(
  sessionId: string,
  studentUid: string | null
): WritingPeerMark[] {
  const [notes, setNotes] = useState<{
    key: string;
    list: WritingPeerMark[];
  } | null>(null);
  const key = `${sessionId}/${studentUid ?? ''}`;
  useEffect(() => {
    if (!studentUid) return;
    return onSnapshot(
      collection(db, SESSIONS, sessionId, 'responses', studentUid, 'peer'),
      (snap) =>
        setNotes({
          key: `${sessionId}/${studentUid}`,
          list: snap.docs
            .map((d) => ({ ...(d.data() as WritingPeerMark), id: d.id }))
            .sort((a, b) => a.createdAt - b.createdAt),
        }),
      (err) => logError('writingPeerReview.notes', err)
    );
  }, [sessionId, studentUid]);
  return useMemo(
    () => (studentUid && notes?.key === key ? notes.list : []),
    [studentUid, notes, key]
  );
}

export function useWritingPeerReview(args: {
  sessionId: string;
  studentUid: string;
  peerReview: WritingPeerReview | null | undefined;
  /** Polls the partner's writing only while their tab shows. */
  partnerOpen: boolean;
}) {
  const { sessionId, studentUid, peerReview, partnerOpen } = args;
  const running = !!peerReview && peerReview.endedAt == null;
  const runKey = running ? `${peerReview.startedAt}:${peerReview.access}` : '';
  const [info, setInfo] = useState<PeerInfo | null>(null);
  const [partner, setPartner] = useState<PartnerWriting | null>(null);
  const [partnerError, setPartnerError] = useState(false);
  const [readTick, setReadTick] = useState(0);

  // Who I read and who reads me, with names from the server; asked again whenever the teacher changes pairs.
  useEffect(() => {
    if (!runKey) return;
    let live = true;
    call({ sessionId, action: 'info' })
      .then((r) => live && setInfo(r.data as PeerInfo))
      .catch((err: unknown) => {
        logError('writingPeerReview.info', err);
        if (live) setInfo({ running: false });
      });
    return () => {
      live = false;
    };
  }, [sessionId, runKey]);

  // Notes partners left on my writing; they stay after peer review ends.
  const notes = useWritingPeerNotes(sessionId, peerReview ? studentUid : null);

  // My partner's writing and my notes on it, read through the server and refreshed while their tab is open.
  const readsPartner = running && partnerOpen && !!info?.reviews;
  useEffect(() => {
    if (!readsPartner) return;
    let live = true;
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      call({ sessionId, action: 'read' })
        .then((r) => {
          if (!live) return;
          setPartner(r.data as PartnerWriting);
          setPartnerError(false);
        })
        .catch((err: unknown) => {
          logError('writingPeerReview.read', err);
          if (live) setPartnerError(true);
        });
    };
    read();
    const id = window.setInterval(read, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [sessionId, readsPartner, readTick]);

  const addMark = useCallback(
    async (mark: NewPeerMark): Promise<boolean> => {
      try {
        await call({ sessionId, action: 'add', ...mark });
        setReadTick((n) => n + 1);
        return true;
      } catch (err) {
        logError('writingPeerReview.add', err);
        return false;
      }
    },
    [sessionId]
  );

  const deleteMark = useCallback(
    async (markId: string): Promise<boolean> => {
      try {
        await call({ sessionId, action: 'delete', markId });
        setReadTick((n) => n + 1);
        return true;
      } catch (err) {
        logError('writingPeerReview.delete', err);
        return false;
      }
    },
    [sessionId]
  );

  const closeNote = useCallback(
    async (
      markId: string,
      status: 'accepted' | 'rejected' | 'resolved'
    ): Promise<boolean> => {
      try {
        await updateDoc(
          doc(db, SESSIONS, sessionId, 'responses', studentUid, 'peer', markId),
          { status, resolvedAt: Date.now() }
        );
        return true;
      } catch (err) {
        logError('writingPeerReview.close', err);
        return false;
      }
    },
    [sessionId, studentUid]
  );

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of info?.reviewedBy ?? []) m.set(p.uid, p.name);
    if (info?.reviews) m.set(info.reviews.uid, info.reviews.name);
    return m;
  }, [info]);

  return {
    running: running && info?.running === true,
    access: info?.access ?? peerReview?.access ?? 'view',
    reviews: running ? (info?.reviews ?? null) : null,
    notes,
    partner: readsPartner ? partner : null,
    partnerError,
    nameOf: (uid: string) => {
      const name = names.get(uid);
      if (name) return name;
      return PARTNER_FALLBACK;
    },
    addMark,
    deleteMark,
    closeNote,
  };
}

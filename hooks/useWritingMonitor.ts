// The teacher's live read of one Writing session and its responses, for the monitor (D15).
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingAssignmentSession, WritingResponse } from '@/types';
import { logError } from '@/utils/logError';
import { getServerNow } from '@/utils/serverTime';
import { readWritingResponse } from '@/utils/writingMonitor';

export interface WritingMonitorState {
  session: WritingAssignmentSession | null;
  responses: WritingResponse[];
  loading: boolean;
  /** The session doc is gone (deleted) or could not be read. */
  missing: boolean;
  /** This tab's clock when each student's save count last moved; the student's own clock can be off. */
  seenAt: Record<string, number>;
}

const EMPTY: WritingMonitorState = {
  session: null,
  responses: [],
  loading: true,
  missing: false,
  seenAt: {},
};

export function useWritingMonitor(
  sessionId: string | undefined
): WritingMonitorState {
  const [state, setState] = useState<{
    id: string | undefined;
    value: WritingMonitorState;
  }>({ id: sessionId, value: EMPTY });
  if (state.id !== sessionId) setState({ id: sessionId, value: EMPTY });

  useEffect(() => {
    if (!sessionId) return undefined;
    const sessionRef = doc(db, 'writing_assignment_sessions', sessionId);
    const stopSession = onSnapshot(
      sessionRef,
      (snap) =>
        setState((prev) =>
          prev.id !== sessionId
            ? prev
            : {
                id: sessionId,
                value: {
                  ...prev.value,
                  session: snap.exists()
                    ? ({
                        ...snap.data(),
                        id: snap.id,
                      } as WritingAssignmentSession)
                    : null,
                  missing: !snap.exists(),
                  loading: false,
                },
              }
        ),
      (err) => {
        logError('useWritingMonitor.session', err, { sessionId });
        setState((prev) =>
          prev.id !== sessionId
            ? prev
            : {
                id: sessionId,
                value: { ...prev.value, missing: true, loading: false },
              }
        );
      }
    );
    // A save seen after the first snapshot is timed by this tab's clock.
    const counts = new Map<string, number>();
    let first = true;
    const stopResponses = onSnapshot(
      collection(sessionRef, 'responses'),
      (snap) => {
        const responses = snap.docs.map((d) =>
          readWritingResponse(d.data(), d.id)
        );
        const at = getServerNow();
        const moved: Record<string, number> = {};
        for (const r of responses) {
          const count = r.saveCount ?? 0;
          if (!first && count > 0 && counts.get(r.studentUid) !== count)
            moved[r.studentUid] = at;
          counts.set(r.studentUid, count);
        }
        first = false;
        setState((prev) =>
          prev.id !== sessionId
            ? prev
            : {
                id: sessionId,
                value: {
                  ...prev.value,
                  responses,
                  seenAt: { ...prev.value.seenAt, ...moved },
                },
              }
        );
      },
      (err) => logError('useWritingMonitor.responses', err, { sessionId })
    );
    return () => {
      stopSession();
      stopResponses();
    };
  }, [sessionId]);

  return sessionId ? state.value : { ...EMPTY, loading: false };
}

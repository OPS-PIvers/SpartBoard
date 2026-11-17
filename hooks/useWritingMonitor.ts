// The teacher's live read of one Writing session and its responses, for the monitor (D15).
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingAssignmentSession, WritingResponse } from '@/types';
import { logError } from '@/utils/logError';

export interface WritingMonitorState {
  session: WritingAssignmentSession | null;
  responses: WritingResponse[];
  loading: boolean;
  /** The session doc is gone (deleted) or could not be read. */
  missing: boolean;
}

const EMPTY: WritingMonitorState = {
  session: null,
  responses: [],
  loading: true,
  missing: false,
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
    const stopResponses = onSnapshot(
      collection(sessionRef, 'responses'),
      (snap) =>
        setState((prev) =>
          prev.id !== sessionId
            ? prev
            : {
                id: sessionId,
                value: {
                  ...prev.value,
                  responses: snap.docs.map(
                    (d) =>
                      ({ ...d.data(), studentUid: d.id }) as WritingResponse
                  ),
                },
              }
        ),
      (err) => logError('useWritingMonitor.responses', err, { sessionId })
    );
    return () => {
      stopSession();
      stopResponses();
    };
  }, [sessionId]);

  return sessionId ? state.value : { ...EMPTY, loading: false };
}

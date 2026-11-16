// The teacher's assigned Writing sessions, read from `users/{uid}/writing_assignment_records`; changes go through callables.
import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type { WritingAssignmentRecord } from '@/types';
import { logError } from '@/utils/logError';
import type { AssignWritingInput } from '@/utils/writingAssign';

export const WRITING_RECORDS_COLLECTION = 'writing_assignment_records';

export interface UseWritingAssignmentSessionsResult {
  records: WritingAssignmentRecord[];
  loading: boolean;
  /** Creates the session and the record; resolves the new session id. */
  assign: (input: AssignWritingInput) => Promise<string>;
  end: (sessionId: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
}

export function useWritingAssignmentSessions(
  userId: string | undefined
): UseWritingAssignmentSessionsResult {
  const [records, setRecords] = useState<WritingAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [previousUserId, setPreviousUserId] = useState(userId);
  if (previousUserId !== userId) {
    setPreviousUserId(userId);
    setRecords([]);
    setLoading(Boolean(userId));
  }

  useEffect(() => {
    if (!userId) return undefined;
    return onSnapshot(
      query(
        collection(db, 'users', userId, WRITING_RECORDS_COLLECTION),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setRecords(
          snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as WritingAssignmentRecord
          )
        );
        setLoading(false);
      },
      (err) => {
        logError('useWritingAssignmentSessions.onSnapshot', err, { userId });
        setLoading(false);
      }
    );
  }, [userId]);

  const assign = useCallback(async (input: AssignWritingInput) => {
    const res = await httpsCallable<AssignWritingInput, { sessionId: string }>(
      functions,
      'assignWritingV1'
    )(input);
    return res.data.sessionId;
  }, []);

  const end = useCallback(async (sessionId: string) => {
    await httpsCallable(functions, 'endWritingSessionV1')({ sessionId });
  }, []);

  const remove = useCallback(async (sessionId: string) => {
    await httpsCallable(functions, 'deleteWritingSessionV1')({ sessionId });
  }, []);

  return { records, loading, assign, end, remove };
}

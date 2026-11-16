// The teacher's assigned Writing sessions, read from `users/{uid}/writing_assignment_records`; changes go through callables.
import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type {
  StudentOverride,
  StudentTargetRef,
  WritingAssignmentRecord,
} from '@/types';
import type { PeriodAccessPatch } from '@/hooks/usePeriodAccess';
import { logError } from '@/utils/logError';
import type { AssignWritingInput } from '@/utils/writingAssign';

export const WRITING_RECORDS_COLLECTION = 'writing_assignment_records';

/** What `updateWritingSessionV1` reads: the hub's edits and the class Start/Pause/Let in controls. */
export interface UpdateWritingSessionInput extends PeriodAccessPatch {
  sessionId: string;
  window?: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
  record?: {
    targetGroupIds?: string[];
    /** null clears that student's override. */
    overrides?: Record<string, StudentOverride | null>;
    excludedTargets?: StudentTargetRef[];
    targetSkippedCount?: number;
    /** Added to the stored list. */
    removedStudentRefs?: StudentTargetRef[];
  };
}

/** No client writes a Writing session or its record; these edits go through the server. */
export async function updateWritingSession(
  input: UpdateWritingSessionInput
): Promise<void> {
  await httpsCallable(functions, 'updateWritingSessionV1')(input);
}

export async function endWritingSession(sessionId: string): Promise<void> {
  await httpsCallable(functions, 'endWritingSessionV1')({ sessionId });
}

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

  const end = useCallback(
    (sessionId: string) => endWritingSession(sessionId),
    []
  );

  const remove = useCallback(async (sessionId: string) => {
    await httpsCallable(functions, 'deleteWritingSessionV1')({ sessionId });
  }, []);

  return { records, loading, assign, end, remove };
}

// Teacher side of one Writing session: the session, every response, one student's frozen copies, and the grading callables.
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type {
  WritingAssignmentRecord,
  WritingAssignmentSession,
  WritingDraft,
  WritingResponse,
} from '@/types';
import { logError } from '@/utils/logError';
import type { WritingFeedbackPayload } from '@/utils/writingGrading';

const SESSIONS = 'writing_assignment_sessions';

export interface WritingResultsData {
  session: WritingAssignmentSession | null;
  responses: WritingResponse[];
  loading: boolean;
  error: boolean;
}

export function useWritingResults(
  sessionId: string | null
): WritingResultsData {
  const [session, setSession] = useState<WritingAssignmentSession | null>(null);
  const [responses, setResponses] = useState<WritingResponse[]>([]);
  const [loaded, setLoaded] = useState({ session: false, responses: false });
  const [error, setError] = useState(false);
  const [previousId, setPreviousId] = useState(sessionId);
  if (previousId !== sessionId) {
    setPreviousId(sessionId);
    setSession(null);
    setResponses([]);
    setLoaded({ session: false, responses: false });
    setError(false);
  }

  useEffect(() => {
    if (!sessionId) return undefined;
    const fail = (where: string) => (err: Error) => {
      logError(`useWritingResults.${where}`, err, { sessionId });
      setError(true);
      setLoaded({ session: true, responses: true });
    };
    const offSession = onSnapshot(
      doc(db, SESSIONS, sessionId),
      (snap) => {
        setSession(
          snap.exists()
            ? ({ ...snap.data(), id: snap.id } as WritingAssignmentSession)
            : null
        );
        setLoaded((l) => ({ ...l, session: true }));
      },
      fail('session')
    );
    const offResponses = onSnapshot(
      collection(db, SESSIONS, sessionId, 'responses'),
      (snap) => {
        setResponses(
          snap.docs.map(
            (d) => ({ ...d.data(), studentUid: d.id }) as WritingResponse
          )
        );
        setLoaded((l) => ({ ...l, responses: true }));
      },
      fail('responses')
    );
    return () => {
      offSession();
      offResponses();
    };
  }, [sessionId]);

  return {
    session,
    responses,
    loading: Boolean(sessionId) && !(loaded.session && loaded.responses),
    error,
  };
}

/** The teacher's record of the session, for its student targeting. */
export function useWritingRecord(
  teacherUid: string | undefined,
  sessionId: string
): WritingAssignmentRecord | undefined {
  const [state, setState] = useState<{
    key: string;
    record: WritingAssignmentRecord | undefined;
  } | null>(null);
  const key = `${teacherUid ?? ''}/${sessionId}`;
  useEffect(() => {
    if (!teacherUid) return undefined;
    const k = `${teacherUid}/${sessionId}`;
    return onSnapshot(
      doc(db, 'users', teacherUid, 'writing_assignment_records', sessionId),
      (snap) =>
        setState({
          key: k,
          record: snap.exists()
            ? ({ ...snap.data(), id: snap.id } as WritingAssignmentRecord)
            : undefined,
        }),
      (err) => logError('useWritingRecord', err, { sessionId })
    );
  }, [teacherUid, sessionId]);
  return state?.key === key ? state.record : undefined;
}

export type WritingDraftWithId = WritingDraft & { id: string };

/** One student's frozen copies, live, in no particular order. */
export function useWritingDrafts(
  sessionId: string | null,
  studentUid: string | null
): { drafts: WritingDraftWithId[]; loading: boolean } {
  const key = sessionId && studentUid ? `${sessionId}/${studentUid}` : null;
  const [state, setState] = useState<{
    key: string | null;
    drafts: WritingDraftWithId[];
  }>({ key: null, drafts: [] });

  useEffect(() => {
    if (!sessionId || !studentUid) return undefined;
    const k = `${sessionId}/${studentUid}`;
    return onSnapshot(
      collection(db, SESSIONS, sessionId, 'responses', studentUid, 'drafts'),
      (snap) =>
        setState({
          key: k,
          drafts: snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as WritingDraftWithId
          ),
        }),
      (err) => {
        logError('useWritingDrafts', err, { sessionId });
        setState({ key: k, drafts: [] });
      }
    );
  }, [sessionId, studentUid]);

  return {
    drafts: state.key === key ? state.drafts : [],
    loading: key !== null && state.key !== key,
  };
}

export interface SaveWritingFeedbackInput {
  sessionId: string;
  studentUid: string;
  draftId: string;
  turnedInAt: number;
  feedback: WritingFeedbackPayload;
}

export async function saveWritingFeedback(
  input: SaveWritingFeedbackInput
): Promise<{ draftId: string; counts: boolean }> {
  const res = await httpsCallable<
    SaveWritingFeedbackInput,
    { draftId: string; counts: boolean }
  >(
    functions,
    'saveWritingFeedbackV1'
  )(input);
  return res.data;
}

export interface ReturnWritingInput {
  sessionId: string;
  studentUid: string;
  /** D11: changes the session's student's-view switch with this return. */
  studentCanViewRecord?: boolean;
}

export async function returnWriting(
  input: ReturnWritingInput,
  revise: boolean
): Promise<void> {
  await httpsCallable(
    functions,
    revise ? 'returnWritingForRevisionV1' : 'returnWritingV1'
  )(input);
}

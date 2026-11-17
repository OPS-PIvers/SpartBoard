// `/writing/{sessionId}`: the student's Writing assignment, read live from the session and their own response.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useStudentAuth } from '@/context/useStudentAuth';
import type {
  WritingAssignmentSession,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { WritingStudentShell } from './WritingStudentShell';

const SESSIONS = 'writing_assignment_sessions';

const writingSessionIdFromPath = (pathname: string): string =>
  decodeURIComponent(pathname.replace(/^\/writing\//, '').split('/')[0] ?? '');

type View =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; session: WritingAssignmentSession };

const goBack = () => {
  window.location.href = '/my-assignments';
};

export const WritingAssignmentPage: React.FC = () => {
  const { pseudonymUid } = useStudentAuth();
  const sessionId = writingSessionIdFromPath(window.location.pathname);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [status, setStatus] = useState<WritingResponseStatus | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    return onSnapshot(
      doc(db, SESSIONS, sessionId),
      (snap) =>
        setView(
          snap.exists()
            ? {
                kind: 'ready',
                session: {
                  ...(snap.data() as WritingAssignmentSession),
                  id: snap.id,
                },
              }
            : { kind: 'missing' }
        ),
      () => setView({ kind: 'missing' })
    );
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !pseudonymUid) return;
    return onSnapshot(
      doc(db, SESSIONS, sessionId, 'responses', pseudonymUid),
      (snap) =>
        setStatus(
          snap.exists() ? (snap.data() as WritingResponse).status : null
        ),
      () => setStatus(null)
    );
  }, [sessionId, pseudonymUid]);

  if (!sessionId || view.kind === 'missing')
    return (
      <div className="flex h-screen h-dvh flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center text-slate-700">
        <p className="text-base font-bold">This assignment is not available.</p>
        {/* no-tour-anchor: student page */}
        <a
          href="/my-assignments"
          className="inline-flex min-h-[44px] items-center rounded-full bg-white px-5 text-sm font-bold text-slate-700 shadow-xs hover:bg-slate-50"
        >
          Back to my assignments
        </a>
      </div>
    );

  if (view.kind === 'loading')
    return (
      <div className="flex h-screen h-dvh items-center justify-center bg-slate-100 text-slate-700">
        <Loader2
          aria-hidden="true"
          className="mr-2 h-5 w-5 animate-spin text-teal-700"
        />
        Loading
      </div>
    );

  return (
    <WritingStudentShell
      session={view.session}
      status={status}
      onDone={goBack}
    />
  );
};

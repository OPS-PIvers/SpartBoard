// `/writing/{sessionId}`: the student's Writing assignment, read live from the session and their own response.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useStudentAuth } from '@/context/useStudentAuth';
import type { WritingAssignmentSession } from '@/types';
import { useStudentAssignmentPointer } from '@/hooks/useStudentAssignmentPointer';
import { useTabAwayTracker } from '@/hooks/useTabAwayTracker';
import { useWritingPiece } from '@/hooks/useWritingPiece';
import { PageProtectionGuards } from '@/components/common/PageProtectionGuards';
import { effectivePageProtections } from '@/utils/pageProtections';
import { deriveWritingView, writingClosed } from '@/utils/writingStudentView';
import { WritingStudentShell } from './WritingStudentShell';
import { StudentWritingRecordButton } from './StudentWritingRecord';

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

/** The page clock, ticking each 30 s so a close or due date passing shows without a reload. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const WritingPiecePage: React.FC<{
  session: WritingAssignmentSession;
  studentUid: string;
}> = ({ session, studentUid }) => {
  const now = useMinuteClock();
  // Per-student accommodations live on the student's own pointer, never on the session (M17).
  const pointer = useStudentAssignmentPointer(studentUid, session.id);
  const override = pointer?.override;
  const pointerFacts = pointer
    ? { closeAt: pointer.closeAt ?? null, dueAt: pointer.dueAt ?? null }
    : null;
  const piece = useWritingPiece({
    sessionId: session.id,
    studentUid,
    allowPaste: session.allowPaste === true,
    closed: writingClosed(session, pointerFacts, now),
  });
  const view = deriveWritingView({
    session,
    response: piece.response,
    pointer: pointerFacts,
    tab: {
      myTabId: piece.myTabId,
      holding: piece.holding,
      claiming: piece.claiming,
      online: piece.online,
      dirty: piece.dirty,
      slow: piece.slow,
      refused: piece.refused,
      copyOk: piece.copyOk,
      turningIn: piece.turningIn,
      html: piece.html,
    },
    now,
  });
  const flushBeforeLeave = piece.flushBeforeLeave;
  const onDone = () => {
    void flushBeforeLeave().finally(goBack);
  };

  // Focus mode: fullscreen at the lock level and print blocking; the editor owns paste (D8).
  const protections = effectivePageProtections(session, override);
  const writing = view.mode === 'writing';
  // Time away from the tab goes into the summary (D9), once per return, past the exit log's cap too.
  const recordAway = piece.recordAway;
  const releaseRef = useRef<() => void>(() => undefined);
  const tracker = useTabAwayTracker({
    enabled: writing,
    sessionActive: session.status === 'active',
    ready: true,
    serverExits: undefined,
    attempt: 0,
    getPosition: () => ({}),
    onLeave: () => Promise.resolve(false),
    saveExits: undefined,
    onExitClosed: (_outcome, ms) => {
      recordAway(ms);
      releaseRef.current();
    },
    limitMs: null,
    autoSubmit: false,
    onAwayTooLong: () => undefined,
    fullscreenRequired: protections.fullscreen && writing,
  });
  useLayoutEffect(() => {
    releaseRef.current = tracker.release;
  });

  const response = piece.response;
  const readOnlyHtml = response?.html ?? '';
  return (
    <>
      <WritingStudentShell
        session={session}
        onDone={onDone}
        record={
          session.studentCanViewRecord === true && response ? (
            <StudentWritingRecordButton
              sessionId={session.id}
              studentUid={studentUid}
              facts={{
                summary: response.summary,
                logPurgedAt: response.logPurgedAt,
              }}
            />
          ) : undefined
        }
        piece={{
          view,
          editorKey: writing
            ? `w-${piece.seed.key}`
            : `r-${view.mode}-${response?.saveCount ?? 0}`,
          editorHtml: writing ? piece.seed.html : readOnlyHtml,
          unsent: piece.unsent,
          notice: piece.notice,
          busy: piece.busy,
          online: piece.online,
          contextMenuOff: override?.spellingHelp !== true,
          onStart: () => void piece.start(),
          onTurnIn: () => void piece.turnIn(),
          onTakeBack: () => void piece.takeBack(),
          onContinueHere: () => void piece.start(),
          onDismissUnsent: piece.dismissUnsent,
          onUnsentCopy: piece.onUnsentCopy,
          onEditorChange: piece.onEditorChange,
          allowInsert: piece.allowInsert,
          onEditorCopy: piece.onEditorCopy,
          bindEditor: piece.bindEditor,
        }}
      />
      {writing && (
        <PageProtectionGuards
          protections={{ ...protections, blockClipboard: false }}
        />
      )}
    </>
  );
};

export const WritingAssignmentPage: React.FC = () => {
  const { pseudonymUid } = useStudentAuth();
  const sessionId = writingSessionIdFromPath(window.location.pathname);
  const [view, setView] = useState<View>({ kind: 'loading' });

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

  if (view.kind === 'loading' || !pseudonymUid)
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
    <WritingPiecePage
      key={`${sessionId}:${pseudonymUid}`}
      session={view.session}
      studentUid={pseudonymUid}
    />
  );
};

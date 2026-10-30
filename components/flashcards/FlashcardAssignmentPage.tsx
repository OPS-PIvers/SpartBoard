import React, { useEffect, useReducer, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Info,
  Layers3,
  Loader2,
  Lock,
  PauseCircle,
} from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { db, functions } from '@/config/firebase';
import { useStudentAuth } from '@/context/useStudentAuth';
import { useStudentAssignmentPointer } from '@/hooks/useStudentAssignmentPointer';
import { staffResponseFields, type StaffIdentity } from '@/utils/staffAudience';
import type {
  FlashcardProgress,
  FlashcardSession,
  StudentAssignmentPointer,
} from '@/types';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { AssignmentExcludedNotice } from '@/components/student/AssignmentExcludedNotice';
import { useSeatedPeriodContent } from '@/hooks/useSeatedPeriodContent';
import { useServerNow } from '@/hooks/useServerNow';
import {
  hasPeriodAccess,
  nextScheduledOpen,
  studentCanEnter,
  studentPeriodKeys,
} from '@/utils/periodAccess';
import {
  FC_CONTENT_DOC,
  type FlashcardSessionContent,
} from '@/utils/flashcardSessionContent';
import {
  LocalFlashcardAdapter,
  TrackedFlashcardAdapter,
  sanitizeFlashcardStudyState,
} from './adapters';
import { FlashcardCheckResults } from './FlashcardCheckResults';
import { isFramedWindow } from './speak/micAccess';
import {
  FlashcardPlayer,
  type FlashcardCheckSubmission,
} from './FlashcardPlayer';
import { useSpeakWordFixes } from '@/hooks/useSpeakWordFixes';
import {
  deriveFlashcardStudentView,
  initialProgressListen,
  initialSeat,
  initialSubmit,
  nextWindowBoundary,
  progressListenReducer,
  seatReducer,
  shouldEnter,
  submitReducer,
  type Loadable,
} from './flashcardStudentView';

const PROGRESS_SUBCOLLECTION = 'progress';
// setTimeout overflows past ~24.8 days, so a far-off boundary re-arms instead.
const MAX_TIMEOUT_MS = 2_147_483_647;

const getAssignmentId = (): string | null => {
  const match = window.location.pathname.match(
    /^\/flashcards\/a\/([^/?#]+)\/?$/u
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const isSession = (value: unknown): value is Omit<FlashcardSession, 'id'> => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<FlashcardSession>;
  return (
    typeof candidate.title === 'string' &&
    (candidate.kind === 'check' || candidate.kind === 'study') &&
    typeof candidate.termLanguage === 'string' &&
    typeof candidate.definitionLanguage === 'string' &&
    Array.isArray(candidate.cards) &&
    Array.isArray(candidate.classIds)
  );
};

const PageMessage: React.FC<{
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  body?: string;
}> = ({ icon: Icon, title, body }) => (
  <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center">
    <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <Icon aria-hidden={true} className="mx-auto h-10 w-10 text-rose-600" />
      <h1 className="mt-4 text-xl font-black text-slate-900">{title}</h1>
      {body && <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>}
    </section>
  </div>
);

const createTrackedAdapter = (
  session: FlashcardSession,
  studentUid: string,
  classId: string,
  initial: FlashcardProgress | null,
  staff: StaffIdentity | undefined
): TrackedFlashcardAdapter =>
  new TrackedFlashcardAdapter({
    classId,
    initial,
    write: (payload) =>
      setDoc(
        doc(
          db,
          'flashcard_sessions',
          session.id,
          PROGRESS_SUBCOLLECTION,
          studentUid
        ),
        { ...payload, ...staffResponseFields(staff) },
        { merge: true }
      ),
    // Flashcards-mode Checks grade from mastery, so only the server may move it.
    rate:
      session.kind === 'check' && session.checkMode === 'flashcards'
        ? (ratings) =>
            httpsCallable(
              functions,
              'recordFlashcardCheckRatingsV1'
            )({ assignmentId: session.id, ratings })
        : undefined,
  });

const TrackedPlayer: React.FC<{
  session: FlashcardSession;
  progress: FlashcardProgress | null;
  studentUid: string;
  classId: string;
  /** The student's period is shut: cover the player and hold progress writes. */
  paused?: boolean;
  /** Bumps each time a teacher reset deletes this student's progress doc. */
  resetCount: number;
  /** A Staff-audience joiner, named on their progress doc. */
  staff?: StaffIdentity;
}> = ({
  session,
  progress,
  studentUid,
  classId,
  paused = false,
  resetCount,
  staff,
}) => {
  const { t } = useTranslation();
  const [framed] = useState(isFramedWindow);
  const [tracked, setTracked] = useState(() => ({
    adapter: createTrackedAdapter(
      session,
      studentUid,
      classId,
      progress,
      staff
    ),
    resetCount,
  }));
  const { adapter } = tracked;
  useEffect(() => {
    if (tracked.resetCount === resetCount) return;
    // Drop the old adapter's unsaved work so it can't recreate the deleted doc.
    tracked.adapter.discard();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds after the progress snapshot shows a teacher reset
    setTracked({
      adapter: createTrackedAdapter(session, studentUid, classId, null, staff),
      resetCount,
    });
  }, [resetCount, tracked, session, studentUid, classId, staff]);
  const [submitState, dispatchSubmit] = useReducer(
    submitReducer,
    initialSubmit
  );
  const isCheck = session.kind === 'check' && Boolean(session.checkMode);
  useEffect(() => {
    adapter.setPaused(paused);
  }, [adapter, paused]);

  const submit = async (submission: FlashcardCheckSubmission) => {
    if (paused) return;
    dispatchSubmit({ type: 'submitStarted' });
    try {
      await adapter.flush();
      if (adapter.hasUnsentRatings()) throw new Error('Ratings not saved yet.');
      await httpsCallable(
        functions,
        'submitFlashcardCheckV1'
      )({
        assignmentId: session.id,
        answerLog: submission.answerLog,
        flags: submission.flags,
      });
    } catch (submitError) {
      console.error('[FlashcardAssignmentPage] Submit failed:', submitError);
      dispatchSubmit({ type: 'submitFailed' });
    }
  };

  const speakFixes = useSpeakWordFixes(!isCheck && Boolean(session.speak));
  const player = (
    <FlashcardPlayer
      key={tracked.resetCount}
      cards={session.cards}
      termLanguage={session.termLanguage}
      definitionLanguage={session.definitionLanguage}
      adapter={adapter}
      seed={`${session.id}:${studentUid}`}
      speak={isCheck ? undefined : session.speak}
      speakFixes={speakFixes}
      framed={framed}
      lockedSettings={isCheck ? session.lockedSettings : undefined}
      check={
        isCheck && session.checkMode
          ? {
              mode: session.checkMode,
              masteryThreshold: session.masteryThreshold,
              initialCheckLog: progress?.checkLog,
              submitting: submitState.kind === 'submitting',
              error:
                submitState.kind === 'failed'
                  ? t('flashcards.assignment.submitError')
                  : null,
              onCheckWrite: (cardId, entry) =>
                adapter.recordCheckWrite(cardId, entry),
              onSubmit: (submission) => void submit(submission),
            }
          : undefined
      }
    />
  );
  return (
    <div className="relative h-full">
      {player}
      {paused && (
        <div
          role="status"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/85 p-6 text-center backdrop-blur-xs"
        >
          <PauseCircle
            aria-hidden="true"
            className="mb-4 h-12 w-12 text-white/80"
          />
          <h2 className="mb-2 text-2xl font-black text-white">
            {t('flashcards.assignment.periodPausedTitle')}
          </h2>
          <p className="max-w-sm text-sm text-slate-200">
            {t('flashcards.assignment.periodPausedBody')}
          </p>
        </div>
      )}
    </div>
  );
};

const UntrackedPlayer: React.FC<{
  session: FlashcardSession;
  progress: FlashcardProgress | null;
  studentUid: string;
}> = ({ session, progress, studentUid }) => {
  const [framed] = useState(isFramedWindow);
  const [adapter] = useState(
    () =>
      new LocalFlashcardAdapter(
        `assignment.${session.id}.${studentUid}`,
        progress ? sanitizeFlashcardStudyState(progress) : undefined
      )
  );
  const speakFixes = useSpeakWordFixes(
    session.kind !== 'check' && Boolean(session.speak)
  );
  return (
    <FlashcardPlayer
      cards={session.cards}
      termLanguage={session.termLanguage}
      definitionLanguage={session.definitionLanguage}
      adapter={adapter}
      seed={`${session.id}:${studentUid}`}
      speak={session.kind === 'check' ? undefined : session.speak}
      speakFixes={speakFixes}
      framed={framed}
    />
  );
};

const resolveClassId = (
  session: FlashcardSession,
  pointer: StudentAssignmentPointer | null,
  classIds: string[]
): string =>
  pointer?.classId ??
  session.classIds.find((classId) => classIds.includes(classId)) ??
  session.classId ??
  '';

export const FlashcardAssignmentPage: React.FC<{
  /** A Staff-audience link: the signed-in staff member, in place of a student. */
  staff?: StaffIdentity;
}> = ({ staff }) => {
  const { t } = useTranslation();
  const { pseudonymUid, classIds } = useStudentAuth();
  const [assignmentId] = useState(getAssignmentId);
  const [sessionState, setSessionState] = useState<Loadable<FlashcardSession>>(
    assignmentId ? { kind: 'loading' } : { kind: 'unavailable' }
  );
  const [listen, dispatchListen] = useReducer(
    progressListenReducer,
    initialProgressListen
  );
  const pointer = useStudentAssignmentPointer(
    pseudonymUid,
    assignmentId,
    !staff
  );
  const rawSession = sessionState.kind === 'ready' ? sessionState.value : null;
  const perPeriod = hasPeriodAccess(rawSession);
  const { periodKeys, content, contentPending, takeSeat } =
    useSeatedPeriodContent<FlashcardSessionContent>({
      sessionCollection: 'flashcard_sessions',
      sessionId: assignmentId,
      session: rawSession,
      inContent: rawSession?.cardsInContent === true,
      contentDoc: FC_CONTENT_DOC,
      uid: pseudonymUid,
    });
  const periodNow = useServerNow(perPeriod ? 5000 : null);
  const canEnter = studentCanEnter(
    rawSession,
    periodKeys,
    pseudonymUid,
    periodNow
  );
  const [seat, dispatchSeat] = useReducer(seatReducer, initialSeat);
  // Seat the student in their period once the session and pointer are known.
  const seatStarted = useRef(false);
  const readyToSeat =
    perPeriod && !!pseudonymUid && pointer !== undefined && !pointer?.excluded;
  useEffect(() => {
    if (!readyToSeat || !rawSession || seatStarted.current) return;
    seatStarted.current = true;
    takeSeat(studentPeriodKeys(rawSession, classIds))
      .then((seated) => dispatchSeat({ type: seated ? 'seated' : 'noSeat' }))
      .catch((error: unknown) => {
        console.error('[FlashcardAssignmentPage] Seat failed:', error);
        dispatchSeat({ type: 'seatFailed' });
      });
  }, [readyToSeat, rawSession, classIds, takeSeat]);
  // Once the player has shown, a later close pauses it in place rather than swapping screens.
  if (shouldEnter(seat, canEnter, contentPending)) {
    dispatchSeat({ type: 'entered' });
  }

  useEffect(() => {
    syncServerTime(pseudonymUid);
  }, [pseudonymUid]);

  useEffect(() => {
    if (!assignmentId) return undefined;
    return onSnapshot(
      doc(db, 'flashcard_sessions', assignmentId),
      (snapshot) => {
        const data: unknown = snapshot.data();
        setSessionState(
          snapshot.exists() && isSession(data)
            ? { kind: 'ready', value: { ...data, id: snapshot.id } }
            : { kind: 'unavailable' }
        );
      },
      (error) => {
        console.error('[FlashcardAssignmentPage] Session read failed:', error);
        setSessionState({ kind: 'unavailable' });
      }
    );
  }, [assignmentId]);

  const sessionReady = sessionState.kind === 'ready';
  useEffect(() => {
    if (!assignmentId || !pseudonymUid || !sessionReady) return undefined;
    let first = true;
    return onSnapshot(
      doc(
        db,
        'flashcard_sessions',
        assignmentId,
        PROGRESS_SUBCOLLECTION,
        pseudonymUid
      ),
      (snapshot) => {
        dispatchListen({
          type: 'snapshot',
          value: snapshot.exists()
            ? (snapshot.data() as FlashcardProgress)
            : null,
          first,
        });
        first = false;
      },
      (error) => {
        console.error('[FlashcardAssignmentPage] Progress read failed:', error);
        dispatchListen({ type: 'error' });
      }
    );
  }, [assignmentId, pseudonymUid, sessionReady]);

  const title =
    sessionState.kind === 'ready' ? sessionState.value.title : undefined;
  useEffect(() => {
    if (title) {
      document.title = t('flashcards.assignment.pageTitle', { title });
    }
  }, [t, title]);

  const now = getServerNow();
  const view = deriveFlashcardStudentView({
    session: sessionState,
    progress: listen.progress,
    pointer,
    studentUid: pseudonymUid,
    content,
    now,
    perPeriod,
    seat,
    canEnter,
  });

  // Re-render at the next open or close so the screen changes on time.
  const boundary =
    'session' in view
      ? nextWindowBoundary(view.session, view.effectiveWindow, now)
      : null;
  const [boundaryTick, setBoundaryTick] = useState(0);
  useEffect(() => {
    if (boundary === null) return undefined;
    const delay = Math.min(
      Math.max(boundary - getServerNow(), 0) + 50,
      MAX_TIMEOUT_MS
    );
    const timer = window.setTimeout(
      () => setBoundaryTick((tick) => tick + 1),
      delay
    );
    return () => window.clearTimeout(timer);
  }, [boundary, boundaryTick]);

  if (view.kind === 'unavailable' || !pseudonymUid) {
    return (
      <div className="h-screen h-dvh">
        <PageMessage
          icon={AlertTriangle}
          title={t('flashcards.assignment.unavailableTitle')}
          body={t('flashcards.assignment.unavailableBody')}
        />
      </div>
    );
  }

  if (view.kind === 'loading') {
    return (
      <div className="flex h-screen h-dvh items-center justify-center bg-slate-100 text-slate-700">
        <Loader2
          aria-hidden="true"
          className="mr-2 h-5 w-5 animate-spin text-rose-600"
        />
        <span className="font-bold">{t('flashcards.assignment.loading')}</span>
      </div>
    );
  }

  if (view.kind === 'excluded') return <AssignmentExcludedNotice />;

  const { session, progress } = view;
  const isCheck = session.kind === 'check';

  let body: React.ReactNode;
  let banner: string | null = null;
  switch (view.kind) {
    case 'upcoming':
      body = (
        <PageMessage
          icon={CalendarClock}
          title={t('flashcards.assignment.opensTitle')}
          body={t('flashcards.assignment.opensBody', {
            date: new Date(view.openAt).toLocaleString(),
          })}
        />
      );
      break;
    case 'submitted':
      body = (
        <FlashcardCheckResults session={session} progress={view.progress} />
      );
      break;
    case 'checkClosed':
      body = (
        <PageMessage
          icon={Lock}
          title={t('flashcards.assignment.checkClosedTitle')}
          body={t('flashcards.assignment.checkClosedBody')}
        />
      );
      break;
    case 'closed':
      banner =
        view.closeAt === null
          ? t('flashcards.assignment.endedBanner')
          : t('flashcards.assignment.closedBanner', {
              date: new Date(view.closeAt).toLocaleString(),
            });
      body = (
        <UntrackedPlayer
          session={session}
          progress={progress}
          studentUid={pseudonymUid}
        />
      );
      break;
    case 'seating':
      body =
        view.step === 'waiting' ? (
          <div className="flex h-full items-center justify-center text-slate-700">
            <Loader2
              aria-hidden="true"
              className="mr-2 h-5 w-5 animate-spin text-rose-600"
            />
            <span className="font-bold">
              {t('flashcards.assignment.loading')}
            </span>
          </div>
        ) : (
          <PageMessage
            icon={AlertTriangle}
            title={t('flashcards.assignment.unavailableTitle')}
            body={t(
              view.step === 'noSeat'
                ? 'flashcards.assignment.notInPeriod'
                : 'flashcards.assignment.seatError'
            )}
          />
        );
      break;
    case 'periodLocked': {
      const opensAt = nextScheduledOpen(session, periodKeys, periodNow);
      body = (
        <PageMessage
          icon={Lock}
          title={t('flashcards.assignment.opensTitle')}
          body={
            opensAt != null
              ? t('flashcards.assignment.opensBody', {
                  date: new Date(opensAt).toLocaleString(),
                })
              : t('flashcards.assignment.periodClosedBody')
          }
        />
      );
      break;
    }
    case 'tracked':
      body = (
        <TrackedPlayer
          key={session.id}
          session={session}
          progress={progress}
          studentUid={pseudonymUid}
          classId={
            periodKeys[0] ?? resolveClassId(session, pointer ?? null, classIds)
          }
          paused={view.paused}
          resetCount={listen.resetCount}
          staff={staff}
        />
      );
      break;
  }

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-xs sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <a
            href="/my-assignments"
            aria-label={t('flashcards.assignment.back')}
            className="rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </a>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Layers3 aria-hidden="true" className="h-5 w-5" />
          </span>
          <h1 className="min-w-0 truncate text-lg font-black text-slate-900 sm:text-xl">
            {session.title}
          </h1>
          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {t(
              isCheck
                ? 'flashcards.assignment.check'
                : 'flashcards.assignment.study'
            )}
          </span>
        </div>
      </header>
      {banner && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-bold text-amber-900"
        >
          <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
          {banner}
        </div>
      )}
      <main className="min-h-0 flex-1">{body}</main>
    </div>
  );
};

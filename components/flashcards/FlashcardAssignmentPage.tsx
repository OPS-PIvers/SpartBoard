import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Info,
  Layers3,
  Loader2,
  Lock,
} from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { db, functions } from '@/config/firebase';
import { useStudentAuth } from '@/context/useStudentAuth';
import { useStudentAssignmentPointer } from '@/hooks/useStudentAssignmentPointer';
import type {
  FlashcardProgress,
  FlashcardSession,
  StudentAssignmentPointer,
} from '@/types';
import {
  getWindowState,
  resolveEffectiveWindow,
} from '@/utils/assignmentWindow';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { AssignmentExcludedNotice } from '@/components/student/AssignmentExcludedNotice';
import {
  LocalFlashcardAdapter,
  TrackedFlashcardAdapter,
  sanitizeFlashcardStudyState,
} from './adapters';
import { FlashcardCheckResults } from './FlashcardCheckResults';
import {
  FlashcardPlayer,
  type FlashcardCheckSubmission,
} from './FlashcardPlayer';

const PROGRESS_SUBCOLLECTION = 'progress';

type Loadable<T> =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; value: T };

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

const TrackedPlayer: React.FC<{
  session: FlashcardSession;
  progress: FlashcardProgress | null;
  studentUid: string;
  classId: string;
}> = ({ session, progress, studentUid, classId }) => {
  const { t } = useTranslation();
  const [adapter] = useState(
    () =>
      new TrackedFlashcardAdapter({
        classId,
        initial: progress,
        write: (payload) =>
          setDoc(
            doc(
              db,
              'flashcard_sessions',
              session.id,
              PROGRESS_SUBCOLLECTION,
              studentUid
            ),
            payload,
            { merge: true }
          ),
      })
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCheck = session.kind === 'check' && Boolean(session.checkMode);

  const submit = async (submission: FlashcardCheckSubmission) => {
    setSubmitting(true);
    setError(null);
    try {
      await adapter.flush();
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
      setError(t('flashcards.assignment.submitError'));
      setSubmitting(false);
    }
  };

  return (
    <FlashcardPlayer
      cards={session.cards}
      termLanguage={session.termLanguage}
      definitionLanguage={session.definitionLanguage}
      adapter={adapter}
      seed={`${session.id}:${studentUid}`}
      lockedSettings={isCheck ? session.lockedSettings : undefined}
      check={
        isCheck && session.checkMode
          ? {
              mode: session.checkMode,
              masteryThreshold: session.masteryThreshold,
              initialCheckLog: progress?.checkLog,
              submitting,
              error,
              onCheckWrite: (cardId, entry) =>
                adapter.recordCheckWrite(cardId, entry),
              onSubmit: (submission) => void submit(submission),
            }
          : undefined
      }
    />
  );
};

const UntrackedPlayer: React.FC<{
  session: FlashcardSession;
  progress: FlashcardProgress | null;
  studentUid: string;
}> = ({ session, progress, studentUid }) => {
  const [adapter] = useState(
    () =>
      new LocalFlashcardAdapter(
        `assignment.${session.id}.${studentUid}`,
        progress ? sanitizeFlashcardStudyState(progress) : undefined
      )
  );
  return (
    <FlashcardPlayer
      cards={session.cards}
      termLanguage={session.termLanguage}
      definitionLanguage={session.definitionLanguage}
      adapter={adapter}
      seed={`${session.id}:${studentUid}`}
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

export const FlashcardAssignmentPage: React.FC = () => {
  const { t } = useTranslation();
  const { pseudonymUid, classIds } = useStudentAuth();
  const [assignmentId] = useState(getAssignmentId);
  const [sessionState, setSessionState] = useState<Loadable<FlashcardSession>>(
    assignmentId ? { kind: 'loading' } : { kind: 'unavailable' }
  );
  const [progressState, setProgressState] = useState<
    Loadable<FlashcardProgress | null>
  >({ kind: 'loading' });
  const pointer = useStudentAssignmentPointer(pseudonymUid, assignmentId);

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
    return onSnapshot(
      doc(
        db,
        'flashcard_sessions',
        assignmentId,
        PROGRESS_SUBCOLLECTION,
        pseudonymUid
      ),
      (snapshot) => {
        setProgressState({
          kind: 'ready',
          value: snapshot.exists()
            ? (snapshot.data() as FlashcardProgress)
            : null,
        });
      },
      (error) => {
        console.error('[FlashcardAssignmentPage] Progress read failed:', error);
        setProgressState({ kind: 'ready', value: null });
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

  if (sessionState.kind === 'unavailable' || !pseudonymUid) {
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

  if (
    sessionState.kind === 'loading' ||
    progressState.kind !== 'ready' ||
    pointer === undefined
  ) {
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

  if (pointer?.excluded) return <AssignmentExcludedNotice />;

  const session = sessionState.value;
  const progress = progressState.value;
  const effectiveWindow = resolveEffectiveWindow(session, pointer);
  const windowState =
    session.status === 'ended'
      ? 'closed'
      : getWindowState(effectiveWindow, getServerNow());
  const isCheck = session.kind === 'check';

  let body: React.ReactNode;
  let banner: string | null = null;
  if (windowState === 'upcoming' && effectiveWindow.openAt !== undefined) {
    body = (
      <PageMessage
        icon={CalendarClock}
        title={t('flashcards.assignment.opensTitle')}
        body={t('flashcards.assignment.opensBody', {
          date: new Date(effectiveWindow.openAt).toLocaleString(),
        })}
      />
    );
  } else if (isCheck && typeof progress?.submittedAt === 'number') {
    body = <FlashcardCheckResults session={session} progress={progress} />;
  } else if (isCheck && windowState === 'closed') {
    body = (
      <PageMessage
        icon={Lock}
        title={t('flashcards.assignment.checkClosedTitle')}
        body={t('flashcards.assignment.checkClosedBody')}
      />
    );
  } else if (windowState === 'closed') {
    banner =
      session.status === 'ended' || effectiveWindow.closeAt === undefined
        ? t('flashcards.assignment.endedBanner')
        : t('flashcards.assignment.closedBanner', {
            date: new Date(effectiveWindow.closeAt).toLocaleString(),
          });
    body = (
      <UntrackedPlayer
        session={session}
        progress={progress}
        studentUid={pseudonymUid}
      />
    );
  } else {
    body = (
      <TrackedPlayer
        key={session.id}
        session={session}
        progress={progress}
        studentUid={pseudonymUid}
        classId={resolveClassId(session, pointer, classIds)}
      />
    );
  }

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <a
            href="/my-assignments"
            aria-label={t('flashcards.assignment.back')}
            className="rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
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

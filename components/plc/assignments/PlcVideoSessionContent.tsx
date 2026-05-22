/**
 * PlcVideoSessionContent — the video-activity half of the PLC assignment
 * session modal. Mirrors `PlcQuizSessionContent` the way that file mirrors
 * the QuizWidget's wiring: it owns its own data hooks and renders the
 * existing `VideoActivityLiveMonitor` / `Results` presentational components
 * inside the shared light-theme shell.
 *
 * Wiring (authoritative source: `VideoActivityWidget.tsx`):
 *   - `useVideoActivitySessionTeacher()` — `subscribeToSession(assignmentId)`
 *     arms the responses + session-doc listeners; `liveSession` reflects
 *     pause/resume state in real time; `unlockStudentAttempt` unlocks a
 *     student's auto-submitted attempt.
 *   - `useVideoActivityAssignments(user?.uid)` — finds the assignment doc and
 *     supplies the assignment-level pause / resume / deactivate (= "End")
 *     callbacks the monitor's controls map to.
 *
 * Unlike the quiz path there is no per-question advance, no remove-student,
 * no reveal/hide answer, and no in-results export — the VA monitor/results
 * components don't expose those affordances, so they're simply absent here.
 *
 * `Results` reads `session.questions` to compute scores, so we fetch the full
 * session document up-front (mirroring `VideoActivityWidget`'s `onArchive*`
 * handlers) rather than relying on the responses listener alone. The
 * monotonic attempt token guards against a stale fetch resolving after the
 * modal has moved on.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { VideoActivitySession } from '@/types';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useVideoActivitySessionTeacher } from '@/hooks/useVideoActivitySession';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { logError } from '@/utils/logError';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';
import { Results } from '@/components/widgets/VideoActivityWidget/components/Results';

const SESSIONS_COLLECTION = 'video_activity_sessions';

interface PlcVideoSessionContentProps {
  /** Assignment UUID — also the live video-activity-session doc id. */
  assignmentId: string;
  view: 'monitor' | 'results';
  onClose: () => void;
}

export const PlcVideoSessionContent: React.FC<PlcVideoSessionContentProps> = ({
  assignmentId,
  view,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const {
    assignments,
    loading: assignmentsLoading,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
  } = useVideoActivityAssignments(user?.uid);
  const {
    responses,
    liveSession,
    subscribeToSession,
    unsubscribeFromSession,
    unlockStudentAttempt,
  } = useVideoActivitySessionTeacher();

  const assignment = useMemo(
    () => assignments.find((a) => a.id === assignmentId) ?? null,
    [assignments, assignmentId]
  );

  // Full session document — `Results` reads `session.questions` to grade, so
  // the responses-only listener isn't enough on its own. Fetched once per
  // assignmentId; the live status is layered on from `liveSession` below.
  const [session, setSession] = useState<VideoActivitySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const fetchAttemptRef = useRef(0);

  // Reset transient fetch state during render when the target row changes —
  // the "adjusting state while rendering" pattern, so we don't call setState
  // synchronously inside the fetch effect (which cascades renders).
  const [prevAssignmentId, setPrevAssignmentId] = useState(assignmentId);
  if (assignmentId !== prevAssignmentId) {
    setPrevAssignmentId(assignmentId);
    setSession(null);
    setLoadError(null);
    setSessionMissing(false);
  }

  // Fetch the session doc + arm the live listeners. Tied to `assignmentId`
  // so re-opening for a different row re-fetches and re-subscribes.
  useEffect(() => {
    const myAttempt = ++fetchAttemptRef.current;

    void getDoc(doc(db, SESSIONS_COLLECTION, assignmentId))
      .then((snap) => {
        if (myAttempt !== fetchAttemptRef.current) return;
        if (!snap.exists()) {
          setSessionMissing(true);
          return;
        }
        setSession(snap.data() as VideoActivitySession);
      })
      .catch((err) => {
        if (myAttempt !== fetchAttemptRef.current) return;
        logError('PlcVideoSessionContent.loadSession', err, { assignmentId });
        setLoadError(
          t('plcDashboard.assignmentSession.videoLoadFailed', {
            defaultValue: 'Could not load this video activity session.',
          })
        );
      });

    subscribeToSession(assignmentId);
    return () => {
      unsubscribeFromSession();
    };
  }, [assignmentId, subscribeToSession, unsubscribeFromSession, t]);

  // Prefer the live snapshot when it's caught up to the assignment we opened
  // for; otherwise fall back to the initial fetch so the view never flashes
  // empty between subscribe and the first snapshot. Mirrors the
  // `sessionForMonitor` selection in VideoActivityWidget.
  const sessionForView =
    liveSession && liveSession.id === assignmentId ? liveSession : session;

  const handleEnd = useCallback(async () => {
    try {
      await deactivateAssignment(assignmentId);
      addToast(
        t('plcDashboard.assignmentSession.videoEnded', {
          defaultValue: 'Assignment ended.',
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.assignmentSession.videoEndFailed', {
              defaultValue: 'Failed to end assignment.',
            }),
        'error'
      );
      return;
    }
    onClose();
  }, [deactivateAssignment, assignmentId, addToast, t, onClose]);

  const handlePause = useCallback(async () => {
    try {
      await pauseAssignment(assignmentId);
      addToast(
        t('plcDashboard.assignmentSession.paused', {
          defaultValue: 'Assignment paused.',
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.assignmentSession.videoPauseFailed', {
              defaultValue: 'Failed to pause assignment.',
            }),
        'error'
      );
    }
  }, [pauseAssignment, assignmentId, addToast, t]);

  const handleResume = useCallback(async () => {
    try {
      await resumeAssignment(assignmentId);
      addToast(
        t('plcDashboard.assignmentSession.resumed', {
          defaultValue: 'Assignment resumed.',
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.assignmentSession.videoResumeFailed', {
              defaultValue: 'Failed to resume assignment.',
            }),
        'error'
      );
    }
  }, [resumeAssignment, assignmentId, addToast, t]);

  const notFound = !assignmentsLoading && !assignment && sessionMissing;

  if (notFound) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3 px-6 text-slate-600">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="font-bold text-brand-blue-dark">
          {t('plcDashboard.assignmentSession.notFoundTitle', {
            defaultValue: 'Assignment unavailable',
          })}
        </p>
        <p className="text-sm text-slate-500 max-w-md">
          {t('plcDashboard.assignmentSession.notFoundBody', {
            defaultValue:
              'This assignment is no longer in your archive — it may have been deleted.',
          })}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3 px-6 text-slate-600">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="font-bold text-brand-blue-dark">{loadError}</p>
      </div>
    );
  }

  if (!sessionForView) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">
          {t('plcDashboard.assignmentSession.loading', {
            defaultValue: 'Loading…',
          })}
        </span>
      </div>
    );
  }

  if (view === 'monitor') {
    return (
      <VideoActivityLiveMonitor
        session={sessionForView}
        responses={responses}
        onEnd={handleEnd}
        onPause={handlePause}
        onResume={handleResume}
        onUnlockStudent={unlockStudentAttempt}
        onBack={onClose}
      />
    );
  }

  return (
    <Results
      session={sessionForView}
      responses={responses}
      plc={assignment?.plc}
      onBack={onClose}
    />
  );
};

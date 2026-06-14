/**
 * VideoActivityLiveMonitor — teacher view during a live video-activity assignment.
 *
 * Shows in real time who has joined, which question each student is on, and
 * whether their submitted answers were correct. Mirrors the QuizLiveMonitor
 * UX shape (header strip, KPI tiles, scrollable roster) but tailored to the
 * Video Activity data model: there is no per-question advance, no auto-mode,
 * and answers are timestamp-pegged to the underlying video. Pause / Resume /
 * End controls map to the assignment-level pause/resume/deactivate hooks.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  Pause,
  Play,
  Square,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react';
import {
  VideoActivityResponse,
  VideoActivitySession,
  VideoActivityQuestion,
} from '@/types';
import { useDialog } from '@/context/useDialog';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  useAssignmentPseudonymsMulti,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  SessionViewHeader,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
} from '@/components/common/sessionViews';
import { logError } from '@/utils/logError';

interface VideoActivityLiveMonitorProps {
  session: VideoActivitySession;
  responses: VideoActivityResponse[];
  /**
   * "End assignment" — kills the student URL but preserves all responses.
   * Wired to `deactivateAssignment(assignmentId)`.
   */
  onEnd: () => Promise<void>;
  /** Pause this assignment — students see a paused screen. */
  onPause?: () => Promise<void>;
  /** Resume a paused assignment. */
  onResume?: () => Promise<void>;
  /**
   * Unlock a student's locked/auto-submitted attempt so they can resume.
   * Pass the response's `_responseKey`, not `studentUid`.
   */
  onUnlockStudent?: (sessionId: string, responseKey: string) => Promise<void>;
  /** Navigate back to the manager (In Progress tab) without ending. */
  onBack?: () => void;
}

/* ─── Per-row sub-component ──────────────────────────────────────────────── */

interface StudentRowProps {
  response: VideoActivityResponse;
  questions: VideoActivityQuestion[];
  /**
   * Roster name lookup keyed by `response.studentUid`. Used to label SSO
   * `studentRole` joiners (who carry no `pin` or `name` field) with their
   * real ClassLink name. Empty map = legacy / non-SSO sessions; rows fall
   * back through `response.name` and finally `response.pin`.
   */
  byStudentUid: Map<string, { givenName: string; familyName: string }>;
  /** When true, show the per-row tab-switch warning count badge. */
  showTabWarnings: boolean;
  /** Session attempt cap; null/undefined = unlimited. Drives the lock UI. */
  attemptLimit: number | null | undefined;
  /**
   * Invoked when the teacher taps the lock chip. Receives the resolved
   * display name so the confirmation dialog can name the student.
   */
  onUnlock?: (displayName: string) => void;
}

/**
 * Pick the first non-empty display label from
 *   1. The roster name resolved via `byStudentUid` (SSO students)
 *   2. The self-typed `response.name` (legacy pre-PR1 anon rows)
 *   3. The PIN itself (PR1+ anon rows)
 *
 * Returns `undefined` if all three are empty/missing — caller renders an
 * em-dash so the UI never goes blank.
 */
function pickDisplayLabel(
  response: VideoActivityResponse,
  byStudentUid: Map<string, { givenName: string; familyName: string }>
): string | undefined {
  const candidates = [
    formatStudentName(byStudentUid.get(response.studentUid)),
    response.name,
    response.pin,
  ];
  return candidates.find((s) => typeof s === 'string' && s.length > 0);
}

const StudentRow: React.FC<StudentRowProps> = ({
  response,
  questions,
  byStudentUid,
  showTabWarnings,
  attemptLimit,
  onUnlock,
}) => {
  const warnings = response.tabSwitchWarnings ?? 0;
  const displayName = pickDisplayLabel(response, byStudentUid) ?? '—';
  const correctAnswerById = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions) m.set(q.id, q.correctAnswer);
    return m;
  }, [questions]);

  // Last submission timestamp (helps the teacher spot stalled students).
  const latestAnsweredAt = response.answers.reduce<number | null>(
    (acc, a) => (acc === null || a.answeredAt > acc ? a.answeredAt : acc),
    null
  );

  // Per-question answer index for fast lookup when rendering the strip.
  const answerByQid = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of response.answers) m.set(a.questionId, a.answer);
    return m;
  }, [response.answers]);

  let correctCount = 0;
  for (const q of questions) {
    const submitted = answerByQid.get(q.id);
    if (submitted !== undefined && submitted === correctAnswerById.get(q.id)) {
      correctCount++;
    }
  }
  const answeredCount = response.answers.length;
  const completed = response.completedAt !== null;
  // Returns null when there's nothing to grade against — e.g. a fallback
  // session doc with no questions — so the row renders an em-dash instead
  // of a misleading red 0%.
  const score =
    questions.length > 0
      ? Math.round((correctCount / questions.length) * 100)
      : null;

  const formatTime = (ts: number | null): string => {
    if (ts === null) return '—';
    return new Date(ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Resolve the lock/resume badge state once so the row content stays flat.
  let lockBadge: React.ReactNode = null;
  if (onUnlock) {
    const isAutoSubmittedByWarnings =
      completed && warnings >= 3 && !response.unlocked;
    const completedCount = response.completedAttempts ?? 0;
    const hitAttemptCap =
      typeof attemptLimit === 'number' &&
      attemptLimit > 0 &&
      completedCount >= attemptLimit &&
      !response.unlocked;
    const isLocked = isAutoSubmittedByWarnings || hitAttemptCap;
    if (isLocked) {
      lockBadge = (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnlock(displayName);
          }}
          className="inline-flex shrink-0 rounded-full transition-opacity hover:opacity-80"
          title={
            isAutoSubmittedByWarnings
              ? 'Auto-submitted from tab-switch warnings — click to allow resume'
              : 'Attempt limit reached — click to allow resume'
          }
          aria-label={`Unlock ${displayName}'s attempt`}
        >
          <SessionBadge tone="warn" label="Locked" icon={Lock} />
        </button>
      );
    } else if (response.unlocked && !completed) {
      lockBadge = (
        <span
          title="Unlocked — one more tab-switch will finalize the attempt"
          className="inline-flex shrink-0"
        >
          <SessionBadge tone="success" label="Resumed" icon={Unlock} />
        </span>
      );
    }
  }

  const trailing = (
    <div
      className="flex items-center flex-wrap justify-end"
      style={{ gap: 'min(4px, 1cqmin)', maxWidth: 'min(220px, 50cqmin)' }}
    >
      {questions.map((q) => {
        const submitted = answerByQid.get(q.id);
        if (submitted === undefined) {
          return (
            <Circle
              key={q.id}
              className="text-slate-300"
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          );
        }
        const isCorrect = submitted === correctAnswerById.get(q.id);
        return isCorrect ? (
          <CheckCircle2
            key={q.id}
            className="text-emerald-500"
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        ) : (
          <XCircle
            key={q.id}
            className="text-red-500"
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        );
      })}
      {score === null ? (
        <span
          className="font-black tabular-nums shrink-0 text-slate-400"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          —
        </span>
      ) : (
        <ScorePill score={score} display="percent" />
      )}
    </div>
  );

  return (
    <SessionRow
      dot={{ tone: completed ? 'success' : 'warn' }}
      trailing={trailing}
    >
      <div className="flex items-center" style={{ gap: 'min(6px, 1.5cqmin)' }}>
        <p
          className="font-bold text-slate-800 truncate"
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          {displayName}
        </p>
        {response.classPeriod && (
          <SessionBadge tone="info" label={response.classPeriod} />
        )}
        {completed ? (
          <SessionBadge tone="success" label="Done" />
        ) : (
          <SessionBadge tone="warn" label="In progress" />
        )}
        {showTabWarnings && warnings > 0 && (
          <span title={`${warnings} Tab Switch Warning(s)`}>
            <SessionBadge
              tone="danger"
              label={String(warnings)}
              icon={AlertTriangle}
            />
          </span>
        )}
        {lockBadge}
      </div>
      <p
        className="text-slate-400"
        style={{
          fontSize: 'min(10px, 3cqmin)',
          marginTop: 'min(2px, 0.5cqmin)',
        }}
      >
        {response.pin ? `PIN ${response.pin} · ` : null}
        {answeredCount}/{questions.length} answered · last{' '}
        {formatTime(latestAnsweredAt)}
      </p>
    </SessionRow>
  );
};

/* ─── Main component ────────────────────────────────────────────────────── */

export const VideoActivityLiveMonitor: React.FC<
  VideoActivityLiveMonitorProps
> = ({
  session,
  responses,
  onEnd,
  onPause,
  onResume,
  onUnlockStudent,
  onBack,
}) => {
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  const { orgId } = useAuth();
  // Toggle for showing per-row tab-switch warning counts. Off by default
  // so projector-friendly mode keeps the roster uncluttered; the teacher
  // flips it on when triaging a locked student. Mirrors the Quiz pattern.
  const [showTabWarnings, setShowTabWarnings] = useState(false);

  const handleUnlock = useCallback(
    async (responseKey: string, displayName: string) => {
      if (!onUnlockStudent) return;
      const ok = await showConfirm(
        `Reopen ${displayName}'s attempt so they can resume? Their previous answers will be kept. The next time they leave the activity tab, their work will be submitted automatically.`,
        {
          title: 'Unlock attempt?',
          variant: 'warning',
          confirmLabel: 'Unlock',
          cancelLabel: 'Cancel',
        }
      );
      if (!ok) return;
      try {
        await onUnlockStudent(session.id, responseKey);
        addToast(
          `${displayName}'s attempt is unlocked — they can resume now.`,
          'success'
        );
      } catch (err) {
        logError('VideoActivityLiveMonitor.unlockStudent', err);
        addToast(
          `Could not unlock ${displayName}'s attempt — try again or check your connection.`,
          'error'
        );
      }
    },
    [onUnlockStudent, session.id, showConfirm, addToast]
  );
  // SSO `studentRole` responses carry no PIN or self-typed name; resolve
  // their roster identities here so the monitor row labels stay populated.
  // Use the multi-class variant — `session.classId` is a transitional
  // mirror of `classIds[0]` only, so the single-class hook would miss
  // SSO students from `classIds[1+]` entirely on multi-class assignments.
  // Mirrors the QuizLiveMonitor pattern.
  const sessionClassIds = useMemo(() => {
    if (session.classIds && session.classIds.length > 0)
      return session.classIds;
    return session.classId ? [session.classId] : [];
  }, [session.classIds, session.classId]);
  const { byStudentUid: classLinkNames } = useAssignmentPseudonymsMulti(
    session.id,
    sessionClassIds,
    orgId
  );
  // Schoology LTI students aren't in any ClassLink roster, so resolve their
  // names on-read via NRPS and merge in. ClassLink (the district's
  // authoritative roster) wins on the rare uid collision. Gated on `ltiNrps`
  // so non-LTI sessions never make the call. `kind: 'va'` namespaces the
  // resolver/cache away from the quiz path. Mirrors QuizLiveMonitor.
  const ltiNames = useLtiSessionNames(
    session.id,
    session.ltiNrps === true,
    'va'
  );
  const byStudentUid = useMemo(() => {
    if (ltiNames.size === 0) return classLinkNames;
    const merged = new Map(classLinkNames);
    for (const [uid, name] of ltiNames) {
      if (!merged.has(uid)) merged.set(uid, name);
    }
    return merged;
  }, [classLinkNames, ltiNames]);
  const questions = session.questions;
  const [ending, setEnding] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Derive aggregate counts in a single O(N) pass — mirrors the pattern in
  // Results.tsx so the two views compute "completed" the same way.
  const { completed, inProgress, totalAnswers } = useMemo(() => {
    let _completed = 0;
    let _inProgress = 0;
    let _totalAnswers = 0;
    for (const r of responses) {
      _totalAnswers += r.answers.length;
      if (r.completedAt !== null) _completed++;
      else _inProgress++;
    }
    return {
      completed: _completed,
      inProgress: _inProgress,
      totalAnswers: _totalAnswers,
    };
  }, [responses]);

  const handleEnd = useCallback(async () => {
    const ok = await showConfirm(
      'End this assignment? The student URL will stop working. Responses are preserved and will still be viewable from the Archive.',
      {
        title: 'End Assignment',
        variant: 'warning',
        confirmLabel: 'End',
      }
    );
    if (!ok) return;
    setEnding(true);
    try {
      await onEnd();
    } finally {
      setEnding(false);
    }
  }, [showConfirm, onEnd]);

  const handleTogglePause = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    try {
      // VA assignment pause maps to session 'ended', so the live indicator
      // for "paused" reads the assignment status; we drive the toggle
      // entirely off the parent's onPause/onResume handlers.
      const isPaused = session.status === 'ended';
      if (isPaused) {
        if (onResume) await onResume();
      } else if (onPause) {
        await onPause();
      }
    } finally {
      setToggling(false);
    }
  }, [toggling, session.status, onPause, onResume]);

  // VA sessions are binary (active | ended). When the assignment is paused
  // the parent toggles the session to 'ended', so we treat status==='ended'
  // here as "paused-or-ended" and rely on the parent's pause/resume wiring
  // to distinguish them. The toggle button is only rendered when the parent
  // supplies pause/resume callbacks.
  const isLive = session.status === 'active';
  const sortedResponses = useMemo(() => {
    return responses.slice().sort((a, b) => {
      // Joined-most-recently first within each status bucket; completed
      // students sink to the bottom so the teacher can focus on stragglers.
      if ((a.completedAt === null) !== (b.completedAt === null)) {
        return a.completedAt === null ? -1 : 1;
      }
      return b.joinedAt - a.joinedAt;
    });
  }, [responses]);

  return (
    <div className="flex flex-col h-full font-sans bg-slate-50">
      {/* ─── Header strip ───────────────────────────────────────────────── */}
      <SessionViewHeader
        onBack={onBack ?? (() => undefined)}
        status={isLive ? 'live' : 'paused'}
        title={session.assignmentName}
        subtitle={`${session.activityTitle} · ${questions.length} question${
          questions.length === 1 ? '' : 's'
        }`}
        actions={
          <>
            {(onPause ?? onResume) && (
              <ActionButton
                variant="secondary"
                label={isLive ? 'Pause' : 'Resume'}
                icon={isLive ? Pause : Play}
                onClick={() => void handleTogglePause()}
                disabled={toggling}
                loading={toggling}
              />
            )}
            <ActionButton
              variant="danger"
              label="End"
              icon={Square}
              onClick={() => void handleEnd()}
              disabled={ending}
              loading={ending}
            />
          </>
        }
      />

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(14px, 3.5cqmin)' }}
      >
        <div className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
          {/* KPI tiles */}
          <div className="grid grid-cols-3" style={{ gap: 'min(8px, 2cqmin)' }}>
            <StatTile
              label="Joined"
              value={responses.length}
              icon={
                <Users
                  style={{
                    width: 'min(12px, 3.5cqmin)',
                    height: 'min(12px, 3.5cqmin)',
                  }}
                />
              }
              tone="blue"
            />
            <StatTile
              label="Active"
              value={inProgress}
              icon={
                <Clock
                  style={{
                    width: 'min(12px, 3.5cqmin)',
                    height: 'min(12px, 3.5cqmin)',
                  }}
                />
              }
              tone="amber"
            />
            <StatTile
              label="Finished"
              value={completed}
              icon={
                <CheckCircle2
                  style={{
                    width: 'min(12px, 3.5cqmin)',
                    height: 'min(12px, 3.5cqmin)',
                  }}
                />
              }
              tone="green"
            />
          </div>

          {/* Roster */}
          <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
            <div className="flex items-center justify-between border-b border-brand-blue-primary/10 pb-1">
              <span
                className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                Roster · {responses.length}
              </span>
              <div
                className="flex items-center"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {session.sessionOptions?.tabWarningsEnabled !== false && (
                  <button
                    type="button"
                    onClick={() => setShowTabWarnings((v) => !v)}
                    className={`flex items-center gap-1 rounded-md font-bold transition-colors ${
                      showTabWarnings
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    style={{
                      fontSize: 'min(9px, 2.5cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                    }}
                    title="Show/hide tab switch warnings in roster"
                  >
                    <AlertTriangle
                      style={{
                        width: 'min(11px, 3cqmin)',
                        height: 'min(11px, 3cqmin)',
                      }}
                    />
                    Warnings
                  </button>
                )}
                <span
                  className="text-slate-400"
                  style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                >
                  {totalAnswers} total answer
                  {totalAnswers === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {responses.length === 0 ? (
              <ScaledEmptyState
                icon={Users}
                title="Waiting for students"
                subtitle="Share the assignment link from the In Progress tab."
              />
            ) : (
              <div className="flex flex-col rounded-2xl bg-white/50 border border-slate-200/60 backdrop-blur-sm overflow-hidden">
                {sortedResponses.map((r) => {
                  const rowKey = r._responseKey ?? r.studentUid;
                  return (
                    <StudentRow
                      key={rowKey}
                      response={r}
                      questions={questions}
                      byStudentUid={byStudentUid}
                      showTabWarnings={
                        showTabWarnings &&
                        session.sessionOptions?.tabWarningsEnabled !== false
                      }
                      attemptLimit={session.sessionOptions?.attemptLimit}
                      onUnlock={
                        onUnlockStudent
                          ? (displayName) =>
                              void handleUnlock(rowKey, displayName)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

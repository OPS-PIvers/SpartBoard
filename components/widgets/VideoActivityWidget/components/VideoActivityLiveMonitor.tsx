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
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pause,
  Play,
  Square,
  Users,
  XCircle,
} from 'lucide-react';
import {
  VideoActivityResponse,
  VideoActivitySession,
  VideoActivityQuestion,
} from '@/types';
import { useDialog } from '@/context/useDialog';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

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
  /** Navigate back to the manager (In Progress tab) without ending. */
  onBack?: () => void;
}

/* ─── Per-row sub-component ──────────────────────────────────────────────── */

interface StudentRowProps {
  response: VideoActivityResponse;
  questions: VideoActivityQuestion[];
}

const StudentRow: React.FC<StudentRowProps> = ({ response, questions }) => {
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

  return (
    <div
      className="flex items-center bg-white border border-slate-100 rounded-xl"
      style={{
        padding: 'min(10px, 2.5cqmin)',
        gap: 'min(10px, 2.5cqmin)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center"
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          <p
            className="font-bold text-slate-800 truncate"
            style={{ fontSize: 'min(13px, 4cqmin)' }}
          >
            {response.name || response.pin}
          </p>
          {response.classPeriod && (
            <span
              className="bg-brand-blue-lighter text-brand-blue-primary font-bold rounded-md shrink-0"
              style={{
                fontSize: 'min(9px, 2.5cqmin)',
                padding: 'min(1px, 0.2cqmin) min(5px, 1.2cqmin)',
              }}
            >
              {response.classPeriod}
            </span>
          )}
          {completed ? (
            <span
              className="bg-emerald-50 text-emerald-700 font-bold rounded-md shrink-0"
              style={{
                fontSize: 'min(9px, 2.5cqmin)',
                padding: 'min(1px, 0.2cqmin) min(5px, 1.2cqmin)',
              }}
            >
              Done
            </span>
          ) : (
            <span
              className="bg-amber-50 text-amber-700 font-bold rounded-md shrink-0"
              style={{
                fontSize: 'min(9px, 2.5cqmin)',
                padding: 'min(1px, 0.2cqmin) min(5px, 1.2cqmin)',
              }}
            >
              In progress
            </span>
          )}
        </div>
        <p
          className="text-slate-400"
          style={{
            fontSize: 'min(10px, 3cqmin)',
            marginTop: 'min(2px, 0.5cqmin)',
          }}
        >
          PIN {response.pin} · {answeredCount}/{questions.length} answered ·
          last {formatTime(latestAnsweredAt)}
        </p>
      </div>

      <div
        className="flex items-center shrink-0 flex-wrap justify-end"
        style={{ gap: 'min(4px, 1cqmin)', maxWidth: '50%' }}
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
              className="text-brand-red-primary"
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          );
        })}
        <span
          className={`font-black ml-1 ${
            score === null
              ? 'text-slate-400'
              : score >= 70
                ? 'text-emerald-600'
                : score >= 40
                  ? 'text-amber-600'
                  : 'text-brand-red-primary'
          }`}
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          {score === null ? '—' : `${score}%`}
        </span>
      </div>
    </div>
  );
};

/* ─── KPI tile ──────────────────────────────────────────────────────────── */

interface StatTileProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'amber' | 'green';
}

const StatTile: React.FC<StatTileProps> = ({ label, value, icon, color }) => {
  const colorClasses =
    color === 'blue'
      ? 'text-brand-blue-primary'
      : color === 'amber'
        ? 'text-amber-600'
        : 'text-emerald-600';
  return (
    <div
      className="bg-white border border-slate-100 rounded-xl text-center"
      style={{ padding: 'min(10px, 2.5cqmin)' }}
    >
      <div
        className={`flex items-center justify-center ${colorClasses}`}
        style={{
          gap: 'min(4px, 1cqmin)',
          marginBottom: 'min(4px, 1cqmin)',
        }}
      >
        {icon}
        <span
          className="font-bold uppercase tracking-wider"
          style={{ fontSize: 'min(10px, 3cqmin)' }}
        >
          {label}
        </span>
      </div>
      <p
        className={`font-black ${colorClasses}`}
        style={{ fontSize: 'min(22px, 7cqmin)' }}
      >
        {value}
      </p>
    </div>
  );
};

/* ─── Main component ────────────────────────────────────────────────────── */

export const VideoActivityLiveMonitor: React.FC<
  VideoActivityLiveMonitorProps
> = ({ session, responses, onEnd, onPause, onResume, onBack }) => {
  const { showConfirm } = useDialog();
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
    <div className="flex flex-col h-full font-sans bg-brand-blue-lighter/10">
      {/* ─── Header strip ───────────────────────────────────────────────── */}
      <div
        className="border-b border-brand-blue-primary/10 bg-white"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center justify-between">
          <div
            className="flex items-center min-w-0"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center justify-center rounded-lg text-brand-blue-dark/70 hover:text-brand-blue-dark hover:bg-brand-blue-lighter/30 transition-colors shrink-0"
                style={{
                  width: 'min(28px, 7cqmin)',
                  height: 'min(28px, 7cqmin)',
                }}
                title="Back to assignments"
                aria-label="Back to assignments"
              >
                <ArrowLeft
                  style={{
                    width: 'min(16px, 4cqmin)',
                    height: 'min(16px, 4cqmin)',
                  }}
                />
              </button>
            )}
            <div
              className={`rounded-full shrink-0 ${
                isLive
                  ? 'bg-brand-red-primary animate-pulse shadow-[0_0_8px_rgba(173,33,34,0.5)]'
                  : 'bg-amber-500'
              }`}
              style={{
                width: 'min(10px, 2.5cqmin)',
                height: 'min(10px, 2.5cqmin)',
              }}
            />
            <div className="flex flex-col min-w-0">
              <div
                className={`font-black leading-none uppercase tracking-tight ${
                  isLive ? 'text-brand-red-primary' : 'text-amber-600'
                }`}
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                {isLive ? 'Live' : 'Paused'}
              </div>
              <span
                className="text-brand-blue-dark font-bold truncate"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                {session.assignmentName}
              </span>
            </div>
          </div>
          <div
            className="flex items-center shrink-0"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {(onPause ?? onResume) && (
              <button
                onClick={() => void handleTogglePause()}
                disabled={toggling}
                className="flex items-center bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
                title={
                  isLive
                    ? 'Pause — students see a paused screen'
                    : 'Resume — students can rejoin'
                }
              >
                {toggling ? (
                  <Loader2
                    className="animate-spin"
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                ) : isLive ? (
                  <Pause
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                ) : (
                  <Play
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                )}
                {isLive ? 'PAUSE' : 'RESUME'}
              </button>
            )}
            <button
              onClick={() => void handleEnd()}
              disabled={ending}
              className="flex items-center bg-brand-red-primary hover:bg-brand-red-dark disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
              title="End the assignment. Responses are preserved."
            >
              {ending ? (
                <Loader2
                  className="animate-spin"
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              ) : (
                <Square
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              )}
              END
            </button>
          </div>
        </div>
        <p
          className="text-slate-500 truncate"
          style={{
            fontSize: 'min(10px, 3cqmin)',
            marginTop: 'min(4px, 1cqmin)',
          }}
        >
          {session.activityTitle} · {questions.length} question
          {questions.length === 1 ? '' : 's'}
        </p>
      </div>

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
              color="blue"
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
              color="amber"
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
              color="green"
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
              <span
                className="text-slate-400"
                style={{ fontSize: 'min(9px, 2.5cqmin)' }}
              >
                {totalAnswers} total answer{totalAnswers === 1 ? '' : 's'}
              </span>
            </div>

            {responses.length === 0 ? (
              <ScaledEmptyState
                icon={Users}
                title="Waiting for students"
                subtitle="Share the assignment link from the In Progress tab."
              />
            ) : (
              <div
                className="flex flex-col"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                {sortedResponses.map((r) => (
                  <StudentRow
                    key={r.studentUid}
                    response={r}
                    questions={questions}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

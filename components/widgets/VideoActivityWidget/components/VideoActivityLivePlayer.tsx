/**
 * VideoActivityLivePlayer: the board player and pacing controls for a
 * teacher-paced (live) session (docs/plans/VA_TEACHER_PACED.md §5.2).
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  BarChart3,
  Pause,
  Play,
  Square,
  Users,
  X,
} from 'lucide-react';
import type {
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { useVideoActivityKeyQuestions } from '@/hooks/useVideoActivityKeyQuestions';
import { useVideoActivityLiveControls } from '@/hooks/useVideoActivityLiveControls';
import { VideoPlayer } from '@/components/videoActivity/VideoPlayer';
import {
  SessionViewHeader,
  ActionButton,
  SessionBadge,
  type SessionTone,
} from '@/components/common/sessionViews';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { studentQuestionsFromSession } from '@/utils/videoActivityPublicQuestions';
import {
  computeSkippedOnSeek,
  initialVideoActivityLiveState,
  liveQuestionState,
  questionCrossed,
  whoHasntAnswered,
  type LiveQuestionState,
} from '@/utils/videoActivityLive';
import { logError } from '@/utils/logError';

/** What PR 6's aggregate view receives for the open question. */
export interface LiveAggregateContext {
  question: VideoActivityPublicQuestion;
  /** Keyed question for marking correct answers; undefined while the key loads. */
  keyQuestion: VideoActivityQuestion | undefined;
  /** Every submitted answer to the question, as stored. */
  answers: string[];
  answerRevealed: boolean;
}

interface VideoActivityLivePlayerProps {
  session: VideoActivitySession;
  responses: VideoActivityResponse[];
  /** Runs the assignment end/finalize path after the live state is closed. */
  onEnd: () => Promise<void>;
  onBack?: () => void;
  /** Replaces the default per-option counts under Show results. */
  renderAggregate?: (ctx: LiveAggregateContext) => React.ReactNode;
}

const SEEK_SETTLE_TICKS = 12;
/** Reaching a question this late (a background tab throttles polling) seeks back to it. */
const OVERSHOOT_SECONDS = 1;

const CHIP: Record<LiveQuestionState, { tone: SessionTone; label: string }> = {
  upcoming: { tone: 'neutral', label: 'Upcoming' },
  open: { tone: 'success', label: 'Open' },
  closed: { tone: 'info', label: 'Closed' },
  skipped: { tone: 'warn', label: 'Skipped' },
};

const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const correctSet = (key: VideoActivityQuestion | undefined): Set<string> =>
  new Set(
    (key?.correctAnswer ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );

const answersFor = (
  responses: VideoActivityResponse[],
  questionId: string
): string[] =>
  responses.flatMap((r) =>
    r.answers.filter((a) => a.questionId === questionId).map((a) => a.answer)
  );

export const VideoActivityLivePlayer: React.FC<
  VideoActivityLivePlayerProps
> = ({ session, responses, onEnd, onBack, renderAggregate }) => {
  const { canAccessFeature, orgId } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const controls = useVideoActivityLiveControls(session.id);
  const live = session.live ?? initialVideoActivityLiveState(0);
  const { questions: keyQuestions } = useVideoActivityKeyQuestions(session);

  const questions = useMemo(
    () =>
      [
        ...studentQuestionsFromSession({
          questions: session.questions,
          publicQuestions: session.publicQuestions,
        }),
      ].sort((a, b) => a.timestamp - b.timestamp),
    [session.questions, session.publicQuestions]
  );
  const keyById = useMemo(
    () => new Map(keyQuestions.map((q) => [q.id, q])),
    [keyQuestions]
  );

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
  const rosterStudents = useMemo(
    () =>
      rosters
        .filter((r) => session.rosterIds?.includes(r.id))
        .flatMap((r) => r.students),
    [rosters, session.rosterIds]
  );

  const [playing, setPlaying] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    nonce: number;
  } | null>(null);
  const [clock, setClock] = useState({
    current: live.playheadSeconds,
    duration: 0,
  });
  const [scrub, setScrub] = useState<number | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const playheadRef = useRef(live.playheadSeconds);
  // Just below the start so a question at 0:00 still counts as crossed.
  const prevRef = useRef(live.playheadSeconds > 0 ? live.playheadSeconds : -1);
  const pendingSeekRef = useRef<{ target: number; ticksLeft: number } | null>(
    null
  );
  const firedRef = useRef<Set<string>>(new Set());
  const startSecondsRef = useRef(live.playheadSeconds);

  const report = (context: string) => (err: unknown) => {
    logError(`VideoActivityLivePlayer.${context}`, err, {
      sessionId: session.id,
    });
    addToast('Could not update the session. Try again.', 'error');
  };

  const openId = live.questionPhase === 'open' ? live.currentQuestionId : null;
  const openQuestion = openId
    ? (questions.find((q) => q.id === openId) ?? null)
    : null;
  const joined = responses.length;
  const answeredCount = openId
    ? responses.filter((r) => r.answers.some((a) => a.questionId === openId))
        .length
    : 0;
  const className =
    [session.periodNames?.[0], session.assignmentName].find(Boolean) ??
    session.activityTitle;

  const requestSeek = (time: number) => {
    const target = Math.max(0, time);
    pendingSeekRef.current = { target, ticksLeft: SEEK_SETTLE_TICKS };
    prevRef.current = target;
    playheadRef.current = target;
    setClock((c) => ({ ...c, current: target }));
    setSeekRequest((prev) => ({ time: target, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const newlySkipped = (
    from: number,
    to: number,
    exceptId?: string
  ): string[] => {
    const pool = exceptId
      ? questions.filter((q) => q.id !== exceptId)
      : questions;
    const next = computeSkippedOnSeek(from, to, pool, live);
    return next.skippedQuestionIds.filter(
      (id) => !live.skippedQuestionIds.includes(id)
    );
  };

  const handleTick = (
    seconds: number,
    duration: number,
    isPlaying: boolean
  ) => {
    playheadRef.current = seconds;
    if (
      Math.floor(seconds) !== Math.floor(clock.current) ||
      (duration > 0 && duration !== clock.duration)
    ) {
      setClock({ current: seconds, duration });
    }
    const pending = pendingSeekRef.current;
    if (pending) {
      pending.ticksLeft -= 1;
      if (Math.abs(seconds - pending.target) < 1 || pending.ticksLeft <= 0) {
        pendingSeekRef.current = null;
        prevRef.current = seconds;
      }
      return;
    }
    const prev = prevRef.current;
    prevRef.current = seconds;
    if (!isPlaying || openId) return;
    const crossed = questionCrossed(prev, seconds, questions, {
      askedQuestionIds: [...live.askedQuestionIds, ...firedRef.current],
      skippedQuestionIds: live.skippedQuestionIds,
    });
    if (!crossed) return;
    firedRef.current.add(crossed.id);
    setPlaying(false);
    if (seconds - crossed.timestamp > OVERSHOOT_SECONDS)
      requestSeek(crossed.timestamp);
    controls
      .openQuestion(crossed.id, crossed.timestamp)
      .catch(report('openQuestion'));
  };

  const commitScrub = () => {
    if (scrub === null) return;
    const target = scrub;
    setScrub(null);
    const skipped = newlySkipped(playheadRef.current, target);
    requestSeek(target);
    if (skipped.length > 0)
      controls.skip(skipped, target).catch(report('skip'));
  };

  const jumpTo = async (q: VideoActivityPublicQuestion) => {
    const skipped = newlySkipped(playheadRef.current, q.timestamp, q.id);
    firedRef.current.add(q.id);
    setPlaying(false);
    setWhoOpen(false);
    requestSeek(q.timestamp);
    try {
      if (skipped.length > 0) await controls.skip(skipped, q.timestamp);
      await controls.openQuestion(q.id, q.timestamp);
    } catch (err) {
      report('jump')(err);
    }
  };

  const handleResume = () => {
    setWhoOpen(false);
    prevRef.current = playheadRef.current;
    setPlaying(true);
    controls.resume(playheadRef.current).catch(report('resume'));
  };

  const handleStart = () => {
    setPlaying(true);
    controls.start().catch(report('start'));
  };

  const handleEnd = async () => {
    const ok = await showConfirm(
      'End this live session? Students can no longer answer. Responses are kept in Results.',
      { title: 'End session', variant: 'warning', confirmLabel: 'End' }
    );
    if (!ok) return;
    setEnding(true);
    setPlaying(false);
    try {
      await controls.end(playheadRef.current);
      await onEnd();
    } catch (err) {
      report('end')(err);
    } finally {
      setEnding(false);
    }
  };

  const endButton = (
    <ActionButton
      variant="danger"
      label="End"
      icon={Square}
      onClick={() => void handleEnd()}
      disabled={ending}
      loading={ending}
    />
  );

  if (session.status === 'ended') {
    return (
      <div className="flex flex-col h-full font-sans bg-slate-50">
        <SessionViewHeader
          onBack={onBack}
          status="ended"
          title={className}
          subtitle={session.activityTitle}
        />
        <ScaledEmptyState icon={CheckCircle2} title="Session ended" />
      </div>
    );
  }

  if (session.status === 'waiting') {
    const joinUrl = `${window.location.origin}/activity/${encodeURIComponent(session.id)}`;
    const showJoin = canAccessFeature('anonymous-join');
    return (
      <div className="flex flex-col h-full font-sans bg-slate-50">
        <SessionViewHeader
          onBack={onBack}
          title={className}
          subtitle={session.activityTitle}
          actions={endButton}
        />
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center"
          style={{
            gap: 'min(16px, 4cqmin)',
            padding: 'min(16px, 4cqmin)',
            paddingBottom: 'min(24px, 6cqmin)',
          }}
          data-testid="va-live-lobby"
        >
          {showJoin && (
            <div
              className="flex items-center"
              style={{ gap: 'min(16px, 4cqmin)' }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`}
                alt="Join QR code"
                className="rounded-xl bg-white border border-slate-200"
                style={{
                  width: 'min(220px, 40cqmin)',
                  height: 'min(220px, 40cqmin)',
                  padding: 'min(8px, 1.5cqmin)',
                }}
              />
              <div className="flex flex-col items-start text-left min-w-0">
                <span
                  className="font-bold uppercase tracking-wider text-slate-500"
                  style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                >
                  Join at
                </span>
                <code
                  data-testid="va-live-join-url"
                  className="font-bold text-brand-blue-primary break-all"
                  style={{ fontSize: 'min(18px, 5cqmin)' }}
                >
                  {joinUrl.replace(/^https?:\/\//, '')}
                </code>
              </div>
            </div>
          )}
          <div
            className="font-black text-slate-800 leading-none"
            style={{ fontSize: 'min(64px, 18cqmin)' }}
          >
            {joined}
          </div>
          <div
            className="font-bold text-slate-600"
            style={{ fontSize: 'min(16px, 5cqmin)' }}
          >
            joined
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2"
            style={{
              gap: 'min(8px, 2cqmin)',
              fontSize: 'min(18px, 5.5cqmin)',
              padding: 'min(12px, 3cqmin) min(28px, 7cqmin)',
            }}
          >
            <Play
              aria-hidden="true"
              style={{
                width: 'min(20px, 5.5cqmin)',
                height: 'min(20px, 5.5cqmin)',
              }}
            />
            Start
          </button>
        </div>
      </div>
    );
  }

  const openKey = openQuestion ? keyById.get(openQuestion.id) : undefined;
  const revealed = live.answerRevealed;
  const correct = correctSet(openKey);
  const openAnswers = openQuestion
    ? answersFor(responses, openQuestion.id)
    : [];
  const who = openId
    ? whoHasntAnswered(openId, responses, rosterStudents, byStudentUid)
    : null;
  const statusLabel = openQuestion
    ? 'Question open'
    : playing
      ? 'Playing'
      : 'Paused';
  const sliderValue = scrub ?? clock.current;
  const duration = Math.max(clock.duration, sliderValue);

  return (
    <div className="flex flex-col h-full font-sans bg-slate-50">
      <SessionViewHeader
        onBack={onBack}
        status="live"
        title={className}
        subtitle={session.activityTitle}
        actions={endButton}
      />
      <div
        className="flex-1 min-h-0 flex"
        style={{ gap: 'min(10px, 2cqmin)', padding: 'min(10px, 2cqmin)' }}
      >
        <div
          className="flex-1 min-w-0 flex flex-col"
          style={{ gap: 'min(8px, 1.5cqmin)' }}
        >
          <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black">
            <div className="absolute inset-0">
              <VideoPlayer
                youtubeUrl={session.youtubeUrl}
                questions={questions}
                answeredQuestionIds={EMPTY_SET}
                onQuestionTrigger={NOOP}
                onVideoEnd={() => setPlaying(false)}
                questionVisible={openQuestion !== null}
                allowSkipping
                autoPlay
                paused={!playing}
                teacherMode
                onTick={handleTick}
                startSeconds={startSecondsRef.current}
                seekRequest={seekRequest}
              />
            </div>
            {openQuestion && (
              <div
                className="absolute inset-0 bg-white/95 overflow-y-auto flex flex-col"
                style={{
                  gap: 'min(12px, 2.5cqmin)',
                  padding: 'min(16px, 3.5cqmin)',
                  paddingBottom: 'min(24px, 5cqmin)',
                }}
                data-testid="va-live-question"
              >
                <div
                  className="flex items-center flex-wrap"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setWhoOpen((v) => !v)}
                      aria-expanded={whoOpen}
                      className="inline-flex items-center rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition-colors"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        fontSize: 'min(14px, 4.5cqmin)',
                        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                      }}
                      title="Who hasn't answered?"
                    >
                      <Users
                        aria-hidden="true"
                        style={{
                          width: 'min(16px, 4.5cqmin)',
                          height: 'min(16px, 4.5cqmin)',
                        }}
                      />
                      {answeredCount} of {joined} answered
                    </button>
                    {whoOpen && who && (
                      <WhoHasntAnsweredPopover
                        notAnswered={who.notAnswered}
                        notJoined={who.notJoined}
                        onClose={() => setWhoOpen(false)}
                      />
                    )}
                  </div>
                  <div className="flex-1" />
                  <ActionButton
                    variant="secondary"
                    label={live.resultsShown ? 'Hide results' : 'Show results'}
                    icon={BarChart3}
                    active={live.resultsShown}
                    onClick={() =>
                      void controls
                        .showResults(!live.resultsShown)
                        .catch(report('showResults'))
                    }
                  />
                  <ActionButton
                    variant="secondary"
                    label={revealed ? 'Hide answer' : 'Reveal answer'}
                    icon={revealed ? EyeOff : Eye}
                    active={revealed}
                    onClick={() =>
                      void controls
                        .revealAnswer(!revealed)
                        .catch(report('revealAnswer'))
                    }
                  />
                  <ActionButton
                    variant="primary"
                    label="Resume"
                    icon={Play}
                    onClick={handleResume}
                  />
                </div>
                <p
                  className="font-bold text-slate-800 leading-snug"
                  style={{ fontSize: 'min(28px, 7cqmin)' }}
                >
                  {openQuestion.text}
                </p>
                {live.resultsShown && renderAggregate ? (
                  renderAggregate({
                    question: openQuestion,
                    keyQuestion: openKey,
                    answers: openAnswers,
                    answerRevealed: revealed,
                  })
                ) : (
                  <LiveOptions
                    question={openQuestion}
                    keyQuestion={openKey}
                    correct={correct}
                    revealed={revealed}
                    answers={live.resultsShown ? openAnswers : null}
                  />
                )}
              </div>
            )}
          </div>
          <div
            className="flex items-center shrink-0"
            style={{ gap: 'min(10px, 2cqmin)' }}
          >
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={openQuestion !== null}
              aria-label={playing ? 'Pause video' : 'Play video'}
              className="inline-flex items-center justify-center rounded-full bg-brand-blue-primary hover:bg-brand-blue-dark text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{
                width: 'min(36px, 9cqmin)',
                height: 'min(36px, 9cqmin)',
              }}
            >
              {playing && !openQuestion ? (
                <Pause
                  aria-hidden="true"
                  style={{
                    width: 'min(18px, 4.5cqmin)',
                    height: 'min(18px, 4.5cqmin)',
                  }}
                />
              ) : (
                <Play
                  aria-hidden="true"
                  style={{
                    width: 'min(18px, 4.5cqmin)',
                    height: 'min(18px, 4.5cqmin)',
                  }}
                />
              )}
            </button>
            <span
              className="font-bold text-slate-600 shrink-0"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
              data-testid="va-live-status"
            >
              {statusLabel}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.ceil(duration))}
              step={1}
              value={Math.floor(sliderValue)}
              disabled={openQuestion !== null}
              aria-label="Video position"
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
              className="flex-1 min-w-0 accent-brand-blue-primary disabled:opacity-40"
            />
            <span
              className="font-mono text-slate-600 shrink-0 tabular-nums"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            >
              {formatClock(sliderValue)} / {formatClock(clock.duration)}
            </span>
          </div>
        </div>
        <aside
          className="shrink-0 flex flex-col min-h-0 rounded-xl bg-white/70 border border-slate-200"
          style={{ width: 'min(280px, 34cqw)' }}
          aria-label="Questions"
        >
          <div
            className="font-black uppercase tracking-widest text-slate-500 shrink-0"
            style={{
              fontSize: 'min(10px, 3cqmin)',
              padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
            }}
          >
            Questions · {questions.length}
          </div>
          <ol
            className="flex-1 min-h-0 overflow-y-auto flex flex-col"
            style={{
              gap: 'min(4px, 1cqmin)',
              padding: '0 min(6px, 1.5cqmin)',
              paddingBottom: 'min(12px, 3cqmin)',
            }}
          >
            {questions.map((q, i) => {
              const state = liveQuestionState(q.id, live);
              const chip = CHIP[state];
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => void jumpTo(q)}
                    disabled={state === 'open'}
                    className={`w-full text-left rounded-lg flex flex-col transition-colors ${
                      state === 'open'
                        ? 'bg-emerald-50 border border-emerald-200'
                        : 'hover:bg-slate-100 border border-transparent'
                    }`}
                    style={{
                      gap: 'min(2px, 0.5cqmin)',
                      padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
                    }}
                    title={state === 'open' ? undefined : 'Open this question'}
                  >
                    <span
                      className="flex items-center"
                      style={{ gap: 'min(6px, 1.5cqmin)' }}
                    >
                      <span
                        className="font-mono font-bold text-slate-500 tabular-nums"
                        style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                      >
                        {formatClock(q.timestamp)}
                      </span>
                      <SessionBadge tone={chip.tone} label={chip.label} />
                    </span>
                    <span
                      className="text-slate-700 line-clamp-2"
                      style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                    >
                      {i + 1}. {q.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
};

const EMPTY_SET = new Set<string>();
const NOOP = () => undefined;

/** Options on the board, the revealed answer and, when shown, simple per-option counts. */
const LiveOptions: React.FC<{
  question: VideoActivityPublicQuestion;
  keyQuestion: VideoActivityQuestion | undefined;
  correct: Set<string>;
  revealed: boolean;
  answers: string[] | null;
}> = ({ question, keyQuestion, correct, revealed, answers }) => {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of answers ?? []) {
      const parts = question.type === 'MA' ? a.split('|') : [a];
      for (const p of parts) {
        const k = p.trim();
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, [answers, question.type]);

  if (question.type === 'FIB' || !question.options) {
    return (
      <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
        {answers && (
          <p
            className="font-bold text-slate-600"
            style={{ fontSize: 'min(16px, 5cqmin)' }}
          >
            {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
          </p>
        )}
        {revealed && keyQuestion && (
          <p
            className="inline-flex items-center font-bold text-emerald-700"
            style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(20px, 6cqmin)' }}
          >
            <CheckCircle2
              aria-hidden="true"
              style={{
                width: 'min(20px, 6cqmin)',
                height: 'min(20px, 6cqmin)',
              }}
            />
            Answer: {keyQuestion.correctAnswer}
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
      {question.options.map((opt, i) => {
        const isCorrect = revealed && correct.has(opt.trim());
        return (
          <li
            key={`${i}-${opt}`}
            className={`flex items-center rounded-xl border ${
              isCorrect
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 bg-white'
            }`}
            style={{
              gap: 'min(10px, 2.5cqmin)',
              padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
            }}
          >
            <span
              className="font-black text-slate-500 shrink-0"
              style={{ fontSize: 'min(18px, 5cqmin)' }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span
              className="flex-1 min-w-0 font-semibold text-slate-800"
              style={{ fontSize: 'min(20px, 5.5cqmin)' }}
            >
              {opt}
            </span>
            {isCorrect && (
              <span
                className="inline-flex items-center font-bold text-emerald-700 shrink-0"
                style={{
                  gap: 'min(4px, 1cqmin)',
                  fontSize: 'min(14px, 4cqmin)',
                }}
              >
                <CheckCircle2
                  aria-hidden="true"
                  style={{
                    width: 'min(16px, 4.5cqmin)',
                    height: 'min(16px, 4.5cqmin)',
                  }}
                />
                Correct
              </span>
            )}
            {answers && (
              <span
                className="font-black text-slate-700 tabular-nums shrink-0"
                style={{ fontSize: 'min(20px, 5.5cqmin)' }}
                data-testid="va-live-option-count"
              >
                {counts.get(opt.trim()) ?? 0}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const WhoHasntAnsweredPopover: React.FC<{
  notAnswered: string[];
  notJoined: string[];
  onClose: () => void;
}> = ({ notAnswered, notJoined, onClose }) => (
  <div
    role="dialog"
    aria-label="Who hasn't answered"
    className="absolute left-0 top-full z-10 mt-1 rounded-xl bg-white border border-slate-200 shadow-lg flex flex-col"
    style={{
      width: 'min(260px, 60cqmin)',
      maxHeight: 'min(320px, 60cqmin)',
    }}
  >
    <div
      className="flex items-center justify-between border-b border-slate-100 shrink-0"
      style={{ padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)' }}
    >
      <span
        className="font-bold text-slate-700"
        style={{ fontSize: 'min(13px, 4cqmin)' }}
      >
        Who hasn&apos;t answered?
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-slate-500 hover:text-slate-700"
      >
        <X
          aria-hidden="true"
          style={{
            width: 'min(16px, 4.5cqmin)',
            height: 'min(16px, 4.5cqmin)',
          }}
        />
      </button>
    </div>
    <div
      className="overflow-y-auto flex flex-col"
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
        paddingBottom: 'min(14px, 3.5cqmin)',
      }}
    >
      <NameGroup title="Not answered" names={notAnswered} />
      <NameGroup title="Not joined" names={notJoined} />
    </div>
  </div>
);

const NameGroup: React.FC<{ title: string; names: string[] }> = ({
  title,
  names,
}) => (
  <div>
    <p
      className="font-bold uppercase tracking-wider text-slate-500"
      style={{ fontSize: 'min(10px, 3cqmin)' }}
    >
      {title} · {names.length}
    </p>
    {names.length === 0 ? (
      <p className="text-slate-500" style={{ fontSize: 'min(12px, 3.5cqmin)' }}>
        None
      </p>
    ) : (
      <ul>
        {names.map((n, i) => (
          <li
            key={`${i}-${n}`}
            className="text-slate-800"
            style={{ fontSize: 'min(13px, 4cqmin)' }}
          >
            {n}
          </li>
        ))}
      </ul>
    )}
  </div>
);

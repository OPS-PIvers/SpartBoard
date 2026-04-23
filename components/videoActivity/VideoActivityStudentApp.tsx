/**
 * VideoActivityStudentApp — student-facing video activity experience.
 * Accessible at /activity/:sessionId (no Google auth required).
 *
 * Flow:
 *  1. Anonymous Firebase auth (satisfies Firestore security rules)
 *  2. Student enters name + PIN to join
 *  3. Video plays with embedded questions at timestamps
 *  4. Completion / score screen when all questions answered and video ends
 */

import React, { useState, useCallback, useEffect } from 'react';
import { signInAnonymously } from 'firebase/auth';
import {
  PlayCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Trophy,
} from 'lucide-react';
import { auth } from '@/config/firebase';
import { useVideoActivitySessionStudent } from '@/hooks/useVideoActivitySession';
import { VideoActivityQuestion } from '@/types';
import { VideoPlayer } from './VideoPlayer';
import { QuestionOverlay } from './QuestionOverlay';

// ─── Root ──────────────────────────────────────────────────────────────────────

export const VideoActivityStudentApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.warn('[VideoActivityStudentApp] Anonymous auth failed:', err);
          setAuthFailed(true);
        }
      }
      setAuthReady(true);
    };
    void init();
  }, []);

  if (!authReady) {
    return <FullPageLoader message="Loading…" />;
  }

  if (authFailed) {
    return (
      <ErrorScreen message="Unable to connect. Please refresh and try again." />
    );
  }

  return <JoinAndPlay />;
};

// ─── Join + Play ───────────────────────────────────────────────────────────────

const JoinAndPlay: React.FC = () => {
  // Extract sessionId from /activity/:sessionId
  const sessionId = window.location.pathname.replace(/^\/activity\/?/, '');

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [activeQuestion, setActiveQuestion] =
    useState<VideoActivityQuestion | null>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    nonce: number;
  } | null>(null);

  const {
    session,
    myResponse,
    joinStatus,
    error,
    lookupSession,
    joinSession,
    submitAnswer,
    completeActivity,
  } = useVideoActivitySessionStudent();

  // Multi-period selection step — shown when the session has more than one
  // class-period name configured, so students pick their period before the
  // response doc is created (mirrors the Quiz pattern).
  const [periodStep, setPeriodStep] = useState<string[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  // Track answered question IDs for anti-skip enforcement in VideoPlayer
  const answeredQuestionIds = React.useMemo(
    () =>
      new Set<string>(
        (myResponse?.answers ?? []).map((answer) => answer.questionId)
      ),
    [myResponse?.answers]
  );

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim() || !sessionId) return;
    const sessionInfo = await lookupSession(sessionId);
    const periodNames = sessionInfo?.periodNames ?? [];
    if (periodNames.length > 1) {
      setPeriodStep(periodNames);
      return;
    }
    const autoClassPeriod = periodNames[0];
    await joinSession(sessionId, pin.trim(), name.trim(), autoClassPeriod);
  };

  const handlePeriodConfirm = useCallback(async () => {
    if (!selectedPeriod || !sessionId) return;
    await joinSession(sessionId, pin.trim(), name.trim(), selectedPeriod);
  }, [joinSession, sessionId, pin, name, selectedPeriod]);

  const handleQuestionTrigger = useCallback(
    (question: VideoActivityQuestion) => {
      setActiveQuestion(question);
    },
    []
  );

  const sortedQuestions = React.useMemo(
    () =>
      [...(session?.questions ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [session?.questions]
  );

  const handleAnswer = useCallback(
    async (answer: string, isCorrect: boolean) => {
      if (!activeQuestion) return;
      const requireCorrect = session?.settings?.requireCorrectAnswer ?? true;
      if (requireCorrect && !isCorrect) {
        const activeIdx = sortedQuestions.findIndex(
          (q) => q.id === activeQuestion.id
        );
        const rewindTo =
          activeIdx > 0 ? (sortedQuestions[activeIdx - 1]?.timestamp ?? 0) : 0;
        setSeekRequest({ time: rewindTo, nonce: Date.now() });
        setActiveQuestion(null);
        return;
      }

      await submitAnswer(activeQuestion.id, answer);
      setActiveQuestion(null);
    },
    [
      activeQuestion,
      session?.settings?.requireCorrectAnswer,
      sortedQuestions,
      submitAnswer,
    ]
  );

  const handleVideoEnd = useCallback(async () => {
    setVideoEnded(true);
    await completeActivity();
  }, [completeActivity]);

  // ── Invalid / missing session ID ──────────────────────────────────────────

  if (!sessionId || sessionId.includes('/')) {
    return (
      <ErrorScreen message="Invalid activity link. Please ask your teacher for the correct URL." />
    );
  }

  // ── Period selection step (multi-period sessions) ────────────────────────

  if (periodStep && joinStatus !== 'joined') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-8">
            <ClipboardList className="w-5 h-5 text-brand-blue-primary mr-2" />
            <span className="text-sm text-slate-300 font-semibold">
              Video Activity
            </span>
          </div>

          <h1 className="text-2xl font-black text-white mb-2 text-center">
            Select Your Class
          </h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            Which class period are you in?
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2 mb-6">
            {periodStep.map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`w-full px-4 py-4 rounded-xl text-lg font-bold transition-all ${
                  selectedPeriod === period
                    ? 'bg-brand-blue-primary text-white ring-2 ring-brand-blue-light'
                    : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          <button
            onClick={() => void handlePeriodConfirm()}
            disabled={joinStatus === 'loading' || !selectedPeriod}
            className="w-full py-4 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {joinStatus === 'loading' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Continue <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <button
            onClick={() => {
              setPeriodStep(null);
              setSelectedPeriod(null);
            }}
            className="w-full mt-3 py-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Not joined yet ────────────────────────────────────────────────────────

  if (joinStatus !== 'joined') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Brand header */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="bg-brand-red-primary rounded-xl p-2.5">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-black text-xl leading-none">
                SpartBoard
              </p>
              <p className="text-slate-400 text-xs font-medium mt-0.5">
                Video Activity
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-brand-blue-primary px-5 py-4">
              <h1 className="text-white font-black text-base uppercase tracking-wide">
                Join Activity
              </h1>
            </div>

            <form onSubmit={handleJoin} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="w-full border-2 border-slate-200 focus:border-brand-blue-primary rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Roster PIN
                </label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Ask your teacher"
                  inputMode="numeric"
                  className="w-full border-2 border-slate-200 focus:border-brand-blue-primary rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors"
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  joinStatus === 'loading' || !name.trim() || !pin.trim()
                }
                className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {joinStatus === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining…
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    Join &amp; Watch
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Completion screen ─────────────────────────────────────────────────────

  if (videoEnded || myResponse?.completedAt) {
    const answeredCount = myResponse?.answers.length ?? 0;
    const totalQuestions = session?.questions.length ?? 0;
    // Derive correctness from authoritative session data rather than the stored
    // isCorrect field, which is no longer written by the client.
    const correct =
      session?.questions.filter((q) =>
        myResponse?.answers.some(
          (a) => a.questionId === q.id && a.answer === q.correctAnswer
        )
      ).length ?? 0;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden text-center">
            <div className="bg-emerald-600 px-5 py-6">
              <Trophy className="w-10 h-10 text-white mx-auto mb-2" />
              <h2 className="text-white font-black text-xl">
                Activity Complete!
              </h2>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <p className="text-slate-600 font-medium">
                Great work,{' '}
                <span className="text-brand-blue-dark font-bold">
                  {myResponse?.name}
                </span>
                !
              </p>

              {totalQuestions > 0 && (
                <div className="bg-brand-blue-lighter/30 rounded-2xl p-5">
                  <p className="text-5xl font-black text-brand-blue-dark">
                    {Math.round((correct / totalQuestions) * 100)}%
                  </p>
                  <p className="text-brand-blue-primary/70 text-sm font-medium mt-1">
                    {correct} of {totalQuestions} correct
                  </p>
                </div>
              )}

              {answeredCount < totalQuestions && (
                <p className="text-slate-500 text-sm">
                  {totalQuestions - answeredCount} question(s) were skipped.
                </p>
              )}

              <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Results submitted to your teacher
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active video + question overlay ───────────────────────────────────────

  const answeredCount = myResponse?.answers.length ?? 0;
  const totalQuestions = sortedQuestions.length;

  return (
    <div className="h-screen h-dvh overflow-hidden bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PlayCircle className="w-4 h-4 text-brand-red-primary" />
          <span className="text-white font-bold text-sm truncate max-w-48">
            {session?.activityTitle}
          </span>
        </div>
        <span className="text-slate-400 text-xs font-medium">
          {answeredCount}/{totalQuestions} answered
        </span>
      </div>

      {/* Video area */}
      <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
        <div
          className="px-4 md:px-6 py-4 md:py-6 flex-1"
          style={{ minHeight: 0 }}
        >
          <div className="w-full h-full max-w-5xl mx-auto flex items-center justify-center">
            <div className="relative aspect-video h-full w-auto max-w-full rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl">
              <VideoPlayer
                youtubeUrl={session?.youtubeUrl ?? ''}
                questions={sortedQuestions}
                answeredQuestionIds={answeredQuestionIds}
                onQuestionTrigger={handleQuestionTrigger}
                onVideoEnd={handleVideoEnd}
                questionVisible={activeQuestion !== null}
                allowSkipping={session?.settings?.allowSkipping ?? false}
                autoPlay={session?.settings?.autoPlay ?? false}
                seekRequest={seekRequest}
              />

              {activeQuestion && (
                <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[1px] flex items-center justify-center overflow-y-auto p-2 sm:p-4">
                  <QuestionOverlay
                    key={activeQuestion.id}
                    question={activeQuestion}
                    onAnswer={handleAnswer}
                    questionIndex={
                      sortedQuestions.findIndex(
                        (q) => q.id === activeQuestion.id
                      ) + 1
                    }
                    totalQuestions={totalQuestions}
                    requireCorrectAnswer={
                      session?.settings?.requireCorrectAnswer ?? true
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {!activeQuestion && (
          <div className="w-full px-4 md:px-6 pb-4 md:pb-6 pt-3">
            <div className="max-w-5xl mx-auto bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300">
              {totalQuestions > 0
                ? 'Watch the video. Questions will appear on top of the video at each checkpoint.'
                : 'Watch the video to complete this activity.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

const FullPageLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-8 h-8 text-brand-blue-primary animate-spin" />
    <p className="text-slate-400 text-sm font-medium">{message}</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 p-6">
    <AlertCircle className="w-8 h-8 text-red-400" />
    <p className="text-slate-300 text-sm text-center">{message}</p>
  </div>
);

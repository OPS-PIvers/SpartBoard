/**
 * QuizStudentApp — the student-facing quiz experience.
 * Accessible at /quiz?code=XXXXXX
 *
 * Flow:
 *  1. Student must sign in with Google (org email required)
 *  2. Student enters a quiz code (or picks it up from URL param)
 *  3. Student waits in lobby for teacher to start
 *  4. Questions are shown one by one as teacher advances
 *  5. Student submits answers; teacher sees results
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  Timer,
  ArrowRight,
  Trophy,
  AlertCircle,
  Flame,
  Zap,
  X as XIcon,
  Check,
} from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useQuizSessionStudent, normalizeAnswer } from '@/hooks/useQuizSession';
import { QuizSession, QuizPublicQuestion } from '@/types';
import { useDialog } from '@/context/useDialog';
import {
  playCorrectChime,
  playIncorrectBuzz,
  playCountdownTick,
  playStreakSound,
} from '@/utils/quizAudio';

// ─── Root component ───────────────────────────────────────────────────────────

export const QuizStudentApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  // Sign in anonymously on mount — no user interaction required.
  // This satisfies Firestore security rules (request.auth != null) without
  // storing any student PII in Firebase Authentication.
  useEffect(() => {
    const init = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.warn('[QuizStudentApp] Anonymous auth failed:', err);
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

  if (authFailed || !auth.currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-slate-300 text-sm text-center">
          Unable to connect. Please refresh the page and try again.
        </p>
      </div>
    );
  }

  return <QuizJoinFlow />;
};

// ─── Join flow ────────────────────────────────────────────────────────────────

const QuizJoinFlow: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('code') ?? '';

  const [code, setCode] = useState(urlCode);
  const [pin, setPin] = useState('');
  const [joined, setJoined] = useState(false);

  const {
    session,
    myResponse,
    loading,
    error,
    joinQuizSession,
    submitAnswer,
    completeQuiz,
    reportTabSwitch,
    warningCount,
  } = useQuizSessionStudent();

  const handleJoin = useCallback(
    async (joinCode: string, joinPin: string) => {
      await joinQuizSession(joinCode, joinPin);
      setJoined(true);
    },
    [joinQuizSession]
  );

  const handleAnswer = useCallback(
    async (questionId: string, answer: string, speedBonus?: number) => {
      await submitAnswer(questionId, answer, speedBonus);
    },
    [submitAnswer]
  );

  const handleComplete = useCallback(async () => {
    await completeQuiz();
  }, [completeQuiz]);

  // Auto-join only works when a code AND a pin are both known. Since pin comes
  // from a form field there's no auto-join on URL code alone — the student
  // must always enter their PIN manually.
  // (If you want URL-based pin support: ?code=XXXXXX&pin=01 is an option for
  // future work, but not implemented here to avoid leaking PINs in URL logs.)

  // Not yet joined
  if (!joined || !session) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-8">
            <ClipboardList className="w-5 h-5 text-violet-400 mr-2" />
            <span className="text-sm text-slate-300 font-semibold">
              Student Quiz
            </span>
          </div>

          <h1 className="text-2xl font-black text-white mb-2 text-center">
            Join Quiz
          </h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            Enter the code and your PIN from your teacher.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleJoin(code, pin);
            }}
            className="space-y-4"
          >
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Quiz Code (XXXXXX)"
              maxLength={8}
              className="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white text-xl font-black font-mono tracking-widest text-center uppercase placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Your PIN"
              maxLength={10}
              className="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white text-xl font-black font-mono tracking-widest text-center placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
            <button
              type="submit"
              disabled={loading || !code.trim() || !pin.trim()}
              className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Join <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Waiting room
  if (session.status === 'waiting') {
    return <WaitingRoom session={session} pin={pin} />;
  }

  // Active quiz
  if (session.status === 'active') {
    const publicQuestions = session.publicQuestions ?? [];
    const currentQ =
      session.currentQuestionIndex >= 0
        ? publicQuestions[session.currentQuestionIndex]
        : undefined;

    const alreadyAnswered = currentQ
      ? (myResponse?.answers ?? []).some((a) => a.questionId === currentQ.id)
      : false;

    return (
      <ActiveQuiz
        session={session}
        currentQuestion={currentQ}
        alreadyAnswered={alreadyAnswered}
        myResponse={myResponse}
        onAnswer={handleAnswer}
        onComplete={handleComplete}
        reportTabSwitch={reportTabSwitch}
        warningCount={warningCount}
      />
    );
  }

  // Session ended
  return (
    <ResultsScreen
      answeredCount={(myResponse?.answers ?? []).length}
      totalQuestions={session.totalQuestions}
      pin={pin}
    />
  );
};

// ─── Waiting room ─────────────────────────────────────────────────────────────

const WaitingRoom: React.FC<{
  session: QuizSession;
  pin: string;
}> = ({ session, pin }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 bg-violet-600/20 border border-violet-500/30 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
      <ClipboardList className="w-8 h-8 text-violet-400" />
    </div>
    <h1 className="text-2xl font-black text-white mb-2">{session.quizTitle}</h1>
    <p className="text-slate-400 text-sm mb-2">
      Waiting for your teacher to start…
    </p>
    <p className="text-slate-500 text-xs mb-8">
      {session.totalQuestions} questions
    </p>
    <div className="p-4 bg-slate-800 rounded-xl">
      <p className="text-slate-300 text-sm">
        Joined as PIN{' '}
        <span className="font-semibold text-white font-mono">{pin}</span>
      </p>
    </div>
  </div>
);

// ─── Active quiz ──────────────────────────────────────────────────────────────

const ActiveQuiz: React.FC<{
  session: QuizSession;
  currentQuestion: QuizPublicQuestion | undefined;
  alreadyAnswered: boolean;
  myResponse: ReturnType<typeof useQuizSessionStudent>['myResponse'];
  onAnswer: (qId: string, answer: string, speedBonus?: number) => Promise<void>;
  onComplete: () => Promise<void>;
  reportTabSwitch: () => Promise<number>;
  warningCount: number;
}> = ({
  session,
  currentQuestion: sessionQuestion,
  alreadyAnswered: sessionAnswered,
  myResponse,
  onAnswer,
  onComplete,
  reportTabSwitch,
  warningCount,
}) => {
  const { showAlert } = useDialog();
  const [showCheatWarning, setShowCheatWarning] = useState(false);

  const isWarningShowingRef = useRef<boolean>(false);
  const lastReportTimeRef = useRef<number>(0);

  const handleAutoSubmit = useCallback(async () => {
    await showAlert(
      'You have left the quiz 3 times. Your quiz is being auto-submitted.',
      { title: 'Quiz Auto-Submitted', variant: 'warning' }
    );
    await onComplete();
  }, [showAlert, onComplete]);

  // The Visibility Tracker — only active when tabWarningsEnabled
  const tabWarningsEnabled = session.tabWarningsEnabled !== false;

  useEffect(() => {
    if (!tabWarningsEnabled) return; // Skip entirely when disabled

    const handleVisibilityChange = async () => {
      // Don't track if the quiz isn't active, if we're already showing a warning,
      // or if the student has already completed the quiz.
      if (
        session.status !== 'active' ||
        isWarningShowingRef.current ||
        myResponse?.status === 'completed'
      )
        return;

      const now = Date.now();
      // Debounce to prevent dual blur/visibility events
      if (now - lastReportTimeRef.current < 1000) return;

      const isPageHidden = document.visibilityState === 'hidden';
      const isWindowBlurred = !document.hasFocus();

      if (isPageHidden || isWindowBlurred) {
        lastReportTimeRef.current = now;
        isWarningShowingRef.current = true;

        try {
          const newTotal = await reportTabSwitch();
          setShowCheatWarning(true);

          // Auto-submit if they breach the threshold (e.g., 3 strikes)
          if (newTotal >= 3) {
            // Use a slight delay so the UI can update before the dialog
            setTimeout(() => void handleAutoSubmit(), 100);
          }
        } catch (err) {
          console.error('Failed to report tab switch:', err);
          // Still show the UI warning even if Firestore update fails
          setShowCheatWarning(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);

    // Initial check just in case they started the quiz in a background tab
    void handleVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
    };
  }, [
    tabWarningsEnabled,
    session.status,
    reportTabSwitch,
    onComplete,
    handleAutoSubmit,
    myResponse?.status,
  ]);

  // For student-paced mode, the student maintains their own local index
  const [localIndex, setLocalIndex] = useState(0);

  const isStudentPaced = session.sessionMode === 'student';
  const currentIndex = isStudentPaced
    ? localIndex
    : session.currentQuestionIndex;

  const currentQuestion = isStudentPaced
    ? session.publicQuestions[localIndex]
    : sessionQuestion;

  const alreadyAnswered = isStudentPaced
    ? (myResponse?.answers ?? []).some(
        (a) => a.questionId === currentQuestion?.id
      )
    : sessionAnswered;

  const initialTimeLimit = currentQuestion?.timeLimit ?? 0;
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fibAnswer, setFibAnswer] = useState('');

  const [submitted, setSubmitted] = useState(alreadyAnswered);
  const [timeLeft, setTimeLeft] = useState<number | null>(
    initialTimeLimit > 0 && !alreadyAnswered ? initialTimeLimit : null
  );
  const [prevQuestionId, setPrevQuestionId] = useState<string | undefined>(
    currentQuestion?.id
  );
  const [prevAlreadyAnswered, setPrevAlreadyAnswered] =
    useState<boolean>(alreadyAnswered);

  // Track which question triggered an auto-submit so we fire the side-effect exactly once.
  const [autoSubmitTriggeredFor, setAutoSubmitTriggeredFor] = useState<
    string | null
  >(null);

  // ─── Gamification state ─────────────────────────────────────────────────────
  const [answerFeedback, setAnswerFeedback] = useState<
    'correct' | 'incorrect' | null
  >(null);
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [speedBonusEarned, setSpeedBonusEarned] = useState<number | null>(null);
  const [streakCount, setStreakCount] = useState(0);

  // Derived state: reset local UI state on new question or when global alreadyAnswered state arrives
  if (
    currentQuestion?.id !== prevQuestionId ||
    alreadyAnswered !== prevAlreadyAnswered
  ) {
    setPrevQuestionId(currentQuestion?.id);
    setPrevAlreadyAnswered(alreadyAnswered);
    setSelectedAnswer(null);
    setSubmitted(alreadyAnswered);
    setFibAnswer('');
    setAutoSubmitTriggeredFor(null);
    setAnswerFeedback(null);
    setRevealedAnswer(null);
    setSpeedBonusEarned(null);
    const tl = currentQuestion?.timeLimit ?? 0;
    setTimeLeft(tl > 0 && !alreadyAnswered ? tl : null);
  }

  // Auto-submit detection: when the timer hits zero, mark as submitted during render.
  if (
    timeLeft !== null &&
    timeLeft <= 0 &&
    !submitted &&
    !submitting &&
    currentQuestion &&
    autoSubmitTriggeredFor !== currentQuestion.id
  ) {
    setAutoSubmitTriggeredFor(currentQuestion.id);
    setSubmitted(true);
  }

  // Keep refs for volatile state used by the countdown effect so the timer
  // doesn't restart on every keystroke or selection change.
  const currentQuestionRef = useRef(currentQuestion);
  const selectedAnswerRef = useRef(selectedAnswer);
  const fibAnswerRef = useRef(fibAnswer);
  const onAnswerRef = useRef(onAnswer);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
    selectedAnswerRef.current = selectedAnswer;
    fibAnswerRef.current = fibAnswer;
    onAnswerRef.current = onAnswer;
  }, [currentQuestion, selectedAnswer, fibAnswer, onAnswer]);

  // Countdown — only runs the interval; auto-submit is handled above.
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || submitted || submitting) return;
    const id = setInterval(() => {
      setTimeLeft((t) => (t === null ? null : t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft, submitted, submitting]);

  // Play tick sound for last 5 seconds (separate from state updater)
  useEffect(() => {
    if (
      timeLeft !== null &&
      timeLeft > 0 &&
      timeLeft <= 5 &&
      !submitted &&
      session.soundEffectsEnabled
    ) {
      playCountdownTick();
    }
  }, [timeLeft, submitted, session.soundEffectsEnabled]);

  // Side-effect: submit the answer when auto-submit is triggered.
  useEffect(() => {
    if (!autoSubmitTriggeredFor) return;
    const question = currentQuestionRef.current;
    if (!question || question.id !== autoSubmitTriggeredFor) return;
    void onAnswerRef
      .current(
        autoSubmitTriggeredFor,
        selectedAnswerRef.current ?? fibAnswerRef.current ?? ''
      )
      .catch((err: unknown) => {
        console.error('[QuizStudentApp] auto-submit failed:', err);
      });
  }, [autoSubmitTriggeredFor]);

  // Watch for teacher revealing answers after student already submitted.
  // Uses "adjusting state during render" pattern to avoid setState-in-effect.
  const currentRevealed = currentQuestion
    ? session.revealedAnswers?.[currentQuestion.id]
    : undefined;
  const [prevRevealed, setPrevRevealed] = useState(currentRevealed);

  if (currentRevealed !== prevRevealed) {
    setPrevRevealed(currentRevealed);
    if (
      currentRevealed &&
      submitted &&
      session.showResultToStudent &&
      answerFeedback === null
    ) {
      const studentAns =
        selectedAnswer ??
        myResponse?.answers.find((a) => a.questionId === currentQuestion?.id)
          ?.answer;
      if (studentAns) {
        const isCorrect =
          normalizeAnswer(studentAns) === normalizeAnswer(currentRevealed);
        setAnswerFeedback(isCorrect ? 'correct' : 'incorrect');
        if (isCorrect) {
          setStreakCount((s) => s + 1);
        } else {
          setStreakCount(0);
        }
        if (session.showCorrectAnswerToStudent) {
          setRevealedAnswer(currentRevealed);
        }
      }
    }
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (answer: string) => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    setSelectedAnswer(answer);

    // Compute speed bonus before submit so it's persisted with the answer
    let computedSpeedBonus: number | undefined;
    if (session.speedBonusEnabled && currentQuestion.timeLimit > 0) {
      const remaining = Math.max(0, timeLeft ?? 0);
      const bonusPct = Math.round((remaining / currentQuestion.timeLimit) * 50);
      if (bonusPct > 0) computedSpeedBonus = bonusPct;
    }

    await onAnswer(currentQuestion.id, answer, computedSpeedBonus);
    setSubmitting(false);

    // ─── Answer feedback & gamification ──────────────────────────────────────
    // Check if answer is correct by reading revealedAnswers from session
    // (teacher-controlled). For student-paced mode, the teacher may auto-reveal.
    if (session.showResultToStudent) {
      const revealed = session.revealedAnswers?.[currentQuestion.id];
      if (revealed) {
        const isCorrect = normalizeAnswer(answer) === normalizeAnswer(revealed);
        setAnswerFeedback(isCorrect ? 'correct' : 'incorrect');

        // Sound effects
        if (session.soundEffectsEnabled) {
          if (isCorrect) {
            playCorrectChime();
          } else {
            playIncorrectBuzz();
          }
        }

        // Streak tracking
        if (isCorrect) {
          const newStreak = streakCount + 1;
          setStreakCount(newStreak);
          if (
            session.streakBonusEnabled &&
            newStreak >= 2 &&
            session.soundEffectsEnabled
          ) {
            playStreakSound();
          }
        } else {
          setStreakCount(0);
        }

        // Show correct answer text if enabled
        if (session.showCorrectAnswerToStudent) {
          setRevealedAnswer(revealed);
        }
      }
    }

    // Display the speed bonus that was persisted with the answer
    if (computedSpeedBonus != null && computedSpeedBonus > 0) {
      setSpeedBonusEarned(computedSpeedBonus);
    }

    // Auto-complete if on last question
    if (
      currentIndex >= session.totalQuestions - 1 &&
      myResponse?.status !== 'completed'
    ) {
      await onComplete();
    }
  };

  const handleNext = () => {
    if (isStudentPaced && localIndex < session.totalQuestions - 1) {
      setLocalIndex(localIndex + 1);
    }
  };

  const progress = ((currentIndex + 1) / session.totalQuestions) * 100;

  // Choices are pre-shuffled in publicQuestions by the teacher side
  const options =
    currentQuestion.type === 'MC' ? (currentQuestion.choices ?? []) : [];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col relative">
      {/* 🔴 NEW: The Cheating Warning Modal */}
      {showCheatWarning && (
        <div className="absolute inset-0 z-overlay bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-20 h-20 text-red-500 mb-6 animate-pulse" />
          <h2 className="text-4xl font-black text-white mb-4">
            TAB SWITCH DETECTED
          </h2>
          <p className="text-red-200 text-lg max-w-md mb-8">
            You navigated away from the quiz. This incident has been logged.
            <br />
            <br />
            <strong>Warning {warningCount} of 3.</strong> If you reach 3
            warnings, your quiz will automatically submit.
          </p>
          <button
            onClick={() => {
              setShowCheatWarning(false);
              isWarningShowingRef.current = false;
            }}
            className="px-8 py-4 bg-white text-red-900 font-bold rounded-xl active:scale-95 transition-transform"
          >
            I Understand, Return to Quiz
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-violet-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-slate-500">
            {currentIndex + 1} / {session.totalQuestions}
          </span>
          {timeLeft !== null && !submitted && (
            <div
              className={`flex items-center gap-1.5 text-sm font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-amber-400'}`}
            >
              <Timer className="w-4 h-4" />
              {timeLeft}s
            </div>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${
              currentQuestion.type === 'MC'
                ? 'bg-blue-500/20 text-blue-400'
                : currentQuestion.type === 'FIB'
                  ? 'bg-amber-500/20 text-amber-400'
                  : currentQuestion.type === 'Matching'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-teal-500/20 text-teal-400'
            }`}
          >
            {currentQuestion.type === 'MC'
              ? 'Multiple Choice'
              : currentQuestion.type === 'FIB'
                ? 'Fill in the Blank'
                : currentQuestion.type === 'Matching'
                  ? 'Matching'
                  : 'Ordering'}
          </span>
        </div>

        {/* Question */}
        <h2 className="text-xl font-bold text-white mb-8 leading-snug">
          {currentQuestion.text}
        </h2>

        {/* Answer area */}
        {currentQuestion.type === 'MC' && (
          <div className="space-y-3 flex-1">
            {options.map((opt) => {
              const isSelected = selectedAnswer === opt;
              let cls =
                'w-full text-left px-5 py-4 rounded-2xl border-2 text-sm font-medium transition-all ';
              if (!submitted) {
                cls += isSelected
                  ? 'border-violet-500 bg-violet-500/20 text-white'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700/50';
              } else {
                cls += isSelected
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-500 cursor-default';
              }
              return (
                <button
                  key={opt}
                  onClick={() => !submitted && void handleSubmit(opt)}
                  disabled={submitted || submitting}
                  className={cls}
                >
                  {opt}
                </button>
              );
            })}

            {submitted && (
              <div className="pt-4 animate-in fade-in slide-in-from-bottom-2 space-y-3">
                <AnswerFeedbackBanner
                  feedback={answerFeedback}
                  revealedAnswer={revealedAnswer}
                  speedBonus={speedBonusEarned}
                  streakCount={streakCount}
                  streakEnabled={session.streakBonusEnabled}
                />
                {isStudentPaced && currentIndex < session.totalQuestions - 1 ? (
                  <button
                    onClick={handleNext}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                  >
                    NEXT QUESTION <ArrowRight className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-300 text-sm font-bold">
                      {currentIndex < session.totalQuestions - 1
                        ? 'Waiting for teacher…'
                        : 'Quiz complete!'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentQuestion.type === 'FIB' && (
          <div className="space-y-4 flex-1">
            <input
              type="text"
              value={fibAnswer}
              onChange={(e) => setFibAnswer(e.target.value)}
              disabled={submitted}
              placeholder="Type your answer…"
              className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:ring-0 focus:border-violet-500 disabled:opacity-50"
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                fibAnswer.trim() &&
                !submitted &&
                void handleSubmit(fibAnswer.trim())
              }
            />
            <div className="animate-in fade-in slide-in-from-bottom-2">
              {!submitted ? (
                <button
                  onClick={() =>
                    fibAnswer.trim() && void handleSubmit(fibAnswer.trim())
                  }
                  disabled={!fibAnswer.trim() || submitting}
                  className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Submit Answer'
                  )}
                </button>
              ) : (
                <div className="space-y-3">
                  <AnswerFeedbackBanner
                    feedback={answerFeedback}
                    revealedAnswer={revealedAnswer}
                    speedBonus={speedBonusEarned}
                    streakCount={streakCount}
                    streakEnabled={session.streakBonusEnabled}
                  />
                  {isStudentPaced &&
                  currentIndex < session.totalQuestions - 1 ? (
                    <button
                      onClick={handleNext}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                      NEXT QUESTION <ArrowRight className="w-5 h-5" />
                    </button>
                  ) : (
                    <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <p className="text-emerald-300 text-sm font-bold">
                        {currentIndex < session.totalQuestions - 1
                          ? 'Waiting for teacher…'
                          : 'Quiz complete!'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {(currentQuestion.type === 'Matching' ||
          currentQuestion.type === 'Ordering') && (
          <StructuredQuestionInput
            key={currentQuestion.id}
            question={currentQuestion}
            submitted={submitted}
            onSubmit={(answer) => void handleSubmit(answer)}
            submitting={submitting}
            isStudentPaced={isStudentPaced}
            isLastQuestion={currentIndex >= session.totalQuestions - 1}
            onNext={handleNext}
          />
        )}
      </div>
    </div>
  );
};

// ─── Structured question (Matching / Ordering) ───────────────────────────────

const StructuredQuestionInput: React.FC<{
  question: QuizPublicQuestion;
  submitted: boolean;
  onSubmit: (answer: string) => void;
  submitting: boolean;
  isStudentPaced: boolean;
  isLastQuestion: boolean;
  onNext: () => void;
}> = ({
  question,
  submitted,
  onSubmit,
  submitting,
  isStudentPaced,
  isLastQuestion,
  onNext,
}) => {
  const isMatching = question.type === 'Matching';

  // Items come from the pre-computed public question fields — no correctAnswer needed
  const leftItems: string[] = isMatching
    ? (question.matchingLeft ?? [])
    : (question.orderingItems ?? []);

  const rightItemsShuffled: string[] = isMatching
    ? (question.matchingRight ?? [])
    : [];

  const [matchings, setMatchings] = useState<Record<string, string>>(() =>
    Object.fromEntries(leftItems.map((l: string) => [l, '']))
  );
  const [order, setOrder] = useState<string[]>(() => [...leftItems]);

  const canSubmit = isMatching
    ? Object.values(matchings).every((v: string) => !!v)
    : order.length > 0 && order.length === leftItems.length;

  const handleSubmitStructured = () => {
    let answer: string;
    if (isMatching) {
      answer = leftItems
        .map((l: string) => `${l}:${matchings[l] || ''}`)
        .join('|');
    } else {
      answer = order.join('|');
    }
    onSubmit(answer);
  };

  // ─── Drag and Drop Handlers ────────────────────────────────────────────────
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...order];
    const item = newOrder.splice(draggedIndex, 1)[0];
    newOrder.splice(index, 0, item);
    setOrder(newOrder);
    setDraggedIndex(index);
  };

  return (
    <div className="space-y-4 flex-1">
      {!submitted ? (
        <>
          {isMatching ? (
            <div className="space-y-3">
              {leftItems.map((left: string) => (
                <div key={left} className="flex items-center gap-3">
                  <span className="text-sm text-slate-300 w-1/2">{left}</span>
                  <select
                    value={matchings[left]}
                    onChange={(e) =>
                      setMatchings((m) => ({ ...m, [left]: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="">Select…</option>
                    {rightItemsShuffled.map((r: string) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">
                Drag or use arrows to set the correct order:
              </p>
              {order.map((item: string, i: number) => (
                <div
                  key={item}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={() => setDraggedIndex(null)}
                  className={`flex items-center gap-2 bg-slate-800 border rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing transition-colors ${draggedIndex === i ? 'border-violet-500 bg-violet-500/10' : 'border-slate-700'}`}
                >
                  <span className="text-violet-400 font-bold text-sm w-5">
                    {i + 1}.
                  </span>
                  <span className="flex-1 text-sm text-white select-none">
                    {item}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        if (i > 0) {
                          const newOrder = [...order];
                          [newOrder[i - 1], newOrder[i]] = [
                            newOrder[i],
                            newOrder[i - 1],
                          ];
                          setOrder(newOrder);
                        }
                      }}
                      disabled={i === 0}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => {
                        if (i < order.length - 1) {
                          const newOrder = [...order];
                          [newOrder[i], newOrder[i + 1]] = [
                            newOrder[i + 1],
                            newOrder[i],
                          ];
                          setOrder(newOrder);
                        }
                      }}
                      disabled={i === order.length - 1}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmitStructured}
            disabled={!canSubmit || submitting}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Submit Answer'
            )}
          </button>
        </>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          {isStudentPaced && !isLastQuestion ? (
            <button
              onClick={onNext}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
            >
              NEXT QUESTION <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-emerald-300 text-sm font-bold">
                {!isLastQuestion ? 'Waiting for teacher…' : 'Quiz complete!'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Answer feedback banner ──────────────────────────────────────────────────

const AnswerFeedbackBanner: React.FC<{
  feedback: 'correct' | 'incorrect' | null;
  revealedAnswer: string | null;
  speedBonus: number | null;
  streakCount: number;
  streakEnabled?: boolean;
}> = ({ feedback, revealedAnswer, speedBonus, streakCount, streakEnabled }) => {
  if (!feedback && !speedBonus && !(streakEnabled && streakCount >= 2))
    return null;

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
      {feedback === 'correct' && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center gap-3">
          <Check className="w-6 h-6 text-emerald-400 shrink-0" />
          <p className="text-emerald-300 font-bold text-sm">Correct!</p>
        </div>
      )}
      {feedback === 'incorrect' && (
        <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-2xl">
          <div className="flex items-center gap-3">
            <XIcon className="w-6 h-6 text-red-400 shrink-0" />
            <p className="text-red-300 font-bold text-sm">Incorrect</p>
          </div>
          {revealedAnswer && (
            <p className="text-slate-400 text-xs mt-2 ml-9">
              Correct answer:{' '}
              <span className="text-emerald-400 font-semibold">
                {revealedAnswer}
              </span>
            </p>
          )}
        </div>
      )}
      {speedBonus !== null && speedBonus > 0 && (
        <div className="flex items-center gap-2 text-amber-400">
          <Zap className="w-4 h-4" />
          <span className="text-xs font-bold">+{speedBonus}% speed bonus!</span>
        </div>
      )}
      {streakEnabled && streakCount >= 2 && (
        <div className="flex items-center gap-2 text-orange-400">
          <Flame className="w-4 h-4" />
          <span className="text-xs font-bold">
            {streakCount} in a row! {streakCount >= 3 ? '2x' : '1.5x'}{' '}
            multiplier
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Results screen ───────────────────────────────────────────────────────────

const ResultsScreen: React.FC<{
  answeredCount: number;
  totalQuestions: number;
  pin: string;
}> = ({ answeredCount, totalQuestions, pin }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
    <Trophy className="w-16 h-16 text-amber-400 mb-6" />
    <h1 className="text-3xl font-black text-white mb-2">Quiz Complete!</h1>
    <p className="text-slate-400 text-sm mb-8">
      Great job, PIN{' '}
      <span className="font-mono font-bold text-white">{pin}</span>!
    </p>

    <div className="mb-8 p-6 bg-slate-800 rounded-2xl">
      <p className="text-5xl font-black text-white mb-2">{answeredCount}</p>
      <p className="text-slate-400 text-sm">
        of {totalQuestions} questions answered
      </p>
    </div>

    <p className="text-slate-500 text-sm max-w-xs">
      Your answers have been submitted. Ask your teacher to see your results.
    </p>
  </div>
);

// ─── Utilities ────────────────────────────────────────────────────────────────

const FullPageLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
    <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
    <p className="text-slate-400 text-sm">{message}</p>
  </div>
);

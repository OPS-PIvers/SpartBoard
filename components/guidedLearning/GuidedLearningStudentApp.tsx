/**
 * GuidedLearningStudentApp — student-facing guided learning experience.
 * Accessible at /guided-learning/:sessionId (no Google auth required).
 *
 * Flow:
 *  1. Anonymous Firebase auth
 *  2. Load session from Firestore
 *  3. Student enters PIN (optional)
 *  4. Complete guided experience
 *  5. Submit responses and show completion screen
 */

import React, { useState, useEffect, useCallback } from 'react';
import { signInAnonymously } from 'firebase/auth';
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { useGuidedLearningSessionStudent } from '@/hooks/useGuidedLearningSession';
import { GuidedLearningResponse, GuidedLearningSession } from '@/types';
import { GuidedLearningPlayer } from '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer';

const GL_SESSIONS_COLLECTION = 'guided_learning_sessions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FullPageLoader: React.FC<{ message?: string }> = ({
  message = 'Loading…',
}) => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
    <p className="text-slate-400 text-sm">{message}</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-6 text-center">
    <AlertCircle className="w-12 h-12 text-red-400" />
    <p className="text-white font-semibold text-lg">Oops</p>
    <p className="text-slate-400 text-sm max-w-sm">{message}</p>
  </div>
);

// ─── Root ─────────────────────────────────────────────────────────────────────

export const GuidedLearningStudentApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [anonymousUid, setAnonymousUid] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Await IndexedDB hydration before checking `auth.currentUser`,
        // otherwise a full-page navigation from `/my-assignments` would
        // race hydration and demote an SSO user to a fresh anonymous
        // session. See QuizStudentApp for the same fix.
        await auth.authStateReady();
        if (!auth.currentUser) {
          const cred = await signInAnonymously(auth);
          setAnonymousUid(cred.user.uid);
        } else {
          setAnonymousUid(auth.currentUser.uid);
        }
      } catch (err) {
        console.warn('[GuidedLearningStudentApp] Anonymous auth failed:', err);
        setAuthFailed(true);
      } finally {
        setAuthReady(true);
      }
    };
    void init();
  }, []);

  if (!authReady) return <FullPageLoader />;
  if (authFailed)
    return (
      <ErrorScreen message="Unable to connect. Please refresh and try again." />
    );
  if (!anonymousUid) return <FullPageLoader />;

  return <StudentExperience anonymousUid={anonymousUid} />;
};

// ─── Main experience ──────────────────────────────────────────────────────────

const StudentExperience: React.FC<{ anonymousUid: string }> = ({
  anonymousUid,
}) => {
  const sessionId =
    window.location.pathname.split('/guided-learning/')[1] ?? '';
  const { session, loading, error, submitResponse } =
    useGuidedLearningSessionStudent(sessionId);
  const isViewOnly = session?.assignmentMode === 'view-only';

  // View tracking — log each pageview of a view-only Share link as an
  // immutable doc in the session's `views/` subcollection. Best-effort and
  // fire-and-forget. `wroteViewRef` dedupes within a single mount —
  // refresh-inflation across mounts is accepted per the "URL opens" framing.
  const wroteViewRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!isViewOnly || !sessionId || !anonymousUid) return;
    if (wroteViewRef.current === sessionId) return;
    wroteViewRef.current = sessionId;
    void addDoc(collection(db, GL_SESSIONS_COLLECTION, sessionId, 'views'), {
      viewedAt: serverTimestamp(),
    }).catch((err) => {
      // logError so sustained failures surface in error-level filters.
      logError('GuidedLearningStudentApp.viewLog', err, { sessionId });
    });
  }, [isViewOnly, sessionId, anonymousUid]);

  const [pin, setPin] = useState('');
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<GuidedLearningResponse['answers']>([]);
  // Bumped when the user clicks "Replay from beginning" on a view-only
  // completion screen. Used as the React key on the player so its
  // internal state (currentIdx, activeStepId, image index, etc.) fully
  // resets to a fresh experience without needing reload.
  const [replayKey, setReplayKey] = useState(0);
  // Phase 5A: post-PIN class-period picker. When the session has multiple
  // periods configured, the student chooses one before the experience
  // begins; the value is persisted on their response doc.
  const [classPeriod, setClassPeriod] = useState<string | null>(null);
  const startedAt = React.useRef<number>(0);
  useEffect(() => {
    if (startedAt.current === 0) {
      startedAt.current = Date.now();
    }
  }, []);

  const handleAnswer = useCallback(
    (stepId: string, answer: string | string[], isCorrect: boolean | null) => {
      setAnswers((prev) => {
        const existing = prev.find((a) => a.stepId === stepId);
        if (existing)
          return prev.map((a) =>
            a.stepId === stepId ? { stepId, answer, isCorrect } : a
          );
        return [...prev, { stepId, answer, isCorrect }];
      });
    },
    []
  );

  const handleComplete = useCallback(async () => {
    if (!session) return;
    // In the student app the answer key is not available client-side.
    // Score is computed on the teacher/results side from raw answers + answer key.
    const computedScore: number | null = null;

    setScore(computedScore);
    setCompleted(true);

    // View-only shares never persist a response — the Firestore rule rejects
    // the write defense-in-depth, but skip it client-side too so the console
    // stays clean.
    if (isViewOnly) return;

    const response: GuidedLearningResponse = {
      sessionId,
      studentAnonymousId: anonymousUid,
      pin: pin.trim() || undefined,
      answers,
      startedAt: startedAt.current,
      completedAt: Date.now(),
      score: computedScore,
      ...(classPeriod ? { classPeriod } : {}),
    };

    await submitResponse(response).catch((err) => {
      console.error('[GuidedLearningStudentApp] Submit error:', err);
    });
  }, [
    session,
    answers,
    pin,
    anonymousUid,
    sessionId,
    submitResponse,
    classPeriod,
    isViewOnly,
  ]);

  if (loading) return <FullPageLoader />;
  if (error) return <ErrorScreen message={error} />;
  if (!session) return <ErrorScreen message="Session not found." />;

  if (completed) {
    return (
      <CompletionScreen
        session={session}
        score={score}
        isViewOnly={isViewOnly}
        onReplay={() => {
          // Drop responses + bump key so the player fully remounts with
          // fresh state at step 0 / image 0. Keep `started` true so the
          // user goes straight to the player rather than back through
          // the start screen.
          setAnswers([]);
          setScore(null);
          setCompleted(false);
          setReplayKey((k) => k + 1);
          startedAt.current = Date.now();
        }}
      />
    );
  }

  if (!started) {
    return (
      <StartScreen
        session={session}
        pin={pin}
        onPinChange={setPin}
        selectedPeriod={classPeriod}
        onPeriodChange={setClassPeriod}
        // View-only Share links are public resources — they aren't
        // associated with a particular student or class, so we skip the
        // PIN entry and the class-period picker entirely. The user lands
        // on the welcome / mode screen and clicks straight through.
        isViewOnly={isViewOnly}
        onStart={() => {
          // Auto-select the single period if there's exactly one so the
          // response still gets tagged consistently. Skipped on view-only
          // since responses aren't tracked anyway.
          if (!isViewOnly) {
            const periods = session.periodNames ?? [];
            if (periods.length === 1 && !classPeriod) {
              setClassPeriod(periods[0]);
            }
          }
          setStarted(true);
        }}
      />
    );
  }

  // Convert session to a GuidedLearningSet-like object for GuidedLearningPlayer
  const setForPlayer = {
    id: session.id,
    title: session.title,
    imageUrls: session.imageUrls,
    steps: session.publicSteps,
    mode: session.mode,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    hotspotPulse: session.hotspotPulse,
    imageTransition: session.imageTransition,
  };

  return (
    <div className="h-screen h-dvh overflow-hidden bg-slate-950">
      <div className="h-full relative">
        <GuidedLearningPlayer
          key={`gl-player-${replayKey}`}
          set={
            setForPlayer as Parameters<typeof GuidedLearningPlayer>[0]['set']
          }
          onAnswer={handleAnswer}
          teacherMode={false}
        />
        <button
          onClick={handleComplete}
          className="absolute right-3 z-40 px-4 py-2 bg-emerald-600/95 hover:bg-emerald-500 text-white text-sm rounded-xl transition-colors font-medium shadow-xl border border-emerald-400/30 backdrop-blur-sm"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)',
          }}
        >
          I&apos;m Done
        </button>
      </div>
    </div>
  );
};

// ─── Sub-screens ──────────────────────────────────────────────────────────────

const StartScreen: React.FC<{
  session: GuidedLearningSession;
  pin: string;
  onPinChange: (v: string) => void;
  selectedPeriod: string | null;
  onPeriodChange: (v: string | null) => void;
  /**
   * View-only Share links are public resources, not assignments — they
   * aren't tied to a specific student or class. When true, the period
   * picker and PIN entry are both suppressed.
   */
  isViewOnly: boolean;
  onStart: () => void;
}> = ({
  session,
  pin,
  onPinChange,
  selectedPeriod,
  onPeriodChange,
  isViewOnly,
  onStart,
}) => {
  const periods = session.periodNames ?? [];
  const needsPeriodPicker =
    !isViewOnly && periods.length > 1 && !selectedPeriod;

  if (needsPeriodPicker) {
    return (
      <div className="h-screen overflow-y-auto bg-slate-950">
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <ClipboardList className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
            <h1 className="text-white font-bold text-xl mb-1">
              Select Your Class
            </h1>
            <p className="text-slate-400 text-sm mb-5">
              Which class period are you in?
            </p>
            <div className="space-y-2 mb-5 text-left">
              {periods.map((p) => (
                <button
                  key={p}
                  onClick={() => onPeriodChange(p)}
                  className="w-full px-4 py-3 rounded-xl text-base font-bold transition-all bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-xxs text-slate-500">
              Pick one to continue. You can enter your PIN after this step.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Welcome message gates: must be explicitly enabled AND have non-empty
  // content. Toggle-on-with-empty-message falls through to the default
  // mode/step subtitle so we never render an empty card.
  const welcomeMessage = session.welcomeMessage?.trim() ?? '';
  const showWelcome =
    Boolean(session.welcomeEnabled) && welcomeMessage.length > 0;

  return (
    <div className="h-screen overflow-y-auto bg-slate-950">
      <div className="min-h-full flex items-center justify-center p-6">
        <div
          className={`bg-slate-900 border border-white/10 rounded-2xl p-8 ${showWelcome ? 'max-w-md' : 'max-w-sm'} w-full text-center shadow-2xl`}
        >
          <BookOpen className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
          <h1 className="text-white font-bold text-xl mb-1">{session.title}</h1>
          {showWelcome ? (
            <div className="mt-3 mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
              <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                {welcomeMessage}
              </p>
            </div>
          ) : (
            <p className="text-slate-400 text-sm mb-6 capitalize">
              {session.mode} mode · {session.publicSteps.length} steps
            </p>
          )}

          {!isViewOnly && selectedPeriod && periods.length > 1 && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
              <span className="text-xs text-slate-400">Class</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {selectedPeriod}
                </span>
                <button
                  onClick={() => onPeriodChange(null)}
                  className="text-xxs text-slate-500 hover:text-slate-300"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {!isViewOnly && (
            <div className="mb-6">
              <label className="block text-slate-400 text-xs mb-1.5 text-left">
                Your PIN <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                value={pin}
                onChange={(e) => onPinChange(e.target.value)}
                placeholder="Enter your class PIN"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm text-center tracking-widest"
                maxLength={10}
              />
            </div>
          )}

          <button
            onClick={onStart}
            className={`w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 ${
              // When PIN entry is suppressed (view-only) and no welcome
              // card preceded it, the start button would butt up against
              // the title — give it some breathing room.
              isViewOnly && !showWelcome ? 'mt-2' : ''
            }`}
          >
            {showWelcome ? 'Get started' : 'Start'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const CompletionScreen: React.FC<{
  session: GuidedLearningSession;
  score: number | null;
  isViewOnly: boolean;
  /**
   * View-only "Replay from beginning" handler. Resets state so the
   * player remounts at step 0. Not shown for response-tracked sessions
   * (those have already submitted — replay would imply submitting
   * twice).
   */
  onReplay: () => void;
}> = ({ session, score, isViewOnly, onReplay }) => {
  // View-only completion is purely informational — there's no "score",
  // no "you finished an assignment" framing, just "you reached the end
  // of this resource". Suppress the gamified Trophy / Complete! styling
  // and surface the Replay CTA as the primary action.
  if (isViewOnly) {
    return (
      <div className="h-screen overflow-y-auto bg-slate-950">
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <BookOpen className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h1 className="text-white font-bold text-xl mb-1">
              {session.title}
            </h1>
            <p className="text-slate-400 text-sm mb-6">
              You&apos;ve reached the end of this activity.
            </p>
            <button
              onClick={onReplay}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Replay from beginning
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Response-tracked completion — keep the achievement framing.
  return (
    <div className="h-screen overflow-y-auto bg-slate-950">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <h1 className="text-white font-bold text-xl mb-1">{session.title}</h1>
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto my-4" />
          <p className="text-emerald-400 font-semibold text-lg mb-1">
            Complete!
          </p>
          {score !== null && (
            <p className="text-slate-300 text-sm mb-4">
              You scored <span className="text-white font-bold">{score}%</span>{' '}
              on the comprehension questions.
            </p>
          )}
          <p className="text-slate-500 text-xs">
            Your responses have been submitted.
          </p>
        </div>
      </div>
    </div>
  );
};

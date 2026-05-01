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
  Trophy,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
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
  // fire-and-forget. Runs once per session load (gated by isViewOnly).
  useEffect(() => {
    if (!isViewOnly || !sessionId) return;
    if (!auth.currentUser) return;
    void addDoc(collection(db, GL_SESSIONS_COLLECTION, sessionId, 'views'), {
      viewedAt: serverTimestamp(),
    }).catch((err) => {
      console.warn('[GuidedLearningStudentApp] View log failed:', err);
    });
  }, [isViewOnly, sessionId]);

  const [pin, setPin] = useState('');
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<GuidedLearningResponse['answers']>([]);
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
        onStart={() => {
          // Auto-select the single period if there's exactly one so the
          // response still gets tagged consistently.
          const periods = session.periodNames ?? [];
          if (periods.length === 1 && !classPeriod) {
            setClassPeriod(periods[0]);
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
  };

  return (
    <div className="h-screen h-dvh overflow-hidden bg-slate-950">
      <div className="h-full relative">
        <GuidedLearningPlayer
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
  onStart: () => void;
}> = ({
  session,
  pin,
  onPinChange,
  selectedPeriod,
  onPeriodChange,
  onStart,
}) => {
  const periods = session.periodNames ?? [];
  const needsPeriodPicker = periods.length > 1 && !selectedPeriod;

  if (needsPeriodPicker) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
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
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <BookOpen className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <h1 className="text-white font-bold text-xl mb-1">{session.title}</h1>
        <p className="text-slate-400 text-sm mb-6 capitalize">
          {session.mode} mode · {session.publicSteps.length} steps
        </p>

        {selectedPeriod && periods.length > 1 && (
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

        <button
          onClick={onStart}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Start
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const CompletionScreen: React.FC<{
  session: GuidedLearningSession;
  score: number | null;
  isViewOnly: boolean;
}> = ({ session, score, isViewOnly }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
    <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
      <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
      <h1 className="text-white font-bold text-xl mb-1">{session.title}</h1>
      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto my-4" />
      <p className="text-emerald-400 font-semibold text-lg mb-1">Complete!</p>
      {!isViewOnly && score !== null && (
        <p className="text-slate-300 text-sm mb-4">
          You scored <span className="text-white font-bold">{score}%</span> on
          the comprehension questions.
        </p>
      )}
      <p className="text-slate-500 text-xs">
        {isViewOnly
          ? 'Thanks for viewing!'
          : 'Your responses have been submitted.'}
      </p>
    </div>
  </div>
);

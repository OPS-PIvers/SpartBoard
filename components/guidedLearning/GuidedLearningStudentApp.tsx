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
  XCircle,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
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
  // Realtime listener on /guided_learning_sessions/{id}/responses/{uid}
  // so a returning student gets their published score + per-step
  // `isCorrect` flags, and a teacher unpublish (which clears
  // `session.revealedAnswers` + flips `scoreVisibility` to 'none')
  // propagates without a refresh. View-only shares never persist
  // responses, so the subscription is gated on `shouldSubscribeResponse`.
  const shouldSubscribeResponse = !!sessionId && !!anonymousUid && !isViewOnly;
  const [myResponse, setMyResponse] = useState<GuidedLearningResponse | null>(
    null
  );
  const [myResponseLoading, setMyResponseLoading] = useState(
    shouldSubscribeResponse
  );
  // Adjust-state-while-rendering pattern (avoids set-state-in-effect):
  // when the subscription gating flips (e.g., session loads as view-only),
  // sync the loading flag to match without a cascading render.
  const [prevShouldSubscribeResponse, setPrevShouldSubscribeResponse] =
    useState(shouldSubscribeResponse);
  if (shouldSubscribeResponse !== prevShouldSubscribeResponse) {
    setPrevShouldSubscribeResponse(shouldSubscribeResponse);
    setMyResponseLoading(shouldSubscribeResponse);
    if (!shouldSubscribeResponse) setMyResponse(null);
  }
  useEffect(() => {
    if (!shouldSubscribeResponse) return;
    const unsub = onSnapshot(
      doc(db, GL_SESSIONS_COLLECTION, sessionId, 'responses', anonymousUid),
      (snap) => {
        setMyResponse(
          snap.exists() ? (snap.data() as GuidedLearningResponse) : null
        );
        setMyResponseLoading(false);
      },
      (err) => {
        // Firestore rules may reject the read for a brand-new student
        // who hasn't joined yet — treat as "no response" rather than
        // surfacing a scary error.
        console.warn(
          '[GuidedLearningStudentApp] response listener error:',
          err
        );
        setMyResponse(null);
        setMyResponseLoading(false);
      }
    );
    return unsub;
  }, [sessionId, anonymousUid, shouldSubscribeResponse]);
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

  // Returning student case — a response already exists in Firestore. Show
  // either the published review or a "wait for teacher" placeholder
  // rather than dropping them back onto the start screen (which would
  // imply they could submit again). `completed` short-circuits this
  // branch so the just-submitted screen still wins immediately after
  // `handleComplete` flips the local state.
  if (!completed && !isViewOnly && !myResponseLoading && myResponse) {
    const visibility = session.scoreVisibility ?? 'none';
    if (visibility !== 'none') {
      return (
        <PublishedGLReview
          session={session}
          myResponse={myResponse}
          visibility={visibility}
        />
      );
    }
    return (
      <CompletionScreen
        session={session}
        score={null}
        isViewOnly={false}
        visibility="none"
        onReplay={() => undefined}
      />
    );
  }

  if (completed) {
    return (
      <CompletionScreen
        session={session}
        score={score}
        isViewOnly={isViewOnly}
        visibility={session.scoreVisibility ?? 'none'}
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
   * Teacher's current score-visibility setting on the session.
   * `'none'` ⇒ render the neutral "submitted, ask your teacher"
   * placeholder; any other value ⇒ keep the gamified Trophy framing.
   * The actual score / per-step results live on the response doc and
   * are surfaced by `PublishedGLReview`, not here.
   */
  visibility: NonNullable<GuidedLearningSession['scoreVisibility']>;
  /**
   * View-only "Replay from beginning" handler. Resets state so the
   * player remounts at step 0. Not shown for response-tracked sessions
   * (those have already submitted — replay would imply submitting
   * twice).
   */
  onReplay: () => void;
}> = ({ session, score, isViewOnly, visibility, onReplay }) => {
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

  // Response-tracked completion. When the teacher hasn't published
  // results yet (`visibility === 'none'`, the default), drop the
  // gamified Trophy framing in favor of a neutral "submitted" placeholder
  // — promising "Complete!" on a screen that can't show a score reads as
  // a missing feature. Once the teacher publishes, the parent component
  // routes returning students to `PublishedGLReview` instead, so the
  // Trophy variant below is only reached on the immediate post-submit
  // render when the teacher had already pre-published at create time
  // (uncommon but supported).
  if (visibility === 'none') {
    return (
      <div className="h-screen overflow-y-auto bg-slate-950">
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h1 className="text-white font-bold text-xl mb-1">
              {session.title}
            </h1>
            <p className="text-slate-300 text-sm mb-4">
              Your responses have been submitted.
            </p>
            <p className="text-slate-500 text-xs">
              Ask your teacher to see your results.
            </p>
          </div>
        </div>
      </div>
    );
  }

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

// ─── Published-score review ──────────────────────────────────────────────────
//
// Rendered for a returning student whose teacher has flipped
// `scoreVisibility` on the session via the archive's "Publish scores"
// kebab action. The three modes are progressive disclosure:
//
//   - score-only: just the percentage tally.
//   - score-and-responses: above + per-step rows tagging each of the
//     student's answers correct or incorrect, but never the canonical
//     correct answer.
//   - score-responses-and-answers: above + the canonical correct answer
//     under each row, sourced from `session.revealedAnswers` (populated
//     atomically by `publishAssignmentScores`).
//
// All data the screen needs lives on `myResponse` (score + per-answer
// `isCorrect`) and `session` (publicSteps, revealedAnswers). We don't
// recompute correctness client-side — the teacher's publish step is the
// only writer for those fields, so a stale-cache device can't manufacture
// a "correct" badge that isn't on the authoritative response doc.

const PublishedGLReview: React.FC<{
  session: GuidedLearningSession;
  myResponse: GuidedLearningResponse;
  visibility: NonNullable<GuidedLearningSession['scoreVisibility']>;
}> = ({ session, myResponse, visibility }) => {
  const showResponses =
    visibility === 'score-and-responses' ||
    visibility === 'score-responses-and-answers';
  const showAnswers = visibility === 'score-responses-and-answers';

  const gradableSteps = session.publicSteps.filter((s) => !!s.question);
  const answersByStep = new Map(
    myResponse.answers.map((a) => [a.stepId, a] as const)
  );

  const score = myResponse.score ?? 0;
  const correctCount = myResponse.answers.filter(
    (a) => a.isCorrect === true
  ).length;
  const totalGradable = gradableSteps.length;

  return (
    <div className="h-screen overflow-y-auto bg-slate-950">
      <div className="min-h-full flex items-start justify-center p-6">
        <div className="w-full max-w-md flex flex-col gap-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 text-center shadow-2xl">
            <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
            <h1 className="text-white font-bold text-xl mb-1">
              {session.title}
            </h1>
            <p className="text-slate-400 text-xs mb-4">Your results</p>
            <p className="text-5xl font-black text-white mb-1">{score}%</p>
            {totalGradable > 0 && (
              <p className="text-slate-400 text-sm">
                {correctCount} of {totalGradable} correct
              </p>
            )}
          </div>

          {showResponses && totalGradable > 0 && (
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl">
              <ul className="flex flex-col gap-3">
                {gradableSteps.map((step, idx) => {
                  const ans = answersByStep.get(step.id);
                  const isCorrect = ans?.isCorrect === true;
                  const canonical = showAnswers
                    ? session.revealedAnswers?.[step.id]
                    : undefined;
                  const studentAnswer = formatStudentAnswer(ans?.answer);
                  return (
                    <li
                      key={step.id}
                      className="border border-white/10 rounded-xl p-3 bg-slate-950/40"
                    >
                      <div className="flex items-start gap-2">
                        {isCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold mb-1">
                            Step {idx + 1}
                            {step.label ? ` · ${step.label}` : ''}
                          </p>
                          {step.question?.text && (
                            <p className="text-slate-400 text-xs mb-2">
                              {step.question.text}
                            </p>
                          )}
                          <p className="text-slate-200 text-sm">
                            <span className="text-slate-500">
                              Your answer:{' '}
                            </span>
                            {studentAnswer || (
                              <span className="italic text-slate-500">
                                No answer
                              </span>
                            )}
                          </p>
                          {showAnswers && !isCorrect && canonical && (
                            <p className="text-slate-200 text-sm mt-1 whitespace-pre-line">
                              <span className="text-slate-500">
                                Correct answer:{' '}
                              </span>
                              {canonical}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Stringify a stored student answer for display. Mirrors the format used
 *  by `revealedAnswers` so matching / sorting reads consistently. */
function formatStudentAnswer(answer: string | string[] | undefined): string {
  if (answer === undefined) return '';
  if (typeof answer === 'string') return answer;
  if (answer.length === 0) return '';
  // Matching is stored as "left:right" strings; expand the colon to an
  // arrow for readability and join with newlines so list-shaped answers
  // (sorting items) also render legibly.
  return answer
    .map((a) => (a.includes(':') ? a.replace(':', ' → ') : a))
    .join('\n');
}

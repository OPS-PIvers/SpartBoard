/**
 * QuizStudentApp — the student-facing quiz experience.
 * Accessible at /quiz?code=XXXXXX
 *
 * Flow (anonymous /join):
 *  1. Student is signed in anonymously on mount (no UI).
 *  2. Student enters quiz code + their roster PIN.
 *  3. Student waits in lobby for teacher to start.
 *  4. Questions are shown one by one as teacher advances.
 *  5. Student submits answers; teacher sees results.
 *
 * Flow (SSO `studentRole` from /my-assignments):
 *  1. Student is already signed in via custom token (claims.studentRole).
 *  2. Code is in the URL; PIN is unnecessary — identity = `auth.uid`.
 *  3. We auto-join on mount, bypassing both the PIN form and the period
 *     picker. SSO students are already linked to a class period via their
 *     classId, so classPeriod is irrelevant for the join — the response
 *     doc is keyed by `auth.uid` and the teacher's monitor view resolves
 *     the period from the classId via the roster.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  Timer,
  ArrowRight,
  ChevronLeft,
  Trophy,
  AlertCircle,
  Flame,
  Zap,
  X as XIcon,
  Check,
  Unlock as UnlockIcon,
  ShieldAlert,
} from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  useQuizSessionStudent,
  normalizeAnswer,
  SessionEndedError,
} from '@/hooks/useQuizSession';
import {
  shufflePublicQuestions,
  shuffleQuestionForStudent,
} from '@/utils/quizShuffle';
import { QuizSession, QuizPublicQuestion } from '@/types';
import { useDialog } from '@/context/useDialog';
import { StudentLeaderboard } from './StudentLeaderboard';
import { QuizPausedPlaceholder } from './QuizPausedPlaceholder';
import { MatchingResponseInput } from './MatchingResponseInput';
import { OrderingResponseInput } from './OrderingResponseInput';
import { TeacherPreviewBanner } from '@/components/student/TeacherPreviewBanner';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import {
  getScoreSuffix,
  isGamificationActive,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import {
  playCorrectChime,
  playIncorrectBuzz,
  playCountdownTick,
  playStreakSound,
} from '@/utils/quizAudio';

// ─── Root component ───────────────────────────────────────────────────────────

export const QuizStudentApp: React.FC = () => {
  // preview mode — see hooks/usePreviewMode
  const previewMode = usePreviewMode();

  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  // True iff `auth.currentUser` carries the `studentRole: true` custom claim
  // minted by `studentLoginV1`. Resolved at mount; used to drive the
  // auto-join branch in `QuizJoinFlow`. Anonymous joiners stay `false`.
  const [isStudentRole, setIsStudentRole] = useState(false);

  // Sign in anonymously on mount only when nobody is signed in yet — SSO
  // students arriving from `/my-assignments` already have a custom-token
  // user we must keep. This satisfies Firestore security rules
  // (`request.auth != null`) for direct `/quiz?code=…` visitors.
  useEffect(() => {
    if (previewMode) return;
    const init = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        const user = auth.currentUser;
        if (user && !user.isAnonymous) {
          // Probe custom claims once. We don't refresh here — `studentLoginV1`
          // is what minted these, and a stale token is fine for read-only
          // identity. The Firestore rules re-validate on every write.
          const tokenResult = await user.getIdTokenResult();
          setIsStudentRole(tokenResult.claims?.studentRole === true);
        }
      } catch (err) {
        console.warn('[QuizStudentApp] Auth init failed:', err);
        setAuthFailed(true);
      } finally {
        setAuthReady(true);
      }
    };
    void init();
  }, [previewMode]);

  if (previewMode) {
    return <QuizPreviewLobby />;
  }

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

  return <QuizJoinFlow isStudentRole={isStudentRole} />;
};

// ─── Preview lobby ────────────────────────────────────────────────────────────

/** Static read-only preview of the quiz join form — no hooks, no auth, no
 * submission. Mounted when the URL carries `?preview=1` so a teacher can
 * verify what students will see without their Firebase Auth session being
 * touched by `signInAnonymously` or the SSO auto-join path. */
const QuizPreviewLobby: React.FC = () => {
  const urlCode =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('code') ?? '');

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <TeacherPreviewBanner />
      <div className="flex-1 flex flex-col items-center justify-center p-6">
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

          <div className="space-y-4" aria-hidden="true">
            <input
              type="text"
              value={urlCode}
              readOnly
              tabIndex={-1}
              placeholder="Quiz Code (XXXXXX)"
              className="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white text-xl font-black font-mono tracking-widest text-center uppercase placeholder-slate-600 focus:outline-none cursor-default"
            />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              placeholder="Your PIN"
              className="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white text-xl font-black font-mono tracking-widest text-center placeholder-slate-600 focus:outline-none cursor-default"
            />
            <button
              type="button"
              disabled
              tabIndex={-1}
              className="w-full py-4 bg-violet-600 disabled:opacity-50 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
            >
              Join <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Join flow ────────────────────────────────────────────────────────────────

const QuizJoinFlow: React.FC<{ isStudentRole: boolean }> = ({
  isStudentRole,
}) => {
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('code') ?? '';

  const [code, setCode] = useState(urlCode);
  const [pin, setPin] = useState('');
  const [joined, setJoined] = useState(false);

  // Period selection step: after entering code+PIN, anon students always pick
  // their class period before joining (PIN+period is the disambiguator on the
  // response doc key). SSO joiners skip this step entirely.
  const [periodStep, setPeriodStep] = useState<string[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  // SSO joiners auto-join on mount (no PIN). This guard prevents the effect
  // below from triggering twice in StrictMode and keeps the form invisible
  // while the lookup+join is in flight.
  const ssoAutoJoinStartedRef = useRef(false);
  // Local error state for SSO auto-join. The hook's `error` state only fires
  // from `joinQuizSession` itself; if `lookupSession` throws first (network
  // failure, Firestore unavailable) the hook stays silent, so without this
  // the student would sit on the "Joining quiz…" loader forever.
  const [ssoAutoJoinError, setSsoAutoJoinError] = useState<string | null>(null);

  const {
    session,
    myResponse,
    loading,
    error,
    lookupSession,
    joinQuizSession,
    subscribeForReview,
    submitAnswer,
    completeQuiz,
    reportTabSwitch,
    warningCount,
  } = useQuizSessionStudent();

  const handleJoin = useCallback(
    async (joinCode: string, joinPin: string) => {
      // Anon (PIN) joiners must always disambiguate by period — same PIN can
      // recur across periods, and `pin-{period}-{pin}` is what keys the
      // response doc. Show the picker whenever the assignment declares any
      // periods, even when there is only one. (handleJoin is only reached on
      // the anon path; the SSO auto-join effect short-circuits before render.)
      let sessionInfo: Awaited<ReturnType<typeof lookupSession>>;
      try {
        sessionInfo = await lookupSession(joinCode);
      } catch (err) {
        // If a previous attempt advanced the form to the period picker and
        // the next lookup throws (network blip, code re-entered), reset the
        // form back to the code/PIN screen so the user isn't trapped on a
        // stale picker showing the hook's `error` text. The hook's own
        // error state surfaces below the form.
        setPeriodStep(null);
        throw err;
      }
      const periods = sessionInfo?.periodNames ?? [];
      if (periods.length > 0) {
        setPeriodStep(periods);
        return;
      }
      // No periods configured — join with classPeriod undefined.
      await joinQuizSession(joinCode, joinPin, undefined);
      setJoined(true);
    },
    [lookupSession, joinQuizSession]
  );

  const handlePeriodConfirm = useCallback(async () => {
    if (!selectedPeriod) return;
    // Only anonymous joiners reach the period picker (SSO students auto-join
    // via the effect below and skip period selection entirely), so PIN is
    // always populated here. The hook keys their response doc by
    // `pin-{period}-{pin}`.
    await joinQuizSession(code, pin, selectedPeriod);
    setJoined(true);
  }, [joinQuizSession, code, pin, selectedPeriod]);

  // SSO auto-join: bypass the PIN form AND the period picker entirely. SSO
  // students arrive with a stable identity (auth.uid via /student/login),
  // already matched to their class via classId — so the response doc is
  // keyed by auth.uid and classPeriod is irrelevant for join. The teacher
  // monitor view can resolve a student's period from their classId via the
  // roster if it needs to group by period.
  useEffect(() => {
    if (!isStudentRole) return;
    if (!urlCode) return;
    if (joined) return;
    if (ssoAutoJoinStartedRef.current) return;
    ssoAutoJoinStartedRef.current = true;

    const run = async () => {
      try {
        await joinQuizSession(urlCode, undefined, undefined);
        setJoined(true);
      } catch (err) {
        // If the session has already ended, fall back to read-only review
        // mode so the student can see their published score / responses /
        // answers from the `/my-assignments` Completed list. Branch on the
        // typed sentinel rather than the error message — the latter would
        // silently break the fallback if the copy ever changes. Other join
        // failures (no such code, network error, etc.) bubble up to the
        // existing error UI.
        if (err instanceof SessionEndedError) {
          try {
            await subscribeForReview(urlCode);
            setJoined(true);
            return;
          } catch (reviewErr) {
            console.warn(
              '[QuizStudentApp] subscribeForReview fallback failed:',
              reviewErr
            );
          }
        }
        console.warn('[QuizStudentApp] SSO auto-join failed:', err);
        // Surface the failure to the UI. The hook's own `error` state will
        // also be populated, and the render branch below prefers that more
        // detailed message when available.
        const message =
          err instanceof Error
            ? err.message
            : "We couldn't load your quiz. Please refresh and try again.";
        setSsoAutoJoinError(message);
        // Re-arm so a retry button (if added later) can re-trigger.
        ssoAutoJoinStartedRef.current = false;
      }
    };
    void run();
  }, [isStudentRole, urlCode, joined, joinQuizSession, subscribeForReview]);

  const isViewOnly = session?.mode === 'view-only';

  // Subscribe to auth so the view-log effect re-runs when anon sign-in
  // resolves; `auth.currentUser` alone is non-reactive.
  const [authedUid, setAuthedUid] = useState<string | null>(
    auth.currentUser?.uid ?? null
  );
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setAuthedUid(user?.uid ?? null));
  }, []);

  // View tracking — log each pageview of a view-only Share link as an
  // immutable doc in the session's `views/` subcollection. Best-effort and
  // fire-and-forget; the Firestore rule accepts a single `viewedAt` field.
  // The `wroteViewRef` guard prevents duplicate writes from React StrictMode
  // double-invokes in dev and from unrelated session-doc field changes that
  // re-run the effect (e.g. teacher status flips). The contract is "URL
  // opens, refresh-inflation accepted" — but a single mount = one write.
  const wroteViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isViewOnly || !session?.id || !authedUid) return;
    if (wroteViewRef.current === session.id) return;
    wroteViewRef.current = session.id;
    const sessionId = session.id;
    void addDoc(collection(db, 'quiz_sessions', sessionId, 'views'), {
      viewedAt: serverTimestamp(),
    }).catch((err) => {
      // logError (not warn) so a sustained 100% failure rate — e.g.
      // schema drift breaking the rule's keys().hasOnly check — surfaces in
      // any error-level log filter rather than getting lost in warn noise.
      logError('QuizStudentApp.viewLog', err, { sessionId });
    });
  }, [isViewOnly, session?.id, authedUid]);

  const handleAnswer = useCallback(
    async (questionId: string, answer: string, speedBonus?: number) => {
      // View-only shares never persist responses — the Firestore rule
      // rejects the write defense-in-depth, but skip it client-side too so
      // the console stays clean.
      if (isViewOnly) return;
      await submitAnswer(questionId, answer, speedBonus);
    },
    [submitAnswer, isViewOnly]
  );

  const handleComplete = useCallback(async () => {
    if (isViewOnly) return;
    await completeQuiz();
  }, [completeQuiz, isViewOnly]);

  // Auto-join only works when a code AND a pin are both known. Since pin comes
  // from a form field there's no auto-join on URL code alone — the student
  // must always enter their PIN manually.
  // (If you want URL-based pin support: ?code=XXXXXX&pin=01 is an option for
  // future work, but not implemented here to avoid leaking PINs in URL logs.)

  // Period selection step — shown to anon joiners when the session declares
  // any class periods. SSO joiners skip this and join via the auto-join effect.
  if (periodStep && !joined) {
    return (
      // Outer wrapper owns the scroll: body has `overflow: hidden` globally
      // (index.css), so a `min-h-screen` child can't trigger document scroll
      // when the period list is taller than the viewport. We give the outer
      // an explicit viewport height + `overflow-y-auto`, then let the inner
      // grow past 100% via `min-h-full` — content centers when it fits and
      // the outer scrolls when it doesn't (e.g. teacher with 8+ periods on
      // a phone-sized viewport).
      <div className="h-screen overflow-y-auto bg-slate-900">
        <div className="min-h-full flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-center mb-8">
              <ClipboardList className="w-5 h-5 text-violet-400 mr-2" />
              <span className="text-sm text-slate-300 font-semibold">
                Student Quiz
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
                      ? 'bg-violet-600 text-white ring-2 ring-violet-400'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                // joinQuizSession re-throws after populating `error` state for
                // the UI. Catch here so the rejection isn't an unhandled
                // promise — `void` would only silence the linter, not handle
                // the rejection.
                handlePeriodConfirm().catch((err: unknown) => {
                  console.warn('[QuizStudentApp] Period confirm failed:', err);
                });
              }}
              disabled={loading || !selectedPeriod}
              className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
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
      </div>
    );
  }

  // Not yet joined
  if (!joined || !session) {
    // SSO students never see the PIN form — the auto-join effect above
    // handles them. Show a quiet loader (or the error if lookup/join
    // failed) until `joined` flips. Periods picker is rendered earlier in
    // the function and short-circuits before we reach this branch.
    //
    // Prefer the hook's `error` (more specific, e.g. attempt-limit reached)
    // when available, falling back to `ssoAutoJoinError` which captures
    // failures from `lookupSession` that never reach the hook.
    if (isStudentRole) {
      const ssoError = error ?? ssoAutoJoinError;
      if (ssoError) {
        return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-slate-300 text-sm text-center max-w-sm">
              {ssoError}
            </p>
          </div>
        );
      }
      return <FullPageLoader message="Joining quiz…" />;
    }
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
              // joinQuizSession re-throws after populating `error` state for
              // the UI. Catch here so the rejection isn't an unhandled
              // promise — `void` would only silence the linter, not handle
              // the rejection.
              handleJoin(code, pin).catch((err: unknown) => {
                console.warn('[QuizStudentApp] Join failed:', err);
              });
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

  // Paused — teacher has temporarily paused the session. URL is still live,
  // submissions are blocked until the session is resumed.
  if (session.status === 'paused') {
    return <QuizPausedPlaceholder session={session} pin={pin} />;
  }

  // Waiting room
  if (session.status === 'waiting') {
    return <WaitingRoom session={session} pin={pin} />;
  }

  // Active quiz — already-completed gate.
  //
  // Two paths reach the wait screen instead of the question flow:
  //   1. The student's response is `status: 'completed'` (normal post-submit).
  //   2. The student is at or past the session's attempt cap, regardless of
  //      the response's current status. This is defense in depth: if any
  //      bug ever resets a capped response back to `'joined'` (e.g. a stale
  //      counter, a partial finalize, a future refactor that changes the
  //      reset path), the UI still refuses to render the questions. The
  //      `completeQuiz` transaction blocks a second submit too, but a
  //      student briefly seeing a question they can't submit would be
  //      confusing — short-circuiting at the UI is the cleaner UX.
  const attemptLimit = session.attemptLimit ?? null;
  const completedCount = myResponse?.completedAttempts ?? 0;
  const atCap = attemptLimit !== null && completedCount >= attemptLimit;
  if (
    session.status === 'active' &&
    myResponse &&
    (myResponse.status === 'completed' || atCap)
  ) {
    return (
      <QuizSubmittedWaitScreen
        session={session}
        myResponse={myResponse}
        pin={pin}
      />
    );
  }

  if (session.status === 'active') {
    // Wait for the student's response doc to load before rendering the
    // active quiz UI. The per-attempt shuffle seed depends on
    // `myResponse.completedAttempts`, so rendering before the snapshot
    // arrives would briefly use `attempt-0` and then visibly reorder once
    // the real attempt index loaded — confusing on retakes.
    if (!myResponse) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Loading your quiz…</p>
        </div>
      );
    }

    const publicQuestions = session.publicQuestions ?? [];
    const currentQ =
      session.currentQuestionIndex >= 0
        ? publicQuestions[session.currentQuestionIndex]
        : undefined;

    // Show review phase (leaderboard / answer review between questions)
    if (session.questionPhase === 'reviewing' && currentQ) {
      return (
        <ReviewPhase
          session={session}
          currentQuestion={currentQ}
          myResponse={myResponse}
        />
      );
    }

    const alreadyAnswered = currentQ
      ? myResponse.answers.some((a) => a.questionId === currentQ.id)
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
      session={session}
      myResponse={myResponse}
      answeredCount={(myResponse?.answers ?? []).length}
      totalQuestions={session.totalQuestions}
      pin={pin}
      myStudentUid={myResponse?.studentUid}
    />
  );
};

// ─── Waiting room ─────────────────────────────────────────────────────────────

const WaitingRoom: React.FC<{
  session: QuizSession;
  /** Empty string for SSO `studentRole` joiners — PIN line is hidden. */
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
    {pin && (
      <div className="p-4 bg-slate-800 rounded-xl">
        <p className="text-slate-300 text-sm">
          Joined as PIN{' '}
          <span className="font-semibold text-white font-mono">{pin}</span>
        </p>
      </div>
    )}
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
  // Show the "Your teacher unlocked your attempt" modal whenever the
  // student's response carries `unlocked: true` and they haven't yet
  // dismissed the prompt in this ActiveQuiz instance. The student keeps
  // their place and prior answers — dismissing simply reveals the
  // already-mounted quiz UI underneath.
  const [showResumeModal, setShowResumeModal] = useState(
    () => !!myResponse?.unlocked
  );
  // Track the previous unlocked value in state (not a ref) so we can
  // adjust state during render — the CLAUDE.md-blessed alternative to
  // an effect that watches a prop and calls a setter. Detects the
  // false→true edge so the prompt re-opens when the teacher unlocks
  // while the student is still on the active quiz screen.
  const isUnlockedNow = !!myResponse?.unlocked;
  const [prevUnlocked, setPrevUnlocked] = useState(isUnlockedNow);
  if (prevUnlocked !== isUnlockedNow) {
    setPrevUnlocked(isUnlockedNow);
    if (isUnlockedNow && !prevUnlocked) {
      setShowResumeModal(true);
    }
  }

  const isWarningShowingRef = useRef<boolean>(false);
  const lastReportTimeRef = useRef<number>(0);
  const didInitialCheckRef = useRef(false);

  const handleAutoSubmit = useCallback(
    async (reason: 'three-strikes' | 'post-unlock' = 'three-strikes') => {
      const message =
        reason === 'post-unlock'
          ? 'Your unlocked attempt is being submitted now.'
          : 'You have left the quiz 3 times. Your quiz is being auto-submitted.';
      await showAlert(message, {
        title: 'Quiz Auto-Submitted',
        variant: 'warning',
      });
      await onComplete();
    },
    [showAlert, onComplete]
  );

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

          // Teacher-unlocked attempts skip the "Warning N of 3" modal —
          // the student has already been told the next strike finalizes
          // their work, so any further tab-switch auto-submits
          // immediately (no warning, no delay).
          const wasUnlocked = !!myResponse?.unlocked;
          if (wasUnlocked) {
            setShowCheatWarning(false);
            // Fire-and-forget — but use a finally so a failed submit
            // (e.g. Firestore offline) doesn't leave the listener
            // permanently armed-off via `isWarningShowingRef`.
            void handleAutoSubmit('post-unlock').finally(() => {
              isWarningShowingRef.current = false;
            });
            return;
          }

          setShowCheatWarning(true);
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

    if (!didInitialCheckRef.current) {
      didInitialCheckRef.current = true;
      // Only count on a strong background signal to avoid false positives.
      if (document.visibilityState === 'hidden') {
        void handleVisibilityChange();
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
    };
  }, [
    tabWarningsEnabled,
    session.status,
    reportTabSwitch,
    handleAutoSubmit,
    myResponse?.status,
    myResponse?.unlocked,
  ]);

  // For student-paced mode, the student maintains their own local index
  const [localIndex, setLocalIndex] = useState(0);

  const isStudentPaced = session.sessionMode === 'student';
  const currentIndex = isStudentPaced
    ? localIndex
    : session.currentQuestionIndex;

  // Per-student answer shuffle. The session-level `publicQuestions` was
  // shuffled once teacher-side; we re-shuffle on the client deterministically
  // by student id so neighbours see different orders but a single student's
  // order stays stable across reload/back-nav.
  //
  // The seed includes `completedAttempts` so retakes get a fresh order: the
  // counter increments on every transition `in-progress → completed`, so a
  // student who finishes attempt 1 (counter 0 → 1) and re-joins for attempt
  // 2 picks up a new seed and walks through a different shuffle. Mid-attempt
  // refreshes / back-nav keep the same seed (the counter only moves on
  // submit) so the order stays stable while the attempt is in flight.
  //
  // The parent (QuizStudentAppContent) guards `ActiveQuiz` on myResponse
  // being non-null, so `completedAttempts` here always reflects the real
  // value — important for retakes, since otherwise the seed would default
  // to `attempt-0` before the snapshot arrived and visibly reorder once the
  // correct value appeared.
  const baseShuffleSeed =
    myResponse?.studentUid ?? auth.currentUser?.uid ?? 'anonymous-student';
  const attemptIndex = myResponse?.completedAttempts ?? 0;
  const studentShuffleSeed = `${baseShuffleSeed}:attempt-${attemptIndex}`;

  // Question-order shuffle. Only meaningful in self-paced mode — in
  // teacher-paced/auto sessions every student must be on the SAME question
  // when the teacher advances `currentQuestionIndex`, so reordering per
  // student would put the projected screen out of sync with student devices.
  // Legacy/in-flight sessions without the field default to off.
  const questionOrderShuffleEnabled =
    isStudentPaced && session.shuffleQuestions === true;
  const orderedPublicQuestions = useMemo(() => {
    if (!questionOrderShuffleEnabled) return session.publicQuestions;
    return shufflePublicQuestions(session.publicQuestions, studentShuffleSeed);
  }, [
    questionOrderShuffleEnabled,
    session.publicQuestions,
    studentShuffleSeed,
  ]);

  const baseQuestion = isStudentPaced
    ? orderedPublicQuestions[localIndex]
    : sessionQuestion;

  // Answer-option shuffle. Defaults to ON when the field is absent so legacy
  // sessions that pre-date this toggle keep their always-on behavior.
  const answerOptionShuffleEnabled = session.shuffleAnswerOptions !== false;
  const currentQuestion = useMemo(() => {
    if (!baseQuestion) return baseQuestion;
    if (!answerOptionShuffleEnabled) return baseQuestion;
    return shuffleQuestionForStudent(baseQuestion, studentShuffleSeed);
  }, [baseQuestion, answerOptionShuffleEnabled, studentShuffleSeed]);

  const alreadyAnswered = isStudentPaced
    ? (myResponse?.answers ?? []).some(
        (a) => a.questionId === currentQuestion?.id
      )
    : sessionAnswered;

  const initialTimeLimit = currentQuestion?.timeLimit ?? 0;
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fibAnswer, setFibAnswer] = useState('');
  const [draftMcAnswer, setDraftMcAnswer] = useState<string | null>(null);

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

  // Self-paced save errors. `saveError` surfaces a retry banner above the
  // NEXT/SUBMIT button when `onAnswer`/`onComplete` rejects (offline,
  // permission-denied, etc.). `advancingRef` is a synchronous re-entry guard
  // so a tap-storm can't double-fire `handleSubmitAndAdvance` in the window
  // between calling `setSubmitting(true)` and React committing the render.
  const [saveError, setSaveError] = useState<string | null>(null);
  const advancingRef = useRef(false);

  // Look up any prior answer the student has already saved for the current
  // question. Used both to hydrate UI state on back-navigation in self-paced
  // mode and to seed `StructuredQuestionInput` for matching/ordering revisits.
  const savedAnswerForCurrent = currentQuestion
    ? ((myResponse?.answers ?? []).find(
        (a) => a.questionId === currentQuestion.id
      )?.answer ?? null)
    : null;

  // Hydrate the answer controls from any saved answer so a previously-
  // answered question shows the student's prior choice. For MC we set
  // `draftMcAnswer` (not `selectedAnswer`) so the existing draft styling
  // highlights it and the NEXT button is enabled immediately. Inline so we
  // can call it from both the question-change branch (back-nav) and the
  // alreadyAnswered branch (page reload while answers are mid-load).
  const hydrateAnswerControls = (): void => {
    if (alreadyAnswered && savedAnswerForCurrent !== null) {
      setSelectedAnswer(savedAnswerForCurrent);
      setDraftMcAnswer(
        currentQuestion?.type === 'MC' ? savedAnswerForCurrent : null
      );
      setFibAnswer(
        currentQuestion?.type === 'FIB' ? savedAnswerForCurrent : ''
      );
    } else {
      setSelectedAnswer(null);
      setDraftMcAnswer(null);
      setFibAnswer('');
    }
  };

  // Derived state: full reset on question change, narrow update on alreadyAnswered flips.
  //
  // The two branches exist because their triggers race for SSO students:
  // their response doc is keyed by `auth.uid`, so the `myResponse` listener
  // fires from the local optimistic write before `setLocalIndex` advances.
  // If we naively re-ran the full reset on every `alreadyAnswered` flip, the
  // active submit-and-advance flow would briefly land in `submitted=true` on
  // the still-current question, swapping the button to the auto-submit
  // "NEXT QUESTION" fallback and forcing a second click. The narrow branch
  // skips the `submitted`/hydration updates while a submit is in flight;
  // when not in flight, we *do* hydrate so a page refresh mid-quiz (where
  // `myResponse` arrives after the initial mount) still highlights the
  // student's prior answer instead of leaving NEXT disabled.
  if (currentQuestion?.id !== prevQuestionId) {
    setPrevQuestionId(currentQuestion?.id);
    setPrevAlreadyAnswered(alreadyAnswered);
    setSubmitted(alreadyAnswered);
    setAutoSubmitTriggeredFor(null);
    setAnswerFeedback(null);
    setRevealedAnswer(null);
    setSpeedBonusEarned(null);
    setSaveError(null);
    hydrateAnswerControls();
    const tl = currentQuestion?.timeLimit ?? 0;
    setTimeLeft(tl > 0 && !alreadyAnswered ? tl : null);
  } else if (alreadyAnswered !== prevAlreadyAnswered) {
    // Gate the sentinel update with the same in-flight check as the visible
    // state. If we updated `prevAlreadyAnswered` here unconditionally, a flip
    // observed mid-flight (e.g., a submit-and-advance that ultimately fails
    // and never advances `localIndex`) would leave `submitted` stuck at the
    // pre-flip value with no way to reconcile on the next non-flight render —
    // because `prevAlreadyAnswered` would already match. Keeping them in
    // lockstep means the next non-flight render still has a chance to sync.
    if (!submitting && !advancingRef.current) {
      setPrevAlreadyAnswered(alreadyAnswered);
      setSubmitted(alreadyAnswered);
      hydrateAnswerControls();
    }
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
  const draftMcAnswerRef = useRef(draftMcAnswer);
  const onAnswerRef = useRef(onAnswer);
  // Live serialized answer for Matching/Ordering, written by the child
  // StructuredQuestionInput on every drag/tap so timer auto-submit can
  // capture partial placements instead of submitting the empty string.
  const structuredAnswerRef = useRef<string>('');

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
    selectedAnswerRef.current = selectedAnswer;
    fibAnswerRef.current = fibAnswer;
    draftMcAnswerRef.current = draftMcAnswer;
    onAnswerRef.current = onAnswer;
  }, [currentQuestion, selectedAnswer, fibAnswer, draftMcAnswer, onAnswer]);

  // Reset the structured answer ref when the question changes so a stale
  // answer from a previous question can't leak into auto-submit.
  const [prevStructuredQuestionId, setPrevStructuredQuestionId] = useState(
    currentQuestion?.id ?? null
  );
  if ((currentQuestion?.id ?? null) !== prevStructuredQuestionId) {
    setPrevStructuredQuestionId(currentQuestion?.id ?? null);
    structuredAnswerRef.current = '';
  }

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
    // Pull from the type-appropriate live ref so a half-completed
    // matching/ordering answer is preserved on timeout instead of
    // submitting the empty string.
    const answer =
      question.type === 'Matching' || question.type === 'Ordering'
        ? structuredAnswerRef.current
        : (selectedAnswerRef.current ??
          draftMcAnswerRef.current ??
          fibAnswerRef.current ??
          '');
    void onAnswerRef
      .current(
        autoSubmitTriggeredFor,
        answer,
        0 // Speed bonus is 0 when timer expires
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
        let isCorrect: boolean;
        if (currentQuestion?.type === 'Matching') {
          // Matching answers are order-insensitive pipe-delimited sets
          const correctSet = new Set(
            currentRevealed.split('|').map(normalizeAnswer)
          );
          const givenParts = studentAns.split('|').map(normalizeAnswer);
          isCorrect =
            givenParts.length === correctSet.size &&
            givenParts.every((p) => correctSet.has(p));
        } else {
          isCorrect =
            normalizeAnswer(studentAns) === normalizeAnswer(currentRevealed);
        }
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
        // Matching answers are order-insensitive pipe-delimited sets
        let isCorrect: boolean;
        if (currentQuestion.type === 'Matching') {
          const correctSet = new Set(revealed.split('|').map(normalizeAnswer));
          const givenParts = answer.split('|').map(normalizeAnswer);
          isCorrect =
            givenParts.length === correctSet.size &&
            givenParts.every((p) => correctSet.has(p));
        } else {
          isCorrect = normalizeAnswer(answer) === normalizeAnswer(revealed);
        }
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

        // Display speed bonus only when the answer was correct
        if (isCorrect && computedSpeedBonus != null && computedSpeedBonus > 0) {
          setSpeedBonusEarned(computedSpeedBonus);
        }
      }
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

  const handleBack = () => {
    if (isStudentPaced && localIndex > 0) {
      setLocalIndex(localIndex - 1);
    }
  };

  // Self-paced unified action: persist the answer, then advance (or complete
  // on the final question). Skips the per-question feedback banner — teachers
  // who want feedback should run the quiz in teacher-paced mode and reveal
  // answers manually.
  //
  // `advancingRef` is the synchronous re-entry guard (the `submitting` state
  // alone has a window between setSubmitting(true) and React committing).
  // On rejection we surface a retry banner via `saveError` instead of letting
  // the failure vanish into the console; the student's selection is still
  // intact (we never reset it on error) so the same tap retries.
  const handleSubmitAndAdvance = async (answer: string) => {
    if (advancingRef.current || submitting) return;
    // Self-paced revisits are intentional re-submissions — let them through
    // even when `submitted=true`. Teacher-paced still locks after first submit.
    if (submitted && !isStudentPaced) return;
    advancingRef.current = true;
    setSubmitting(true);
    setSaveError(null);
    try {
      let computedSpeedBonus: number | undefined;
      if (session.speedBonusEnabled && currentQuestion.timeLimit > 0) {
        const remaining = Math.max(0, timeLeft ?? 0);
        const bonusPct = Math.round(
          (remaining / currentQuestion.timeLimit) * 50
        );
        if (bonusPct > 0) computedSpeedBonus = bonusPct;
      }

      try {
        await onAnswer(currentQuestion.id, answer, computedSpeedBonus);
      } catch (err) {
        console.error(
          '[QuizStudentApp] onAnswer failed for question',
          currentQuestion.id,
          err
        );
        setSaveError("Couldn't save your answer. Tap to try again.");
        return;
      }

      const isLast = currentIndex >= session.totalQuestions - 1;
      if (isLast) {
        setSelectedAnswer(answer);
        setSubmitted(true);
        if (myResponse?.status !== 'completed') {
          try {
            await onComplete();
          } catch (err) {
            console.error('[QuizStudentApp] onComplete failed:', err);
            setSubmitted(false);
            setSaveError("Couldn't submit your quiz. Tap to try again.");
          }
        }
      } else {
        setLocalIndex(localIndex + 1);
      }
    } finally {
      setSubmitting(false);
      advancingRef.current = false;
    }
  };

  const progress = ((currentIndex + 1) / session.totalQuestions) * 100;

  // Choices are pre-shuffled in publicQuestions by the teacher side
  const options =
    currentQuestion.type === 'MC' ? (currentQuestion.choices ?? []) : [];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col relative">
      {/* The "your teacher unlocked your attempt" prompt — covers the quiz
          UI on first render after a teacher unlock so the student knows
          what happened before they touch anything. */}
      {showResumeModal && (
        <div className="absolute inset-0 z-overlay bg-emerald-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <UnlockIcon className="w-20 h-20 text-emerald-300 mb-6" />
          <h2 className="text-4xl font-black text-white mb-4">
            Attempt Unlocked
          </h2>
          <p className="text-emerald-100 text-lg max-w-md mb-2">
            Your teacher reopened your attempt. Your previous answers are still
            here — pick up where you left off.
          </p>
          <p className="text-amber-200 text-sm max-w-md mb-8">
            ⚠ The next time you leave this tab or open the quiz in another
            window, your work will be submitted automatically. No further
            warnings.
          </p>
          <button
            onClick={() => setShowResumeModal(false)}
            className="px-8 py-4 bg-white text-emerald-900 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Resume Quiz
          </button>
        </div>
      )}

      {/* Persistent "one strike and you're out" banner — visible for the
          duration of the resumed attempt so the rule stays top-of-mind. */}
      {myResponse?.unlocked && !showResumeModal && (
        <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/40 text-amber-200 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Your teacher unlocked your attempt.{' '}
            <strong>Leaving this tab once more will submit your quiz</strong> —
            no further warnings.
          </span>
        </div>
      )}

      {/* 🔴 The Cheating Warning Modal */}
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
          <div className="flex items-center gap-2">
            {isStudentPaced &&
              localIndex > 0 &&
              myResponse?.status !== 'completed' && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Previous question"
                  className="p-1 -ml-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            <span className="text-xs text-slate-500">
              {currentIndex + 1} / {session.totalQuestions}
            </span>
          </div>
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
              // Self-paced revisits stay editable, so we use the draft styling
              // (and `draftMcAnswer` highlight) even when `submitted=true`.
              const isLocked = submitted && !isStudentPaced;
              const isSelected = isLocked
                ? selectedAnswer === opt
                : draftMcAnswer === opt;
              let cls =
                'w-full text-left px-5 py-4 rounded-2xl border-2 text-sm font-medium transition-all ';
              if (!isLocked) {
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
                  onClick={() => !isLocked && setDraftMcAnswer(opt)}
                  disabled={isLocked || submitting}
                  className={cls}
                >
                  {opt}
                </button>
              );
            })}

            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3">
              {isStudentPaced ? (
                submitted && currentIndex >= session.totalQuestions - 1 ? (
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-300 text-sm font-bold">
                      Quiz complete!
                    </p>
                  </div>
                ) : submitted &&
                  autoSubmitTriggeredFor === currentQuestion.id ? (
                  // Timeout-auto-submit fallback: timer expired without an
                  // answer; give the student a way to advance. Only fires for
                  // questions the timer actually ran out on, not back-nav
                  // revisits (which keep the editable NEXT button below).
                  <button
                    onClick={handleNext}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                  >
                    NEXT QUESTION <ArrowRight className="w-5 h-5" />
                  </button>
                ) : (
                  <>
                    {saveError && <SaveErrorBanner message={saveError} />}
                    <button
                      onClick={() =>
                        draftMcAnswer &&
                        void handleSubmitAndAdvance(draftMcAnswer)
                      }
                      disabled={!draftMcAnswer || submitting}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : currentIndex >= session.totalQuestions - 1 ? (
                        <>
                          {saveError ? 'Retry Submit' : 'SUBMIT'}{' '}
                          <CheckCircle2 className="w-5 h-5" />
                        </>
                      ) : (
                        <>
                          {saveError ? 'Retry' : 'NEXT'}{' '}
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </>
                )
              ) : !submitted ? (
                <button
                  onClick={() =>
                    draftMcAnswer && void handleSubmit(draftMcAnswer)
                  }
                  disabled={!draftMcAnswer || submitting}
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
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-300 text-sm font-bold">
                      {currentIndex < session.totalQuestions - 1
                        ? 'Waiting for teacher…'
                        : 'Quiz complete!'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentQuestion.type === 'FIB' && (
          <div className="space-y-4 flex-1">
            <input
              type="text"
              value={fibAnswer}
              onChange={(e) => setFibAnswer(e.target.value)}
              disabled={submitted && !isStudentPaced}
              placeholder="Type your answer…"
              className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:ring-0 focus:border-violet-500 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const trimmed = fibAnswer.trim();
                if (!trimmed) return;
                if (isStudentPaced) {
                  void handleSubmitAndAdvance(trimmed);
                } else if (!submitted) {
                  void handleSubmit(trimmed);
                }
              }}
            />
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3">
              {isStudentPaced ? (
                submitted && currentIndex >= session.totalQuestions - 1 ? (
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-300 text-sm font-bold">
                      Quiz complete!
                    </p>
                  </div>
                ) : submitted &&
                  autoSubmitTriggeredFor === currentQuestion.id ? (
                  <button
                    onClick={handleNext}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                  >
                    NEXT QUESTION <ArrowRight className="w-5 h-5" />
                  </button>
                ) : (
                  <>
                    {saveError && <SaveErrorBanner message={saveError} />}
                    <button
                      onClick={() =>
                        fibAnswer.trim() &&
                        void handleSubmitAndAdvance(fibAnswer.trim())
                      }
                      disabled={!fibAnswer.trim() || submitting}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : currentIndex >= session.totalQuestions - 1 ? (
                        <>
                          {saveError ? 'Retry Submit' : 'SUBMIT'}{' '}
                          <CheckCircle2 className="w-5 h-5" />
                        </>
                      ) : (
                        <>
                          {saveError ? 'Retry' : 'NEXT'}{' '}
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </>
                )
              ) : !submitted ? (
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
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-300 text-sm font-bold">
                      {currentIndex < session.totalQuestions - 1
                        ? 'Waiting for teacher…'
                        : 'Quiz complete!'}
                    </p>
                  </div>
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
            isAutoSubmitted={autoSubmitTriggeredFor === currentQuestion.id}
            savedAnswer={savedAnswerForCurrent}
            onSubmit={(answer) => void handleSubmit(answer)}
            onSubmitAndAdvance={(answer) => void handleSubmitAndAdvance(answer)}
            onAnswerChange={(answer) => {
              structuredAnswerRef.current = answer;
            }}
            submitting={submitting}
            isStudentPaced={isStudentPaced}
            isLastQuestion={currentIndex >= session.totalQuestions - 1}
            onNext={handleNext}
            saveError={saveError}
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
  isAutoSubmitted: boolean;
  savedAnswer: string | null;
  onSubmit: (answer: string) => void;
  onSubmitAndAdvance: (answer: string) => void;
  /**
   * Forwarded to the parent so it can keep a ref to the live partial answer.
   * Timer auto-submit reads from this ref to preserve the student's work
   * when the clock runs out mid-placement.
   */
  onAnswerChange?: (answer: string) => void;
  submitting: boolean;
  isStudentPaced: boolean;
  isLastQuestion: boolean;
  onNext: () => void;
  saveError?: string | null;
}> = ({
  question,
  submitted,
  isAutoSubmitted,
  savedAnswer,
  onSubmit,
  onSubmitAndAdvance,
  onAnswerChange,
  submitting,
  isStudentPaced,
  isLastQuestion,
  onNext,
  saveError,
}) => {
  const isMatching = question.type === 'Matching';

  // Items come from the pre-computed public question fields — no correctAnswer needed
  const leftItems: string[] = isMatching
    ? (question.matchingLeft ?? [])
    : (question.orderingItems ?? []);

  // Live serialized answer driven by the structured input components below.
  // `canSubmit` derives from this string: every term/slot must be filled
  // (the structured inputs emit blank segments — `term:` or `||` — when a
  // zone is empty, so we check for any blank token).
  const [currentAnswer, setCurrentAnswer] = useState<string>(savedAnswer ?? '');

  // Mirror every change up to the parent ref so timer auto-submit can
  // capture partial placements. We can't use the inline setter (the parent
  // stores the value in a useRef, not state) so an explicit propagation
  // call is required.
  const handleAnswerChange = (answer: string) => {
    setCurrentAnswer(answer);
    onAnswerChange?.(answer);
  };

  // Seed the parent ref with the hydrated savedAnswer on mount so timer
  // auto-submit on a never-touched revisit still preserves the saved work.
  useEffect(() => {
    if (savedAnswer) onAnswerChange?.(savedAnswer);
    // Intentionally only on mount — the child component's onChange covers
    // every subsequent update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    if (!currentAnswer) return false;
    const segments = currentAnswer.split('|');
    if (isMatching) {
      if (segments.length !== leftItems.length) return false;
      return segments.every((s) => {
        const sep = s.indexOf(':');
        return sep >= 0 && s.slice(sep + 1).length > 0;
      });
    }
    return (
      segments.length === leftItems.length &&
      segments.every((s) => s.length > 0)
    );
  }, [currentAnswer, isMatching, leftItems.length]);

  const handleSubmitStructured = () => {
    if (isStudentPaced) {
      onSubmitAndAdvance(currentAnswer);
    } else {
      onSubmit(currentAnswer);
    }
  };

  // Self-paced revisits stay editable. We only switch out of the form for
  // (a) the post-completion "Quiz complete!" placeholder on the last
  // question, or (b) the timeout fallback when the timer auto-submitted
  // without an answer.
  const showEditableForm = isStudentPaced
    ? !(submitted && isLastQuestion) && !(submitted && isAutoSubmitted)
    : !submitted;

  return (
    <div className="space-y-4 flex-1">
      {showEditableForm ? (
        <>
          {isMatching ? (
            <MatchingResponseInput
              question={question}
              savedAnswer={savedAnswer}
              onChange={handleAnswerChange}
              disabled={submitting}
            />
          ) : (
            <OrderingResponseInput
              question={question}
              savedAnswer={savedAnswer}
              onChange={handleAnswerChange}
              disabled={submitting}
            />
          )}

          {isStudentPaced && saveError && (
            <SaveErrorBanner message={saveError} />
          )}
          <button
            onClick={handleSubmitStructured}
            disabled={!canSubmit || submitting}
            className={`w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
              isStudentPaced
                ? 'bg-emerald-600 hover:bg-emerald-500 font-black shadow-lg active:scale-95'
                : 'bg-violet-600 hover:bg-violet-500'
            }`}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isStudentPaced ? (
              isLastQuestion ? (
                <>
                  {saveError ? 'Retry Submit' : 'SUBMIT'}{' '}
                  <CheckCircle2 className="w-5 h-5" />
                </>
              ) : (
                <>
                  {saveError ? 'Retry' : 'NEXT'}{' '}
                  <ArrowRight className="w-5 h-5" />
                </>
              )
            ) : (
              'Submit Answer'
            )}
          </button>
        </>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          {isStudentPaced && isAutoSubmitted && !isLastQuestion ? (
            // Timeout-auto-submit fallback for self-paced: timer expired
            // without an answer; give the student a way to advance.
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

// ─── Save-error banner (self-paced retry affordance) ────────────────────────

const SaveErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm flex items-center gap-2"
  >
    <AlertCircle className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);

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

// ─── Review phase (between-question leaderboard / answer review) ────────────

const ReviewPhase: React.FC<{
  session: QuizSession;
  currentQuestion: QuizPublicQuestion;
  myResponse: ReturnType<typeof useQuizSessionStudent>['myResponse'];
}> = ({ session, currentQuestion, myResponse }) => {
  const gamificationEnabled = isGamificationActive(session);
  const revealed = session.revealedAnswers?.[currentQuestion.id];
  const myAnswer = myResponse?.answers.find(
    (a) => a.questionId === currentQuestion.id
  );

  let isCorrect: boolean | null = null;
  if (myAnswer && revealed) {
    if (currentQuestion.type === 'Matching') {
      const correctSet = new Set(revealed.split('|').map(normalizeAnswer));
      const givenParts = myAnswer.answer.split('|').map(normalizeAnswer);
      isCorrect =
        givenParts.length === correctSet.size &&
        givenParts.every((p) => correctSet.has(p));
    } else {
      isCorrect =
        normalizeAnswer(myAnswer.answer) === normalizeAnswer(revealed);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      {/* Question recap */}
      <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">
        Question {session.currentQuestionIndex + 1} of {session.totalQuestions}
      </p>
      <h2 className="text-lg font-bold text-white mb-6 leading-snug max-w-md">
        {currentQuestion.text}
      </h2>

      {/* Correct answer */}
      {revealed && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl mb-4 max-w-sm w-full">
          <p className="text-emerald-400 font-bold text-sm">
            <Check className="w-4 h-4 inline-block mr-1 -mt-0.5" />
            {revealed}
          </p>
        </div>
      )}

      {/* Student's result */}
      {isCorrect !== null && (
        <div
          className={`text-lg font-black mb-6 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isCorrect ? (
            <>
              <CheckCircle2 className="w-5 h-5 inline-block mr-1 -mt-0.5" /> You
              got it right!
            </>
          ) : (
            <>
              <XIcon className="w-5 h-5 inline-block mr-1 -mt-0.5" /> Better
              luck next time!
            </>
          )}
        </div>
      )}

      {gamificationEnabled && session.liveLeaderboard ? (
        <div className="w-full flex flex-col items-center gap-4">
          <StudentLeaderboard
            entries={session.liveLeaderboard}
            myPin={myResponse?.pin ?? ''}
            myStudentUid={myResponse?.studentUid}
            scoreSuffix={getScoreSuffix(session)}
          />
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for teacher to continue...
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for teacher to continue...
        </div>
      )}
    </div>
  );
};

const ResultsScreen: React.FC<{
  session: QuizSession;
  myResponse: ReturnType<typeof useQuizSessionStudent>['myResponse'];
  answeredCount: number;
  totalQuestions: number;
  pin: string;
  /** Auth uid — used by `StudentLeaderboard` to highlight the SSO student's row. */
  myStudentUid?: string;
}> = ({
  session,
  myResponse,
  answeredCount,
  totalQuestions,
  pin,
  myStudentUid,
}) => {
  const visibility = session.scoreVisibility ?? 'none';
  const showReview = visibility !== 'none' && !!myResponse;

  if (showReview) {
    return (
      <PublishedScoreReview
        session={session}
        myResponse={myResponse}
        visibility={visibility}
        pin={pin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <Trophy className="w-16 h-16 text-amber-400 mb-6" />
      <h1 className="text-3xl font-black text-white mb-2">Quiz Complete!</h1>
      <p className="text-slate-400 text-sm mb-8">
        {pin ? (
          <>
            Great job, PIN{' '}
            <span className="font-mono font-bold text-white">{pin}</span>!
          </>
        ) : (
          'Great job!'
        )}
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

      {isGamificationActive(session) && session.liveLeaderboard && (
        <div className="mt-8 w-full flex justify-center">
          <StudentLeaderboard
            entries={session.liveLeaderboard}
            myPin={pin}
            myStudentUid={myStudentUid}
            scoreSuffix={getScoreSuffix(session)}
          />
        </div>
      )}
    </div>
  );
};

// ─── Published-score review ──────────────────────────────────────────────────
//
// Rendered on the post-end results screen when the teacher has flipped
// `scoreVisibility` on the session via the archive's "Publish Scores" kebab
// action. The three modes are progressive disclosure:
//
//   - score-only: top card with the percentage + correct/total tally.
//   - score-and-responses: above + per-question rows showing each of the
//     student's answers tagged correct (green) or incorrect (red), but
//     never the canonical correct answer.
//   - score-responses-and-answers: above + the canonical correct answer
//     under each row, sourced from `session.revealedAnswers` (populated
//     atomically by `publishAssignmentScores`).
//
// All data the screen needs already lives on `myResponse` (score + each
// answer's `isCorrect`) and `session` (publicQuestions, revealedAnswers).
// We deliberately don't recompute correctness client-side — the teacher's
// publish step is the only writer for those fields, so a stale-cache
// student device can't manufacture a "correct" badge that isn't on the
// authoritative response doc.

const PublishedScoreReview: React.FC<{
  session: QuizSession;
  myResponse: NonNullable<
    ReturnType<typeof useQuizSessionStudent>['myResponse']
  >;
  visibility: NonNullable<QuizSession['scoreVisibility']>;
  pin: string;
}> = ({ session, myResponse, visibility, pin }) => {
  const showResponses =
    visibility === 'score-and-responses' ||
    visibility === 'score-responses-and-answers';
  const showAnswers = visibility === 'score-responses-and-answers';

  const scorePercent =
    typeof myResponse.score === 'number' ? myResponse.score : null;
  // Per-question correctness counts come straight off the authoritative
  // response — no client-side grading. Defensive default: a published
  // assignment with all-undefined `isCorrect` reads as 0 correct rather
  // than crashing.
  const answerById = new Map<string, (typeof myResponse.answers)[number]>();
  for (const a of myResponse.answers) {
    answerById.set(a.questionId, a);
  }
  const correctCount = myResponse.answers.filter(
    (a) => a.isCorrect === true
  ).length;
  const total = session.totalQuestions;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex flex-col items-center text-center">
          <Trophy className="mb-4 h-12 w-12 text-amber-400" />
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            Your Results
          </h1>
          <p className="mt-1 text-sm text-slate-400">{session.quizTitle}</p>
          {pin && (
            <p className="mt-1 text-xs text-slate-500">
              PIN <span className="font-mono text-slate-300">{pin}</span>
            </p>
          )}
        </header>

        {/* Score card — present at every visibility level. */}
        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
          {scorePercent !== null ? (
            <>
              <p className="text-5xl font-black text-white sm:text-6xl">
                {scorePercent}%
              </p>
              {/* Per-question tally counts only fully-correct answers, so it
                  can lag the percentage on quizzes that award partial credit
                  (Matching/Ordering with `allowPartialCredit`) or use non-1
                  point values. The "fully correct" qualifier makes the
                  potential gap between this line and the percentage above
                  legible to the student rather than appearing to contradict
                  it. */}
              <p className="mt-2 text-sm text-slate-400">
                {correctCount} of {total} fully correct
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-300">
              Your score is being prepared. Check back soon.
            </p>
          )}
        </section>

        {showResponses && (
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Your Answers
            </h2>
            <div className="flex flex-col gap-3">
              {(session.publicQuestions ?? []).map((q, idx) => {
                const ans = answerById.get(q.id);
                const studentAnswer = ans?.answer ?? '';
                const isCorrect = ans?.isCorrect === true;
                const isIncorrect = ans?.isCorrect === false;
                const correctAnswer = session.revealedAnswers?.[q.id];
                return (
                  <article
                    key={q.id}
                    className={`rounded-xl border bg-slate-800/60 p-4 ${
                      isCorrect
                        ? 'border-emerald-500/40'
                        : isIncorrect
                          ? 'border-red-500/40'
                          : 'border-slate-700'
                    }`}
                  >
                    <header className="mb-2 flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 font-mono text-[11px] font-bold text-slate-200">
                        {idx + 1}
                      </span>
                      <p className="flex-1 text-sm font-semibold text-slate-100">
                        {q.text}
                      </p>
                      {ans?.isCorrect === true && (
                        <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                      )}
                      {ans?.isCorrect === false && (
                        <XIcon className="h-5 w-5 shrink-0 text-red-400" />
                      )}
                    </header>
                    <div className="ml-7 space-y-1.5">
                      <p className="text-xs text-slate-400">
                        Your answer:{' '}
                        <span
                          className={`font-mono ${
                            isCorrect
                              ? 'text-emerald-300'
                              : isIncorrect
                                ? 'text-red-300'
                                : 'text-slate-200'
                          }`}
                        >
                          {studentAnswer
                            ? formatAnswerForDisplay(studentAnswer, q.type)
                            : '— no response'}
                        </span>
                      </p>
                      {showAnswers && correctAnswer && (
                        <p className="text-xs text-slate-400">
                          Correct answer:{' '}
                          <span className="font-mono text-emerald-300">
                            {formatAnswerForDisplay(correctAnswer, q.type)}
                          </span>
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!showResponses && (
          <p className="text-center text-xs text-slate-500">
            Your teacher published your score. Detailed responses aren&apos;t
            shared for this assignment.
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Format pipe-encoded matching/ordering answers for human display. MC/FIB
 * answers come through as plain strings and pass through untouched.
 *
 * Branch on `type` rather than sniffing the string for `:` — Ordering
 * items can legitimately contain colons (e.g. "9:00 AM", "H:O ratio")
 * that would otherwise be reformatted as "left → right" pairs.
 */
function formatAnswerForDisplay(
  raw: string,
  type: QuizPublicQuestion['type']
): string {
  if (type === 'Matching') {
    return raw
      .split('|')
      .map((pair) => {
        const sep = pair.indexOf(':');
        if (sep < 0) return pair;
        return `${pair.slice(0, sep)} → ${pair.slice(sep + 1)}`;
      })
      .join(', ');
  }
  if (type === 'Ordering') {
    return raw.split('|').join(', ');
  }
  return raw;
}

const QuizSubmittedWaitScreen: React.FC<{
  session: QuizSession;
  myResponse: NonNullable<
    ReturnType<typeof useQuizSessionStudent>['myResponse']
  >;
  pin: string;
}> = ({ session, myResponse, pin }) => {
  const autoSubmitted = (myResponse.tabSwitchWarnings ?? 0) >= 3;
  const scoreSuffix = getScoreSuffix(session);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-6" />
      <h1 className="text-3xl font-black text-white mb-2">Quiz Submitted!</h1>
      <p className="text-slate-400 text-sm mb-6">
        {pin ? (
          <>
            Great work, PIN{' '}
            <span className="font-mono font-bold text-white">{pin}</span>.
          </>
        ) : (
          'Great work.'
        )}
      </p>

      <div className="mb-6 p-5 bg-slate-800 rounded-2xl">
        <p className="text-4xl font-black text-white mb-2">
          {myResponse.answers.length}
        </p>
        <p className="text-slate-400 text-sm">
          of {session.totalQuestions} questions answered
        </p>
      </div>

      {autoSubmitted && (
        <div className="max-w-sm mb-6 p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-200 text-sm">
          Auto-submitted because you left the quiz tab 3 times.
        </div>
      )}

      {isGamificationActive(session) && session.liveLeaderboard && (
        <div className="mb-6 w-full flex justify-center">
          <StudentLeaderboard
            entries={session.liveLeaderboard}
            myPin={pin}
            myStudentUid={myResponse.studentUid}
            scoreSuffix={scoreSuffix}
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Waiting for teacher to end the quiz and show final results…
      </div>
    </div>
  );
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const FullPageLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
    <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
    <p className="text-slate-400 text-sm">{message}</p>
  </div>
);

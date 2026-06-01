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
  AttemptLimitReachedError,
} from '@/hooks/useQuizSession';
import {
  shufflePublicQuestions,
  shuffleQuestionForStudent,
} from '@/utils/quizShuffle';
import {
  QuizSession,
  QuizPublicQuestion,
  WrittenAnswerGrade,
  isWrittenQuestionType,
  isAnswerSubmitted,
} from '@/types';
import { sanitizeQuizResponse } from '@/utils/security';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { useDialog } from '@/context/useDialog';
import { StudentLeaderboard } from './StudentLeaderboard';
import { QuizPausedPlaceholder } from './QuizPausedPlaceholder';
import { MatchingResponseInput } from './MatchingResponseInput';
import { OrderingResponseInput } from './OrderingResponseInput';
import { TeacherPreviewBanner } from '@/components/student/TeacherPreviewBanner';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { ResultsWatermark } from './ResultsWatermark';
import { ResultsTabWarningModal } from './ResultsTabWarningModal';
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';
import { useFocusLossPoll } from '@/hooks/useFocusLossPoll';
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

// Lazy-load the rich-text editor so the bundle for legacy quiz types isn't
// pulled into the initial student-app payload. Loaded on first render of a
// short/essay question.
const WrittenResponseEditor = React.lazy(() =>
  import('./WrittenResponseEditor').then((m) => ({
    default: m.WrittenResponseEditor,
  }))
);

// ─── Root component ───────────────────────────────────────────────────────────

interface QuizStudentAppProps {
  /**
   * True when rendered inside the Google Classroom add-on iframe. Changes the
   * results lockout to an in-iframe "see your teacher" screen instead of
   * redirecting to the standalone /my-assignments page (which isn't designed
   * for the partitioned iframe). Threaded down to the results screens.
   */
  embedded?: boolean;
  /**
   * Watermark label for the otherwise-nameless studentRole (Classroom SSO)
   * session. Standalone routes (/join, /quiz, /my-assignments) leave this unset
   * and fall back to the auth displayName / PIN.
   */
  watermarkNameOverride?: string;
}

export const QuizStudentApp: React.FC<QuizStudentAppProps> = ({
  embedded = false,
  watermarkNameOverride,
}) => {
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
        // Wait for Firebase Auth to hydrate from IndexedDB before deciding
        // whether to sign in anonymously. `/my-assignments` → `/quiz` is a
        // full-page browser navigation, so on mount `auth.currentUser` is
        // null for the first tick or two even when IndexedDB holds an SSO
        // user. Without this await we'd race hydration: a synchronous null
        // check sends us into the signInAnonymously branch and silently
        // replaces the SSO user with a fresh anonymous one — breaking the
        // auto-join effect below and forcing SSO students into the PIN
        // form. See QuizStudentApp.ssoAutoJoin.test.tsx for the regression.
        await auth.authStateReady();
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

  return (
    <QuizJoinFlow
      isStudentRole={isStudentRole}
      embedded={embedded}
      watermarkNameOverride={watermarkNameOverride}
    />
  );
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

const QuizJoinFlow: React.FC<{
  isStudentRole: boolean;
  embedded: boolean;
  watermarkNameOverride?: string;
}> = ({ isStudentRole, embedded, watermarkNameOverride }) => {
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
        // Fall back to read-only review mode in two cases so the student can
        // see their published score / responses / answers:
        //   1. SessionEndedError — the session is over (the /my-assignments
        //      Completed path).
        //   2. AttemptLimitReachedError — the student already completed this
        //      quiz and is at the attempt cap, but the session is STILL active
        //      (a Google Classroom async attachment never gets "ended" by a
        //      live teacher). Without this, a completed student who reopens a
        //      published assignment hits the generic "attempt limit reached"
        //      error screen and can never reach the published-results gate —
        //      the exact symptom of grades being published but invisible until
        //      the teacher manually ends the session. Re-join threw BEFORE any
        //      reset, so the response is still `status: 'completed'` and the
        //      active-session gate renders PublishedScoreReview.
        // Branch on the typed sentinels rather than the error message — the
        // latter would silently break the fallback if the copy ever changes.
        // Other join failures (no such code, network error, etc.) bubble up to
        // the existing error UI.
        if (
          err instanceof SessionEndedError ||
          err instanceof AttemptLimitReachedError
        ) {
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
    async (
      questionId: string,
      answer: string,
      speedBonus?: number,
      opts?: { isDraft?: boolean }
    ) => {
      // View-only shares never persist responses — the Firestore rule
      // rejects the write defense-in-depth, but skip it client-side too so
      // the console stays clean.
      if (isViewOnly) return;
      await submitAnswer(questionId, answer, speedBonus, opts);
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
    // If the teacher has PUBLISHED results to students (scoreVisibility set on
    // the archived assignment via "Publish Scores"), a completed student should
    // see their results immediately — even while the session is still 'active'.
    // A self-paced / async assignment (e.g. a Google Classroom attachment) never
    // gets "ended" by a live teacher, so without this a completed student is
    // stranded on the "waiting for the teacher to end the quiz" screen and can
    // never see the score the teacher already published. Until results are
    // published (scoreVisibility 'none'), fall back to the submitted-wait
    // screen as before. Mirrors the post-end ResultsScreen branch.
    const publishedVisibility = session.scoreVisibility ?? 'none';
    if (publishedVisibility !== 'none' && myResponse.status === 'completed') {
      return (
        <PublishedScoreReview
          session={session}
          myResponse={myResponse}
          visibility={publishedVisibility}
          pin={pin}
          embedded={embedded}
          watermarkNameOverride={watermarkNameOverride}
        />
      );
    }
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

    // Drafts (debounced autosaves of written responses) don't count as
    // "answered" — the student is still typing. The completion gate only
    // fires on an explicit Submit, which writes `status: 'submitted'`.
    const alreadyAnswered = currentQ
      ? myResponse.answers.some(
          (a) => a.questionId === currentQ.id && isAnswerSubmitted(a)
        )
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
      embedded={embedded}
      watermarkNameOverride={watermarkNameOverride}
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
  onAnswer: (
    qId: string,
    answer: string,
    speedBonus?: number,
    opts?: { isDraft?: boolean }
  ) => Promise<void>;
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
      // Ask the inner question view to flush any pending written-response
      // autosave before we mark the response complete. Listened for in
      // `StudentQuestionView`'s flush handler. Without this, a strike-3
      // auto-submit fired within 500 ms of the student's last keystroke
      // could finalize the response with the previous (already-written)
      // draft and silently drop the most recent edits.
      document.dispatchEvent(new CustomEvent('spartboard:quiz:flush-written'));
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

  // Test integrity: when the teacher enabled "Block Copy & Paste", suppress
  // copy/cut/paste across the question + answer area so a student can't paste
  // a block of text composed in another tab. Default off (clipboard allowed).
  const blockCopyPaste = session.blockCopyPaste === true;
  const handleBlockedClipboard = (e: React.ClipboardEvent<HTMLDivElement>) =>
    e.preventDefault();
  const clipboardGuards = blockCopyPaste
    ? {
        onCopy: handleBlockedClipboard,
        onCut: handleBlockedClipboard,
        onPaste: handleBlockedClipboard,
      }
    : undefined;

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

  // Modern Chrome/Firefox don't fire `window.blur` when focus shifts to
  // the URL bar, bookmark dropdowns, or other browser-chrome targets, so
  // the listeners above miss those interactions. `document.hasFocus()`
  // still flips false in all those cases — `useFocusLossPoll` watches the
  // `true → false` edge on a 250 ms timer and dispatches a synthetic
  // `blur` so the existing `handleVisibilityChange` listener owns the
  // full response logic in one place (guard checks, debounce, increment,
  // modal). See `hooks/useFocusLossPoll.ts` for the snapshot-race the
  // first-mount-only seed protects against.
  // Gate the poll with the same stable conditions `handleVisibilityChange`
  // guards on (active session + not-yet-completed), mirroring
  // VideoActivityStudentApp's focusPollEnabled. Outside an active attempt the
  // poll shouldn't run a 250ms timer or dispatch synthetic blur events. The
  // `isWarningShowingRef` guard stays inside the handler (it's a ref).
  const focusPollEnabled =
    tabWarningsEnabled &&
    session.status === 'active' &&
    myResponse?.status !== 'completed';
  useFocusLossPoll({
    enabled: focusPollEnabled,
    onFocusLoss: () => window.dispatchEvent(new Event('blur')),
  });

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

  // Drafts don't count: a debounced autosave of a written-response in
  // progress must not flip `submitted` true and shouldn't trigger
  // `QuizCompleteCard`. Only explicit Submit writes `status: 'submitted'`.
  const alreadyAnswered = isStudentPaced
    ? (myResponse?.answers ?? []).some(
        (a) => a.questionId === currentQuestion?.id && isAnswerSubmitted(a)
      )
    : sessionAnswered;

  const initialTimeLimit = currentQuestion?.timeLimit ?? 0;
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-question live answer cache. Source of truth for editors and
  // inputs during a session — replaces the per-type live state slots
  // (writtenAnswer / fibAnswer / draftMcAnswer / structuredAnswerRef)
  // that used to be reset and re-hydrated from Firestore on every
  // question change. With the cache:
  //   - Navigation (next/back) reads from the cache. No Firestore round
  //     trip, no hydration race.
  //   - The Firestore snapshot only seeds the cache on demand — once
  //     per question, the first time it's visited with a saved value
  //     available. After that, the local value is authoritative.
  //   - The autosave path writes the cache value to Firestore in the
  //     background; student typing never depends on Firestore being
  //     current.
  //
  // Values are the canonical serialized form per type:
  //   - short / essay: sanitized HTML
  //   - MC: the chosen option string (absent if never clicked)
  //   - FIB: the typed string
  //   - Matching / Ordering: pipe-delimited serialization
  const [answerCache, setAnswerCache] = useState<Record<string, string>>({});
  // Narrow ref mirror of ONLY the current question's cached value — not the
  // whole cache. The two imperative readers below (the timer auto-submit
  // effect and the visibility/unmount flush handler) are scoped to `[]`/
  // single-dep effects and can't read render state, but each only ever needs
  // the ACTIVE question's draft. Mirroring the entire cache (potentially 60
  // multi-paragraph essay answers on a long assignment) through the ref gave
  // those readers a handle on far more than they use; the previous
  // `answerCacheRef.current = answerCache` was a reference alias, so it never
  // duplicated the answer text, but a single-entry ref keeps the imperative
  // paths honest about what they touch and the ref's retained graph O(1).
  // The `qid` tag lets those readers confirm the mirror still matches the
  // question they're acting on. Synced in the render body once `cachedDraft`
  // is computed (see below).
  const currentAnswerRef = useRef<{
    qid: string | undefined;
    value: string | undefined;
  }>({ qid: undefined, value: undefined });
  // Questions the student has locally edited this session. Once a question
  // is touched, the in-memory cache is authoritative for it: the
  // seed-from-server block below stops mirroring later snapshots into it so
  // a resync can't clobber an in-progress local edit. Untouched questions
  // keep tracking the freshest saved value, which keeps the autosave's
  // saved-equal short-circuit holding and prevents a stale seed from being
  // written back over a newer server answer.
  const touchedQuestionsRef = useRef<Set<string>>(new Set());
  // Questions whose cache entry was seeded from a Firestore saved value
  // (the seed-from-server block), NOT the student's own typing. The
  // `WrittenResponseEditor` seeds its `innerHTML` once on mount, so it must
  // remount when recovered text arrives after an empty mount — but it must
  // NOT remount when the student types the first character. Keying the
  // editor on general cache presence conflated the two and stole focus /
  // reset the caret on the first keystroke; keying on this set flips
  // `init`→`seeded` only for the recovery case.
  const seededQuestionsRef = useRef<Set<string>>(new Set());

  // Per-question draft autosave timer. Coalesces autosaves for every
  // answer type — dropping non-written answers on tab close was the
  // primary source of the originally reported quiz data loss.
  const draftAutosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Synchronize `savedAnswerForCurrent` into a ref from the render body so
  // the draft-flush effect (deps: []) compares against the live value
  // instead of the mount-time closure capture. Without this, a student who
  // types and triggers a save before closing the tab would see the flush
  // compare draft against null (initial saved value) instead of the actually
  // persisted draft — almost always benign because most diffs are nonzero,
  // but a flush-after-no-edit would still spuriously re-write.
  const savedAnswerForCurrentRef = useRef<string | null>(null);
  savedAnswerForCurrentRef.current = savedAnswerForCurrent;

  // Reset `selectedAnswer` on question change. The per-type live values
  // (what's currently typed/selected) now live in `answerCache` and are
  // populated by the seed-from-server block below — so there's
  // nothing per-question to wipe here besides the post-submit display
  // indicator.
  const hydrateAnswerControls = (): void => {
    setSelectedAnswer(
      alreadyAnswered && savedAnswerForCurrent !== null
        ? savedAnswerForCurrent
        : null
    );
  };

  // Seed-from-server for the current question. For any question the
  // student hasn't locally edited this session, mirror the freshest saved
  // value into the cache so navigation / refresh / teacher-resume all
  // recover prior work without dedicated effects. Handles the same load
  // orders the old lazy-fill did (initial mount before myResponse arrives;
  // page refresh mid-quiz; teacher resume / late snapshot) plus the
  // stale-seed-clobber race. Two correctness details:
  //
  //   - Refresh, not fill-once: if the saved value changes while the
  //     question is still untouched, update the cache to match so the
  //     autosave's saved-equal short-circuit holds and never writes an
  //     outdated seed back over a newer server answer. Touched questions
  //     are skipped — the cache wins after the first local edit.
  //   - Re-read `savedAnswerForCurrentRef.current` inside the updater: if a
  //     newer snapshot lands between scheduling and React applying it, the
  //     closure would otherwise lock the stale value into the cache.
  if (
    currentQuestion?.id &&
    savedAnswerForCurrent !== null &&
    !touchedQuestionsRef.current.has(currentQuestion.id) &&
    answerCache[currentQuestion.id] !== savedAnswerForCurrent
  ) {
    const qid = currentQuestion.id;
    // Mark as seeded BEFORE the setState so the editor questionKey (read
    // later in this same render pass) sees the right state on this commit.
    seededQuestionsRef.current.add(qid);
    setAnswerCache((prev) => {
      const fresh = savedAnswerForCurrentRef.current;
      if (fresh === null || prev[qid] === fresh) return prev;
      return { ...prev, [qid]: fresh };
    });
  }

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

  // Keep refs for volatile state used by the countdown / autosave / flush
  // paths so the timer doesn't restart on every keystroke or selection
  // change. The current question's live answer is mirrored separately
  // into `currentAnswerRef` (synced in the render body, above) so this
  // set only carries the values the cache doesn't represent.
  //
  // These are synced by direct assignment in the render body (not a
  // useEffect): every consumer reads them from an effect or an event
  // handler that runs AFTER commit, so assigning during render gives
  // them the freshest value with no staleness window — matching
  // `submittedRef` / `currentAnswerRef` and the project's ref-sync rule
  // (CLAUDE.md "useEffect is an escape hatch, not a default"). Using an
  // effect here would have meant any imperative reader firing in the
  // same commit (visibility flush, structured input change) would see
  // the previous render's value.
  const currentQuestionRef = useRef(currentQuestion);
  currentQuestionRef.current = currentQuestion;
  const selectedAnswerRef = useRef(selectedAnswer);
  selectedAnswerRef.current = selectedAnswer;
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  // Mirror of `myResponse.status` for the visibility/unmount flush
  // handlers (which are scoped to `[]` deps and can't read state
  // directly). Used to short-circuit the flush after the student has
  // already submitted — without this, the cleanup flush at unmount
  // re-writes the answer with `status: 'draft'`, downgrading the parent
  // response from `'completed'` back to `'in-progress'` and silently
  // breaking the teacher's "Finished" counter.
  const myResponseStatusRef = useRef(myResponse?.status);
  myResponseStatusRef.current = myResponse?.status;
  // Mirror of the per-question `submitted` state for the imperative
  // paths (flush handler, structured-input change callbacks) that can't
  // read state directly.
  const submittedRef = useRef(false);
  submittedRef.current = submitted;
  // Pending draft tracker for question-change flushes. The state-driven
  // autosave effect populates this when it schedules a write; a watcher
  // on `currentQuestion?.id` calls `write()` synchronously when the
  // question advances, flushing the outgoing question's last edit before
  // the new question's autosave path clobbers the shared timer slot.
  const pendingDraftRef = useRef<{ qid: string; write: () => void } | null>(
    null
  );

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
    // Cancel any pending draft autosave for the same question — same
    // rationale as handleSubmit/handleSubmitAndAdvance. Without this
    // clear, the question-change watcher will later fire the captured
    // draft with `isDraft: true`, downgrading the just-auto-submitted
    // answer's status back to 'draft' on the next advance.
    if (draftAutosaveTimer.current) {
      clearTimeout(draftAutosaveTimer.current);
      draftAutosaveTimer.current = null;
    }
    pendingDraftRef.current = null;
    // Pull from the current-answer ref so a half-finished value (typed
    // essay, partial matching placement, etc.) is preserved on timeout
    // instead of submitting empty. The guard above already confirmed this
    // is the active question, so the ref's `qid` matches; check it anyway
    // and fall back to selectedAnswerRef (the post-explicit-submit value)
    // for the rare case where the student submitted, didn't touch the
    // cache afterward, and the timer expired.
    const cached =
      currentAnswerRef.current.qid === autoSubmitTriggeredFor
        ? currentAnswerRef.current.value
        : undefined;
    const answer = cached ?? selectedAnswerRef.current ?? '';
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

  // Per-question draft autosave driven by the live answer cache. The
  // cache is the only source of truth for in-progress values, so this
  // single effect now covers every answer type — MC, FIB, short,
  // essay, matching, ordering. 500 ms debounce coalesces rapid edits.
  // Explicit Submit / submit-and-advance write the final state through
  // their own paths; the debounce is purely a write-rate optimization
  // and a tab-close safety net.
  const currentQid = currentQuestion?.id;
  const cachedDraft =
    currentQid && currentQid in answerCache ? answerCache[currentQid] : null;
  // Render-time live answer for editors and inputs. Falls back to the
  // Firestore saved value on the single render between question
  // navigation and the seed-from-server block populating the cache, so
  // controlled inputs (MC highlight, FIB value, structured initial
  // seed) never flicker through an empty state when a saved value is
  // available. `cachedDraft` (cache-only) is what drives autosave —
  // they intentionally differ here.
  const liveAnswer = cachedDraft ?? savedAnswerForCurrent ?? null;
  // Mirror only the current question's cached value into the ref for the
  // imperative readers (auto-submit, flush). `cachedDraft` is null when the
  // question has no cache entry; store `undefined` to preserve the old
  // per-key lookup semantics (`record[qid]` was `undefined` when absent).
  currentAnswerRef.current = {
    qid: currentQid,
    value: cachedDraft ?? undefined,
  };
  // Submit-gating value: the cache-backed answer ONLY (no Firestore
  // fallback). The Submit / NEXT affordances gate on this — not on
  // `liveAnswer` — so a tap can never fire on a value the student hasn't
  // committed to the cache: something they typed/selected this session, or
  // that the seed-from-server seeded from a saved value (resume / revisit).
  // `liveAnswer` still feeds the inputs/highlights so a saved answer shows
  // immediately while the submit affordance waits for the cache to back it.
  // (React coalesces the seed-from-server render-phase update into the same
  // commit, so today this matches `liveAnswer` in committed renders — but
  // gating on the cache is the correct statement of intent and stays safe
  // if that seed ever moves into an effect, where the fallback WOULD reach
  // a committed render and a fast tap could re-submit-and-advance an answer
  // the student never re-affirmed.)
  const submittableAnswer = cachedDraft;
  // Convenience cache writer for the editor / input onChange handlers.
  // Updates the cache for the current question; no-ops if there's no
  // current question (impossible in practice during render of an
  // answer slot, but keeps the type signature honest).
  const setCacheForCurrent = (value: string): void => {
    if (!currentQid) return;
    // Mark the question touched so the seed-from-server block above stops
    // mirroring later snapshots over this local edit.
    touchedQuestionsRef.current.add(currentQid);
    setAnswerCache((prev) => ({ ...prev, [currentQid]: value }));
    // Clear any stale save-error banner once the student resumes editing.
    // The deliberate-clear banner ("Click Submit to clear it") and other
    // transient autosave errors otherwise linger on screen after the
    // student starts typing/selecting again, which is misleading.
    setSaveError(null);
  };
  useEffect(() => {
    const qid = currentQid;
    const type = currentQuestion?.type;
    if (!qid || !type) return;
    if (submitted) return;
    // Cache miss — student hasn't touched this question this session
    // and there's no saved value either. Nothing to write.
    if (cachedDraft === null) return;
    // Saved-equal short-circuit: don't write what's already on the
    // server. Handles the "lazy-fill seeded cache from saved value"
    // case (cache and saved are identical → no-op) and the
    // "deliberate re-type to identical text" case.
    if (cachedDraft === (savedAnswerForCurrent ?? '')) return;
    // Deliberate-clear short-circuit: the student cleared a previously-
    // saved answer. The hook's `isUnsafeBlankDraft` guard would refuse
    // the write silently, so detect the condition here and surface a
    // hint to the student instead of queuing a doomed timer. Submit
    // with the explicit Submit/Next button still bypasses the guard
    // and lets them persist an empty answer if that's really intended.
    if (cachedDraft === '' && (savedAnswerForCurrent ?? '') !== '') {
      setSaveError(
        'Your previously-saved answer is still on file. Click Submit to clear it.'
      );
      return;
    }

    const snapshot = cachedDraft;
    const capturedQid = qid;
    const writeNow = () => {
      void onAnswerRef
        .current(capturedQid, snapshot, undefined, { isDraft: true })
        .catch((err: unknown) => {
          logError('QuizStudentApp.draftAutosave', err, {
            questionId: capturedQid,
            questionType: type,
          });
          // Surface autosave failures to the student. The
          // `lastWriteAt == request.time` Firestore rule rejects
          // writes from clients with stale auth tokens / session
          // state, and other transient failures (offline, quota)
          // land here too. Without this setter the student silently
          // loses keystrokes until the idle-finalize cron sweeps
          // their last successfully persisted value.
          setSaveError("Couldn't save your answer. Tap to try again.");
        });
    };

    if (draftAutosaveTimer.current) {
      clearTimeout(draftAutosaveTimer.current);
    }
    draftAutosaveTimer.current = setTimeout(writeNow, 500);
    pendingDraftRef.current = { qid: capturedQid, write: writeNow };

    return () => {
      // Only clear the timer here. We can't flush from this cleanup
      // when the question has advanced — React runs cleanups BEFORE
      // the ref-sync effect updates `currentQuestionRef.current`. The
      // flush-on-advance happens in the question-change watcher
      // below, which runs after the ref-sync. handleSubmit /
      // handleSubmitAndAdvance / the timer-expiry auto-submit effect
      // all explicitly null `pendingDraftRef.current` so the watcher
      // skips already-submitted answers.
      if (draftAutosaveTimer.current) {
        clearTimeout(draftAutosaveTimer.current);
        draftAutosaveTimer.current = null;
      }
    };
  }, [
    cachedDraft,
    currentQid,
    currentQuestion?.type,
    submitted,
    savedAnswerForCurrent,
  ]);

  // Question-change watcher: if a draft is pending for the OUTGOING
  // question when the user advances, flush it synchronously before
  // the new question's autosave path clobbers the shared timer slot.
  // The state-driven effect's cleanup also flushes when its own deps
  // caused the cleanup, but Matching/Ordering pending saves are
  // scheduled imperatively (not in a tracked effect), so this watcher
  // is the only path that flushes them on advance.
  useEffect(() => {
    const pending = pendingDraftRef.current;
    if (pending && pending.qid !== currentQuestion?.id) {
      if (draftAutosaveTimer.current) {
        clearTimeout(draftAutosaveTimer.current);
        draftAutosaveTimer.current = null;
      }
      pending.write();
      pendingDraftRef.current = null;
    }
  }, [currentQuestion?.id]);

  // Flush pending draft autosave for the current question on unmount,
  // visibility-hidden, beforeunload, and on the teacher pause event. The
  // synchronous Firestore write can't be awaited inside an unload
  // handler, but kicking it off before the page tears down is the best-
  // effort flush we can do. Covers every answer type — without this the
  // 500 ms debounce window is enough for tab-close to lose the last
  // typed character / clicked option / dropped chip.
  useEffect(() => {
    const flush = () => {
      // Bail if the response has already been finalized at the doc
      // level (last-question submit / completeQuiz), OR if the current
      // question was just explicitly submitted locally. The doc-level
      // check covers the post-completeQuiz unmount path; the
      // `submittedRef` check covers the per-question-submit + tab-close
      // race where the listener hasn't yet propagated the just-submitted
      // answer back into savedAnswerForCurrent, so the saved-equal
      // bail-out below would otherwise fail and re-write the answer as
      // a draft — downgrading the just-submitted answer.
      if (myResponseStatusRef.current === 'completed') return;
      if (submittedRef.current) return;
      const qid = currentQuestionRef.current?.id;
      const type = currentQuestionRef.current?.type;
      if (!qid || !type) return;

      // Read the live value from the narrow current-answer ref. An
      // `undefined` here means either the student never touched this
      // question in the current session, or the ref has already advanced to
      // a different question — either way there's nothing for THIS question
      // to flush.
      const cacheValue =
        currentAnswerRef.current.qid === qid
          ? currentAnswerRef.current.value
          : undefined;
      if (cacheValue === undefined) return;
      const draft = cacheValue;
      // Saved-equal short-circuit. Uses the ref-synced saved value so
      // the [] deps don't freeze the closure. Handles the "never typed"
      // empty case (saved null, draft '') without short-circuiting on
      // empty draft alone — a deliberate clear of a previously-saved
      // answer is allowed through; the #1 guard in submitAnswer
      // refuses the unsafe blank-over-non-blank case from there.
      if (draft === (savedAnswerForCurrentRef.current ?? '')) return;

      if (draftAutosaveTimer.current) {
        clearTimeout(draftAutosaveTimer.current);
        draftAutosaveTimer.current = null;
      }
      void onAnswerRef
        .current(qid, draft, undefined, { isDraft: true })
        .catch((err: unknown) => {
          logError('QuizStudentApp.draftFlush', err, {
            questionId: qid,
            questionType: type,
          });
          // Surface flush failures from the visibility-hidden /
          // flush-written / unmount paths. beforeunload + unmount
          // cleanup paths see this as a no-op (component already
          // tearing down — React 19 silently ignores the setter), but
          // the visibilitychange-hidden path matters: when the student
          // tabs back in, they see the SaveErrorBanner instead of
          // silently believing their pre-switch keystrokes saved.
          setSaveError("Couldn't save your answer. Tap to try again.");
        });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    // Custom event from `ActiveQuiz.handleAutoSubmit` so a strike-3
    // auto-submit lands the latest draft (of any type) before completing
    // the response. Name preserved for backwards compatibility with the
    // existing `dispatchEvent('spartboard:quiz:flush-written')` call;
    // semantically it now flushes whichever type is active.
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('spartboard:quiz:flush-written', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('spartboard:quiz:flush-written', flush);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
    // Event listeners register once; the live state needed by `flush`
    // (current question, draft values, saved-answer baseline) is read
    // fresh at flush time via refs synced in the render body, so this
    // effect has no React-tracked deps.
  }, []);

  // Watch for teacher revealing answers after student already submitted.
  // Uses "adjusting state during render" pattern to avoid setState-in-effect.
  const currentRevealed = currentQuestion
    ? session.revealedAnswers?.[currentQuestion.id]
    : undefined;
  const [prevRevealed, setPrevRevealed] = useState(currentRevealed);

  if (currentRevealed !== prevRevealed) {
    setPrevRevealed(currentRevealed);
    // Written question types have no canonical correct answer — they are
    // manually graded. Skip the reveal/feedback path entirely.
    const isWritten =
      currentQuestion?.type === 'short' || currentQuestion?.type === 'essay';
    if (
      currentRevealed &&
      submitted &&
      !isWritten &&
      session.showResultToStudent &&
      answerFeedback === null
    ) {
      // Read order: selectedAnswer (post-explicit-submit) → cache (timer
      // auto-submit landed but the response listener hasn't echoed yet)
      // → Firestore answers as the final fallback. Without the cache
      // hop, an auto-submitted answer compared against a stale
      // myResponse can produce a false-incorrect on a correct
      // submission during the teacher's reveal-snapshot tick.
      const studentAns =
        selectedAnswer ??
        cachedDraft ??
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
    // Cancel any pending draft autosave so the flush-on-question-change
    // path doesn't double-fire submitAnswer with `isDraft: true` after
    // we explicitly submit. Without this clear, the autosave timer
    // captured the same (qid, answer) and its cleanup-on-advance fires
    // a redundant write that DOWNGRADES the just-submitted answer's
    // status back to 'draft'.
    if (draftAutosaveTimer.current) {
      clearTimeout(draftAutosaveTimer.current);
      draftAutosaveTimer.current = null;
    }
    pendingDraftRef.current = null;
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
  //
  // `skipWrite` advances WITHOUT calling `onAnswer`. It's used by the written
  // editor when the cache has no entry for the question (`submittableAnswer`
  // is null): the student either never typed (a deliberate skip) or their
  // saved answer hasn't echoed back into `myResponse` yet. In both cases
  // writing the editor's empty value would be wrong — at best a meaningless
  // blank, at worst an explicit-submit blank that CLOBBERS the not-yet-loaded
  // saved essay (explicit submits bypass the `isUnsafeBlankDraft` autosave
  // guard). Skipping the write lets the student move on while any saved answer
  // on the server is preserved untouched. A deliberate clear (cache holds '')
  // still writes through — `submittableAnswer` is '' there, not null.
  const handleSubmitAndAdvance = async (answer: string, skipWrite = false) => {
    if (advancingRef.current || submitting) return;
    // Self-paced revisits are intentional re-submissions — let them through
    // even when `submitted=true`. Teacher-paced still locks after first submit.
    if (submitted && !isStudentPaced) return;
    // Cancel any pending draft autosave (see handleSubmit for the
    // double-fire-downgrade rationale).
    if (draftAutosaveTimer.current) {
      clearTimeout(draftAutosaveTimer.current);
      draftAutosaveTimer.current = null;
    }
    pendingDraftRef.current = null;
    advancingRef.current = true;
    setSubmitting(true);
    setSaveError(null);
    try {
      if (!skipWrite) {
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
    // `overflow-x-hidden` is a defensive backstop so an oversized child
    // (a long unbreakable token in a student answer, a misconfigured
    // grid below a fold, a future refactor that adds a fixed-width
    // element) can never produce a horizontal scrollbar on an 11"
    // Chromebook. The max-width caps above keep content well-anchored
    // on widescreens; this guarantees the narrow-viewport path stays
    // scroll-free regardless of what's rendered inside.
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-900 relative">
      {/* The "your teacher unlocked your attempt" prompt — covers the quiz
          UI on first render after a teacher unlock so the student knows
          what happened before they touch anything. */}
      {showResumeModal && (
        <div className="fixed inset-0 z-overlay bg-emerald-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
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
        <div className="sticky top-0 z-10 flex items-start gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/40 text-amber-200 text-xs">
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
        <div className="fixed inset-0 z-overlay bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
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

      <div
        {...clipboardGuards}
        className={`flex flex-col p-6 mx-auto w-full ${
          // Per-type width caps. Tuned for the personal-device viewport
          // a student actually uses (laptop / Chromebook / tablet), not
          // a projector:
          //   essay     → max-w-7xl  ~1280px. Long-form writing benefits
          //                from elbow room more than line-length
          //                discipline; the editor wraps its own prose.
          //   short     → max-w-5xl  ~1024px. Paragraph-length answers
          //                still want room without becoming sprawling.
          //   MC/FIB/   → max-w-2xl   ~672px. Short answer options and
          //   Matching/   structured inputs read worse when stretched
          //   Ordering    across a widescreen — keep them compact.
          currentQuestion.type === 'essay'
            ? 'max-w-7xl'
            : currentQuestion.type === 'short'
              ? 'max-w-5xl'
              : 'max-w-2xl'
        }`}
      >
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
                    : currentQuestion.type === 'Ordering'
                      ? 'bg-teal-500/20 text-teal-400'
                      : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {currentQuestion.type === 'MC'
              ? 'Multiple Choice'
              : currentQuestion.type === 'FIB'
                ? 'Fill in the Blank'
                : currentQuestion.type === 'Matching'
                  ? 'Matching'
                  : currentQuestion.type === 'Ordering'
                    ? 'Ordering'
                    : currentQuestion.type === 'short'
                      ? 'Short Answer'
                      : 'Essay'}
          </span>
        </div>

        {/* Question */}
        <h2 className="text-xl font-bold text-white mb-8 leading-snug break-words">
          {currentQuestion.text}
        </h2>

        {/* Answer area */}
        {currentQuestion.type === 'MC' && (
          <div className="space-y-3 flex-1">
            {options.map((opt) => {
              // Self-paced revisits stay editable, so the highlight tracks
              // the live cache value. When locked, fall back to the
              // post-submit `selectedAnswer` indicator; timer auto-submit
              // never sets selectedAnswer, so degrade to liveAnswer so the
              // student can still see which option was submitted from
              // their cached pick.
              const isLocked = submitted && !isStudentPaced;
              const lockedRef = selectedAnswer ?? liveAnswer;
              const isSelected = isLocked
                ? lockedRef === opt
                : liveAnswer === opt;
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
                  onClick={() => !isLocked && setCacheForCurrent(opt)}
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
                        submittableAnswer &&
                        void handleSubmitAndAdvance(submittableAnswer)
                      }
                      disabled={!submittableAnswer || submitting}
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
                    submittableAnswer && void handleSubmit(submittableAnswer)
                  }
                  disabled={!submittableAnswer || submitting}
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
              value={liveAnswer ?? ''}
              onChange={(e) => setCacheForCurrent(e.target.value)}
              disabled={submitted && !isStudentPaced}
              placeholder="Type your answer…"
              className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl text-white text-sm focus:outline-none focus:ring-0 focus:border-violet-500 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const trimmed = (submittableAnswer ?? '').trim();
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
                        (submittableAnswer ?? '').trim() &&
                        void handleSubmitAndAdvance(
                          (submittableAnswer ?? '').trim()
                        )
                      }
                      disabled={!(submittableAnswer ?? '').trim() || submitting}
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
                    (submittableAnswer ?? '').trim() &&
                    void handleSubmit((submittableAnswer ?? '').trim())
                  }
                  disabled={!(submittableAnswer ?? '').trim() || submitting}
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
            savedAnswer={liveAnswer}
            onSubmit={(answer) => void handleSubmit(answer)}
            onSubmitAndAdvance={(answer) => void handleSubmitAndAdvance(answer)}
            onAnswerChange={(answer) => {
              // The input remounts per question (keyed by id) and its mount
              // effect re-emits the seeded answer. Skip the write when the
              // emitted value already matches the cached value: a back-nav
              // remount would otherwise mark the question touched (freezing
              // out the seed-from-server refresh) and churn the autosave /
              // pollute the history log for a no-op overwrite. Genuine
              // placements differ from the cache and fall through.
              if (
                currentAnswerRef.current.qid === currentQid &&
                currentAnswerRef.current.value === answer
              )
                return;
              // Push the live placement into the cache; the autosave
              // effect picks it up and debounces the Firestore write.
              setCacheForCurrent(answer);
            }}
            submitting={submitting}
            isStudentPaced={isStudentPaced}
            isLastQuestion={currentIndex >= session.totalQuestions - 1}
            onNext={handleNext}
            saveError={saveError}
          />
        )}

        {(currentQuestion.type === 'short' ||
          currentQuestion.type === 'essay') && (
          <div className="space-y-4">
            <React.Suspense
              fallback={
                <div className="h-48 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                </div>
              }
            >
              <WrittenResponseEditor
                // The editor seeds its `innerHTML` once on mount (caret
                // preservation), so we encode a "recovered text needs
                // injecting" boolean in the questionKey. A page refresh
                // mid-essay first mounts with value='' (cache empty,
                // saved null); when the Firestore snapshot arrives the
                // seed-from-server block recovery-seeds the cache, the key
                // flips from `…:init` → `…:seeded`, and the editor
                // remounts with the recovered text. Without this, the
                // student stares at a blank editor while React state
                // already holds the recovered value.
                //
                // Keyed on `seededQuestionsRef` (Firestore-sourced seeds)
                // rather than general cache presence: a student's own first
                // keystroke also populates `answerCache`, and keying on that
                // remounted the editor mid-type, stealing focus and the caret.
                questionKey={`${currentQuestion.id}:${
                  seededQuestionsRef.current.has(currentQuestion.id)
                    ? 'seeded'
                    : 'init'
                }`}
                value={liveAnswer ?? ''}
                onChange={(html) => setCacheForCurrent(html)}
                placeholder={currentQuestion.placeholder}
                maxWords={currentQuestion.maxWords}
                disabled={submitted && !isStudentPaced}
                isEssay={currentQuestion.type === 'essay'}
                blockClipboard={blockCopyPaste}
              />
            </React.Suspense>

            {/*
              Sticky CTA: the editor can grow up to ~70vh tall, so without
              `sticky bottom-0` the Submit button rides below the fold and
              students miss it.
            */}
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3 sticky bottom-0 z-10 bg-slate-900/85 backdrop-blur-sm pt-3 pb-2 -mx-2 px-2 rounded-xl">
              {isStudentPaced ? (
                submitted && currentIndex >= session.totalQuestions - 1 ? (
                  <QuizCompleteCard />
                ) : (
                  <>
                    {saveError && <SaveErrorBanner message={saveError} />}
                    {/* Written NEXT stays enabled (only `submitting` gates it)
                        so a student can advance past a blank essay; gating it
                        on the cache like MC/FIB would trap anyone who wants to
                        skip. When the cache HAS a value (typed, seeded, or a
                        deliberate clear) we submit it; when it's unseeded
                        (`submittableAnswer === null`) we advance WITHOUT writing
                        so a fast tap can't clobber a not-yet-loaded saved essay
                        with a blank (see handleSubmitAndAdvance `skipWrite`). */}
                    <button
                      onClick={() =>
                        void handleSubmitAndAdvance(
                          submittableAnswer ?? '',
                          submittableAnswer === null
                        )
                      }
                      disabled={submitting}
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
                // Teacher-paced has no self-advance, so (unlike self-paced) we
                // can safely gate Submit on the cache: disabled while the
                // editor is unseeded (`submittableAnswer === null`) — never
                // typed, or the saved answer hasn't echoed yet — so a fast tap
                // can't write a blank over a not-yet-loaded saved essay. A
                // deliberate clear (cache holds '') is non-null, so it stays
                // enabled. The button re-enables once the student types or the
                // saved answer loads and seeds the cache.
                <button
                  onClick={() => void handleSubmit(submittableAnswer ?? '')}
                  disabled={submitting || submittableAnswer === null}
                  className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Submit Response'
                  )}
                </button>
              ) : (
                <WrittenSubmittedCard
                  isWaiting={currentIndex < session.totalQuestions - 1}
                />
              )}
            </div>
          </div>
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
    <div className="space-y-4">
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

// ─── Written-response post-submit cards ──────────────────────────────────────
//
// Reused in two places: between essay questions (waiting state) and after
// the final question lands (`isWaiting=false`). The "Back to my
// assignments" CTA is what stops students from feeling stranded on the
// submitted screen with no way out.

const WrittenSubmittedCard: React.FC<{ isWaiting: boolean }> = ({
  isWaiting,
}) => (
  <div className="flex flex-col gap-3">
    <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
      <p className="text-emerald-300 text-sm font-bold">
        {isWaiting
          ? 'Waiting for teacher…'
          : 'Response submitted — your teacher will grade this.'}
      </p>
    </div>
    {!isWaiting && <ReturnToAssignmentsButton />}
  </div>
);

const QuizCompleteCard: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
      <p className="text-emerald-300 text-sm font-bold">Quiz complete!</p>
    </div>
    <ReturnToAssignmentsButton />
  </div>
);

/**
 * Inline CTA used after submission. `variant="card"` matches the existing
 * full-width pill that sits inside the answer card on the active quiz
 * screen; `variant="standalone"` is a compact pill sized to its label —
 * used on the full-screen `QuizSubmittedWaitScreen` so it doesn't stretch
 * edge-to-edge.
 */
const ReturnToAssignmentsButton: React.FC<{
  variant?: 'card' | 'standalone';
}> = ({ variant = 'card' }) => (
  <button
    type="button"
    onClick={() => {
      window.location.assign('/my-assignments');
    }}
    className={
      variant === 'standalone'
        ? 'inline-flex items-center gap-2 px-5 py-2.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-full transition-colors'
        : 'w-full py-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-sm shadow-brand-blue-primary/20'
    }
  >
    Back to my assignments <ArrowRight className="w-4 h-4" />
  </button>
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
    <div className="h-screen overflow-y-auto bg-slate-900">
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        {/* Question recap */}
        <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">
          Question {session.currentQuestionIndex + 1} of{' '}
          {session.totalQuestions}
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
                <CheckCircle2 className="w-5 h-5 inline-block mr-1 -mt-0.5" />{' '}
                You got it right!
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
  /** Forwarded to PublishedScoreReview — see QuizStudentAppProps. */
  embedded?: boolean;
  watermarkNameOverride?: string;
}> = ({
  session,
  myResponse,
  answeredCount,
  totalQuestions,
  pin,
  myStudentUid,
  embedded = false,
  watermarkNameOverride,
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
        embedded={embedded}
        watermarkNameOverride={watermarkNameOverride}
      />
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-slate-900">
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
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
          Your answers have been submitted. Ask your teacher to see your
          results.
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
  /**
   * Inside the Classroom add-on iframe: on tab-warning lockout, render an
   * in-iframe "see your teacher" screen instead of redirecting to the
   * standalone /my-assignments page (which the partitioned iframe can't host).
   */
  embedded?: boolean;
  /**
   * Watermark label for the nameless Classroom SSO session. Falls back to the
   * auth displayName / PIN / "Student" when unset (standalone routes).
   */
  watermarkNameOverride?: string;
}> = ({
  session,
  myResponse,
  visibility,
  pin,
  embedded = false,
  watermarkNameOverride,
}) => {
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
  // "Fully correct" only makes sense for auto-graded types. Counting an
  // essay or short-answer against this tally produces a misleading "0 of
  // 1 fully correct" beneath a 70% score for partial-credit work. Count
  // and label against auto-graded questions only; suppress the line
  // entirely when the quiz has no auto-graded questions at all.
  const publicQuestions = session.publicQuestions ?? [];
  const autoGradedQuestionIds = new Set(
    publicQuestions
      .filter((q) => !isWrittenQuestionType(q.type))
      .map((q) => q.id)
  );
  const autoGradedCount = autoGradedQuestionIds.size;
  const correctCount = myResponse.answers.filter(
    (a) => autoGradedQuestionIds.has(a.questionId) && a.isCorrect === true
  ).length;

  // Watermark overlay — rendered above content via fixed positioning, below
  // any future modal dialogs (z-50, well below `Z_INDEX.modal`/`Z_INDEX.toast`
  // from `config/zIndex.ts`). Strictly decorative + pointer-events-none, so
  // it doesn't interfere with scrolling, focus, or selection beneath it.
  // Student display name is best-effort: SSO joiners carry an
  // `auth.currentUser.displayName`; anonymous PIN joiners fall back to their
  // PIN; otherwise we use a generic 'Student' label. The watermark is
  // informational — its job is to discourage shared screenshots, not to
  // authenticate.
  const watermarkEnabled = session.protection?.watermarkEnabled === true;
  // When the session has no `scorePublishedAt` (legacy or mid-publish), fall
  // back to a per-mount snapshot of `Date.now()`. `useState(fn)` runs `fn`
  // exactly once at mount, giving us a stable timestamp without calling
  // `Date.now()` in render (which would violate react-hooks/purity). The
  // listener will swap in the real publish time on its next snapshot.
  const [fallbackPublishedAt] = useState(() => Date.now());
  const publishedAt = session.scorePublishedAt ?? fallbackPublishedAt;
  // Prefer an explicit override (the Classroom SSO session is nameless, so the
  // add-on passes the roster-resolved / userinfo name down). Otherwise treat a
  // blank/whitespace-only displayName as missing and fall through to the PIN
  // label, then a generic "Student".
  const trimmedOverride = watermarkNameOverride?.trim() ?? '';
  const trimmedDisplayName = auth.currentUser?.displayName?.trim() ?? '';
  const watermarkStudentName =
    trimmedOverride.length > 0
      ? trimmedOverride
      : trimmedDisplayName.length > 0
        ? trimmedDisplayName
        : pin
          ? `PIN ${pin}`
          : 'Student';

  // ─── Tab-switch warning protection ─────────────────────────────────────────
  // Listens for visibility/focus loss; each return increments the warning
  // counter on the response doc and (at threshold) flips `resultsLockedOut`
  // true. The modal pops only when the count goes UP while the student is
  // viewing this page — we seed `shownForCount` from the persisted value at
  // mount so a stale count from a previous session doesn't auto-pop the modal
  // on first render. Lockout flips trigger a redirect to /my-assignments,
  // where the row will render in its locked state.
  const tabWarningEnabled = session.protection?.tabWarningEnabled === true;
  const threshold = session.protection?.tabWarningThreshold ?? 3;
  const currentWarnings = myResponse.resultsTabWarnings ?? 0;
  const lockedOut = myResponse.resultsLockedOut === true;

  const [shownForCount, setShownForCount] = useState(() => currentWarnings);
  const modalOpen =
    tabWarningEnabled && currentWarnings > shownForCount && !lockedOut;

  // `myResponse._responseKey` is the Firestore doc id, populated at read time
  // by the session-student listener (see `useQuizSession.ts` L1065). The path
  // mirrors how the response listener constructs its doc ref.
  const responseKey = myResponse._responseKey;
  useResultsTabWarnings({
    enabled: tabWarningEnabled && Boolean(responseKey),
    threshold,
    currentWarnings,
    lockedOut,
    responseDocPath: responseKey
      ? `quiz_sessions/${session.id}/responses/${responseKey}`
      : '',
  });

  // Lockout → redirect. The MyAssignments page will show the locked card.
  // We set the saved filter to 'completed' first so the student lands on the
  // tab that actually contains the locked row (active-tab would hide it).
  // No react-router in this app — match the existing `window.location.assign`
  // pattern used by `ReturnToAssignmentsButton`.
  //
  // Skipped when `embedded`: inside the Classroom add-on iframe, navigating to
  // the standalone /my-assignments page would load it INSIDE the partitioned
  // iframe (it expects the /student/login SSO lifecycle, not the add-on
  // handshake). Instead the render below short-circuits to an in-iframe locked
  // screen.
  useEffect(() => {
    if (!lockedOut || embedded) return;
    try {
      window.sessionStorage.setItem('sb_my_assignments_filter', 'completed');
    } catch {
      // sessionStorage may be disabled (privacy mode); the page will just
      // open on its default filter, which is fine.
    }
    window.location.assign('/my-assignments');
  }, [lockedOut, embedded]);

  // In-iframe lockout screen for the Classroom add-on. Mirrors the locked-card
  // messaging from /my-assignments but stays inside the iframe. Pure terminal
  // state — no results are rendered once locked.
  if (lockedOut && embedded) {
    return (
      <div className="h-screen overflow-y-auto bg-slate-900">
        <div className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
          <ShieldAlert
            className="h-12 w-12 text-amber-400"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-black text-white">Results locked</h1>
          <p className="max-w-sm text-sm text-slate-400">
            You left the results page too many times, so it&rsquo;s locked. Ask
            your teacher to unlock your results.
          </p>
        </div>
      </div>
    );
  }

  // Per-question cards dominate this view (snapshot + teacher
  // annotations + score + comment block), so the container is sized
  // generously — written-response reviews benefit much more from
  // horizontal room than from a tight prose column. The annotation
  // engine inside each card handles its own internal line lengths.
  // `overflow-x-hidden` is the same horizontal-scroll backstop the
  // active-quiz screen uses — see comment there for why.
  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-900 px-4 py-8 sm:px-6 sm:py-12">
      {watermarkEnabled && (
        <ResultsWatermark
          studentName={watermarkStudentName}
          publishedAt={publishedAt}
        />
      )}
      <ResultsTabWarningModal
        open={modalOpen}
        warningCount={currentWarnings}
        threshold={threshold}
        onDismiss={() => setShownForCount(currentWarnings)}
      />
      <div className="mx-auto w-full max-w-6xl">
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
              {/* Per-question tally counts only fully-correct answers, so
                  it can lag the percentage on quizzes that award partial
                  credit (Matching/Ordering with `allowPartialCredit`) or
                  use non-1 point values — and it doesn't apply at all to
                  written-response questions where "fully correct" is a
                  category error. Hide the line on essay-only quizzes; on
                  mixed quizzes it counts only the auto-graded subset. */}
              {autoGradedCount > 0 && (
                <p className="mt-2 text-sm text-slate-400">
                  {correctCount} of {autoGradedCount} fully correct
                </p>
              )}
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
                const isWritten = isWrittenQuestionType(q.type);
                const writtenGrade = isWritten
                  ? myResponse.grading?.[q.id]
                  : undefined;
                // Written-response questions don't have a binary
                // right/wrong outcome — a 7/10 essay is partial credit,
                // not "incorrect". Suppress the red-X / red-border
                // treatment entirely for written types. A full-credit
                // essay still shows the ✓ as a positive ack, but never
                // a red mark for anything below 100%.
                const writtenMaxPoints = q.points ?? 1;
                const writtenIsCorrect =
                  writtenGrade != null &&
                  writtenMaxPoints > 0 &&
                  writtenGrade.pointsAwarded === writtenMaxPoints;
                const isCorrect = isWritten
                  ? writtenIsCorrect
                  : ans?.isCorrect === true;
                const isIncorrect = isWritten
                  ? false
                  : ans?.isCorrect === false;
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
                      <p className="flex-1 min-w-0 break-words text-sm font-semibold text-slate-100">
                        {q.text}
                      </p>
                      {isCorrect && (
                        <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                      )}
                      {isIncorrect && (
                        <XIcon className="h-5 w-5 shrink-0 text-red-400" />
                      )}
                    </header>
                    <div className="ml-7 space-y-1.5">
                      {isWritten ? (
                        <WrittenAnswerReview
                          studentAnswer={studentAnswer}
                          grade={writtenGrade}
                          showResponse={showResponses}
                          maxPoints={q.points ?? 1}
                        />
                      ) : (
                        <>
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
                        </>
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
 * Per-question review surface for written-response questions on the
 * student score-review screen. Shows three things when present:
 *  1. The teacher's frozen snapshot of the student's answer with
 *     highlight marks + margin comments (Phase 2).
 *  2. The points awarded (e.g. "7 / 10").
 *  3. The teacher's overall comment.
 *
 * Falls back to a sanitized render of the student's live answer when
 * the question hasn't been graded yet — useful for self-paced quizzes
 * where the teacher publishes scores in chunks.
 */
export const WrittenAnswerReview: React.FC<{
  studentAnswer: string;
  grade: WrittenAnswerGrade | undefined;
  showResponse: boolean;
  maxPoints: number;
}> = ({ studentAnswer, grade, showResponse, maxPoints }) => {
  if (!showResponse) {
    return null;
  }
  const hasGrade = !!grade;
  const annotations = grade?.annotations ?? [];
  const snapshot =
    grade?.gradingSnapshot ??
    (studentAnswer ? sanitizeQuizResponse(studentAnswer) : '');
  const showingLiveAnswer = !hasGrade && !!studentAnswer;
  return (
    <div className="space-y-3">
      {snapshot ? (
        <AnnotatedResponseView
          mode="read"
          snapshot={snapshot}
          annotations={annotations}
        />
      ) : (
        <p className="text-xs text-slate-500 italic">— no response</p>
      )}
      {hasGrade && (
        <>
          {grade.overallComment && (
            // Promoted from a tiny footnote to a violet-accented card so
            // the teacher's written feedback is the most visible thing
            // after the student's own answer — it's the part students
            // most need to read.
            <div className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-300 mb-1">
                Teacher Comment
              </p>
              <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                {grade.overallComment}
              </p>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Score
            </span>
            <span className="font-mono text-base font-black text-slate-100">
              {grade.pointsAwarded} / {maxPoints}
            </span>
          </div>
        </>
      )}
      {!hasGrade &&
        (showingLiveAnswer ? (
          <p className="text-[11px] text-slate-500 italic">
            Showing your latest response — not yet graded by your teacher.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 italic">
            Not yet graded by your teacher.
          </p>
        ))}
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
  // Local variable name avoids shadowing `QuizResponse.autoSubmitted`
  // (the cron-set flag for idle-finalized responses). This banner is
  // tab-switch-specific; the cron-finalized case has no banner yet
  // (deferred UI surface).
  const tabSwitchAutoSubmitted = (myResponse.tabSwitchWarnings ?? 0) >= 3;
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

      {tabSwitchAutoSubmitted && (
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

      {/*
        Pseudonym students (no PIN) reached this from /my-assignments and
        would otherwise be stranded waiting for the teacher to end the
        quiz. PIN-based students joined by code and have nowhere to go
        back to — skip the CTA for them.
      */}
      {!pin && (
        <div className="mt-6">
          <ReturnToAssignmentsButton variant="standalone" />
        </div>
      )}
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

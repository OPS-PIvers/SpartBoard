/**
 * VideoActivityStudentApp — student-facing video activity experience.
 * Accessible at /activity/:sessionId (no Google auth required).
 *
 * Flow (mirrors QuizStudentApp):
 *  - SSO `studentRole` joiners (custom-token users from /my-assignments):
 *    auto-join on mount. No PIN, no class-period picker, no name input.
 *    Their auth UID identifies them; class period is resolved from the
 *    session's `classPeriodByClassId` map when available.
 *  - Anonymous (PIN) joiners: enter PIN, then pick a class period if the
 *    session declares any. No name is collected — Results UI uses
 *    `useAssignmentPseudonyms` for display.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  PlayCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Trophy,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { useVideoActivitySessionStudent } from '@/hooks/useVideoActivitySession';
import { VideoActivityQuestion, VideoActivitySession } from '@/types';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import { VideoPlayer } from './VideoPlayer';
import { QuestionOverlay } from './QuestionOverlay';
import { TeacherPreviewBanner } from '@/components/student/TeacherPreviewBanner';
import { usePreviewMode } from '@/hooks/usePreviewMode';

/**
 * Resolve the SSO student's class period from the session's
 * `classPeriodByClassId` map. Mirrors the Quiz semantics: only resolves
 * when the intersection of the student's claimed `classIds` with the
 * session's targeted `classIds` is unambiguously a single class. When the
 * intersection is empty (claim doesn't overlap the session) or multiple
 * (the student is in 2+ targeted classes), returns `undefined` and lets
 * the response doc carry no period — wrong-but-confident attribution to
 * `periodNames[0]` is worse than no attribution because it silently
 * corrupts results filtering and the export sheet's class-period column.
 */
function resolveSsoClassPeriod(
  session: VideoActivitySession,
  classIdsClaim: string[]
): string | undefined {
  const map = session.classPeriodByClassId;
  if (!map) return undefined;
  const sessionClassIds = new Set(session.classIds ?? []);
  const matches = classIdsClaim
    .filter((id) => sessionClassIds.size === 0 || sessionClassIds.has(id))
    .map((id) => map[id])
    .filter((period): period is string => typeof period === 'string');
  // Dedupe so a student enrolled in multiple targeted classes that share
  // the same period name (e.g. teacher labelled both "Period 1") still
  // resolves cleanly. Only `Set.size !== 1` is genuinely ambiguous.
  const unique = new Set(matches);
  if (unique.size !== 1) return undefined;
  return matches[0];
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export const VideoActivityStudentApp: React.FC = () => {
  // preview mode — see hooks/usePreviewMode
  const previewMode = usePreviewMode();

  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  // True iff `auth.currentUser` carries the `studentRole: true` custom claim
  // minted by `studentLoginV1`. Resolved at mount; drives the auto-join
  // branch in `JoinAndPlay`. Anonymous joiners stay `false`.
  const [isStudentRole, setIsStudentRole] = useState(false);
  // ClassLink class-id list from the SSO custom claim. Used to resolve the
  // joining student's period via `session.classPeriodByClassId`.
  const [ssoClassIds, setSsoClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (previewMode) return;
    const init = async () => {
      try {
        // Sign in anonymously only when nobody is signed in — SSO students
        // arrive with a custom-token user we must keep.
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        const user = auth.currentUser;
        if (user && !user.isAnonymous) {
          // Probe custom claims once. We don't refresh — `studentLoginV1`
          // minted these and a stale token is fine for read-only identity;
          // Firestore rules re-validate on every write.
          const tokenResult = await user.getIdTokenResult();
          if (tokenResult.claims?.studentRole === true) {
            setIsStudentRole(true);
            const claimedClassIds = tokenResult.claims.classIds;
            if (Array.isArray(claimedClassIds)) {
              setSsoClassIds(
                claimedClassIds.filter(
                  (id): id is string => typeof id === 'string' && id.length > 0
                )
              );
            }
          }
        }
      } catch (err) {
        logError('VideoActivityStudentApp.authInit', err);
        setAuthFailed(true);
      } finally {
        setAuthReady(true);
      }
    };
    void init();
  }, [previewMode]);

  if (previewMode) {
    return <VideoActivityPreviewLobby />;
  }

  if (!authReady) {
    return <FullPageLoader message="Loading…" />;
  }

  if (authFailed || !auth.currentUser) {
    return (
      <ErrorScreen message="Unable to connect. Please refresh and try again." />
    );
  }

  return (
    <JoinAndPlay isStudentRole={isStudentRole} ssoClassIds={ssoClassIds} />
  );
};

// ─── Preview lobby ────────────────────────────────────────────────────────────

/** Static read-only preview of the activity join form for teachers. Renders
 * the lobby UI without mounting any hooks that would touch Firebase Auth or
 * Firestore — pasting the `?preview=1` URL into a tab is safe regardless of
 * what auth state that browser profile already carries. */
const VideoActivityPreviewLobby: React.FC = () => (
  <div className="min-h-screen bg-slate-900 flex flex-col">
    <TeacherPreviewBanner />
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <PlayCircle className="w-5 h-5 text-violet-400 mr-2" />
          <span className="text-sm text-slate-300 font-semibold">
            Video Activity
          </span>
        </div>
        <h1 className="text-2xl font-black text-white mb-2 text-center">
          Join Activity
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Enter your PIN from your teacher.
        </p>
        <div className="space-y-4" aria-hidden="true">
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

// ─── Join + Play ───────────────────────────────────────────────────────────────

interface JoinAndPlayProps {
  isStudentRole: boolean;
  ssoClassIds: string[];
}

const JoinAndPlay: React.FC<JoinAndPlayProps> = ({
  isStudentRole,
  ssoClassIds,
}) => {
  // Extract sessionId from /activity/:sessionId
  const sessionId = window.location.pathname.replace(/^\/activity\/?/, '');

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
  // fire-and-forget. `wroteViewRef` dedupes within a single mount (StrictMode
  // double-invoke, session-doc re-emits) — refresh-inflation across mounts
  // is accepted per the "URL opens" framing.
  const wroteViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isViewOnly || !session?.id || !authedUid) return;
    if (wroteViewRef.current === session.id) return;
    wroteViewRef.current = session.id;
    const sessionId = session.id;
    void addDoc(collection(db, 'video_activity_sessions', sessionId, 'views'), {
      viewedAt: serverTimestamp(),
    }).catch((err) => {
      // logError so sustained failures (rule changes, schema drift)
      // surface in error-level log filters rather than warn noise.
      logError('VideoActivityStudentApp.viewLog', err, { sessionId });
    });
  }, [isViewOnly, session?.id, authedUid]);

  // Multi-period selection step — shown when the session has more than one
  // class-period name configured, so anon students pick their period before
  // the response doc is created (mirrors the Quiz pattern). SSO joiners
  // skip this step entirely.
  const [periodStep, setPeriodStep] = useState<string[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  // Local guard for the async `lookupSession` leg of `handleJoin` — the
  // hook's `joinStatus` only flips to `loading` once `joinSession` starts,
  // so without this the button would stay clickable during the lookup and
  // a double-tap could fan out parallel requests.
  const [lookingUp, setLookingUp] = useState(false);

  // SSO auto-join. Mirrors QuizStudentApp's pattern: a single ref guards
  // against StrictMode double-invoke. When `joinStatus` flips to `'error'`,
  // the render-time reset below clears the ref AND `joinStatus` is in the
  // effect deps, so the effect re-fires once on the next render — letting
  // a transient Firestore failure recover without a page refresh. Local
  // `ssoAutoJoinError` covers the lookup-failure leg (`lookupSession`
  // swallows errors and returns `null`); the hook's own `error`/
  // `joinStatus` carry post-lookup failures.
  const ssoAutoJoinStartedRef = useRef(false);
  const [ssoAutoJoinError, setSsoAutoJoinError] = useState<string | null>(null);

  // Re-arm the started ref when the hook reports an error so the effect
  // pass below can retry. Done as adjust-state-during-render rather than
  // an effect to avoid an extra render cycle (per CLAUDE.md "useEffect is
  // an escape hatch"). Pairs with `joinStatus` in the effect deps —
  // without that dep, the reset would have nothing to trigger the rerun.
  if (joinStatus === 'error' && ssoAutoJoinStartedRef.current) {
    ssoAutoJoinStartedRef.current = false;
  }

  useEffect(() => {
    if (!isStudentRole || !sessionId) return;
    if (ssoAutoJoinStartedRef.current) return;
    if (joinStatus === 'joined' || joinStatus === 'loading') return;
    ssoAutoJoinStartedRef.current = true;
    setSsoAutoJoinError(null);
    void (async () => {
      try {
        const sessionInfo = await lookupSession(sessionId);
        if (!sessionInfo) {
          setSsoAutoJoinError(
            'This activity session was not found. Check the link and try again.'
          );
          return;
        }
        const autoClassPeriod = resolveSsoClassPeriod(sessionInfo, ssoClassIds);
        await joinSession(sessionId, undefined, autoClassPeriod);
      } catch (err) {
        logError('VideoActivityStudentApp.ssoAutoJoin', err, { sessionId });
        setSsoAutoJoinError(
          'Something went wrong joining this activity. Please refresh and try again.'
        );
      }
    })();
  }, [
    isStudentRole,
    sessionId,
    ssoClassIds,
    lookupSession,
    joinSession,
    joinStatus,
  ]);

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
    if (!pin.trim() || !sessionId) return;
    if (lookingUp || joinStatus === 'loading') return;
    setLookingUp(true);
    try {
      const sessionInfo = await lookupSession(sessionId);
      const periodNames = sessionInfo?.periodNames ?? [];
      // Anon (PIN) joiners disambiguate by period when the assignment
      // declares more than one — `pin-{period}-{pin}` is what keys the
      // response doc. With a single period there's nothing for the
      // student to choose, so auto-pick to skip a friction tap.
      if (periodNames.length > 1) {
        setPeriodStep(periodNames);
        return;
      }
      await joinSession(sessionId, pin.trim(), periodNames[0]);
    } finally {
      setLookingUp(false);
    }
  };

  const handlePeriodConfirm = useCallback(async () => {
    if (!selectedPeriod || !sessionId) return;
    await joinSession(sessionId, pin.trim(), selectedPeriod);
  }, [joinSession, sessionId, pin, selectedPeriod]);

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

      // View-only shares never persist responses — the Firestore rule
      // rejects the write defense-in-depth, but skip it client-side too so
      // the console stays clean.
      if (!isViewOnly) {
        await submitAnswer(activeQuestion.id, answer);
      }
      setActiveQuestion(null);
    },
    [
      activeQuestion,
      session?.settings?.requireCorrectAnswer,
      sortedQuestions,
      submitAnswer,
      isViewOnly,
    ]
  );

  const handleVideoEnd = useCallback(async () => {
    setVideoEnded(true);
    if (isViewOnly) return;
    await completeActivity();
  }, [completeActivity, isViewOnly]);

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
    // SSO students are auto-joining via the effect above — show the loader
    // (or any error surfaced from the auto-join attempt) instead of the
    // PIN form. Anonymous joiners fall through to the PIN form below.
    if (isStudentRole) {
      if (ssoAutoJoinError || error) {
        // Prefer the hook's specific error (e.g. "session ended", "PIN
        // rejected") over the generic auto-join wrapper message. Mirrors
        // the QuizStudentApp precedence.
        return <ErrorScreen message={error ?? ssoAutoJoinError ?? ''} />;
      }
      return <FullPageLoader message="Joining activity…" />;
    }

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
                  Roster PIN
                </label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Ask your teacher"
                  inputMode="numeric"
                  autoFocus
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
                disabled={joinStatus === 'loading' || lookingUp || !pin.trim()}
                className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {joinStatus === 'loading' || lookingUp ? (
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
  //
  // Defense-in-depth gate: in addition to the existing video-ended /
  // completedAt triggers, also short-circuit to the completion screen when
  // the student is at or past the session's attempt cap, regardless of the
  // response's `completedAt` state. The join hook resets `completedAt: null`
  // when a student rejoins under the cap, and throws AttemptLimitReached
  // when at/over it — so this branch is normally redundant. It exists so a
  // future bug or stale snapshot that leaves a capped response in
  // `completedAt: null` state can't leak the question UI back to the
  // student.
  const attemptLimit = session?.sessionOptions?.attemptLimit ?? null;
  const completedCount = myResponse?.completedAttempts ?? 0;
  const atCap = attemptLimit !== null && completedCount >= attemptLimit;
  if (videoEnded || myResponse?.completedAt || atCap) {
    const answeredCount = myResponse?.answers.length ?? 0;
    const totalQuestions = session?.questions.length ?? 0;
    // Score visibility gates whether the student sees their percentage. The
    // teacher's Publish Scores flow flips `session.scoreVisibility` from
    // `'none'` (or absent) to one of the reveal modes. Until then, the
    // completion screen mirrors Quiz behavior — submitted-only, no score
    // leak. Without this gate the student sees a percentage even when the
    // teacher set visibility to `'none'`.
    const visibility = session?.scoreVisibility ?? 'none';
    const showScore = visibility !== 'none';
    // Derive correctness via the shared grader so MA / FIB-variants /
    // partial-credit semantics line up with the teacher Results view and
    // the in-flight QuestionOverlay submit path. Only computed when the
    // visibility gate would actually display the result.
    const correct = showScore
      ? (session?.questions.filter((q) => {
          const a = myResponse?.answers.find((x) => x.questionId === q.id);
          return a ? gradeVideoActivityAnswer(q, a.answer).isCorrect : false;
        }).length ?? 0)
      : 0;

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
              <p className="text-slate-600 font-medium">Great work!</p>

              {showScore && totalQuestions > 0 && (
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

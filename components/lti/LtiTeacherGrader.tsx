/**
 * Schoology LTI 1.3 — instructor in-iframe grader (Spike 1+, flag-gated).
 *
 * Mounted by LtiLaunchPage on an INSTRUCTOR resource-link launch (a teacher
 * opens an already-attached SpartBoard quiz inside Schoology). It lets the
 * teacher push the quiz's auto-graded scores to the Schoology gradebook via
 * AGS — the LTI analogue of the Google Classroom in-iframe grader
 * (ClassroomAddonTeacherReview / TeacherReviewRoute).
 *
 * It REUSES the Classroom grader's exact data path so the two surfaces can't
 * drift:
 *   1. Teacher signs into SpartBoard (Google) — `useAuth().signInWithGoogle`
 *      gives the Firebase uid (owns the session) + a Drive token (loads the
 *      full quiz with answers/points for the score math).
 *   2. Resolve the `quiz_sessions` doc id from the `quizCode` join code
 *      (`getDocs(query(... where('code','==', normalizeQuizCode(code))))`).
 *   3. Stream the session + responses via `useQuizSessionTeacher(sessionId)`
 *      and load the full QuizData from Drive via `useQuiz().loadQuizData`.
 *   4. Build the grade entries with the SHARED `buildQuizClassroomGradeEntries`
 *      (correctness points scaled onto `maxPoints`) and PATCH them to the
 *      Schoology gradebook with the `ltiPushGradesForAssignmentV1` callable.
 *
 * Differs from the Classroom grader in the PUSH only: there's no GIS token
 * popup. The exchange already minted a server-side `pushAuth` credential (the
 * LTI AGS line-item scope is granted at launch), so the callable takes
 * `{ resourceLinkId, maxPoints, grades, pushAuth }` and resolves each PII-free
 * `pseudonymUid` to a Schoology line-item Score server-side.
 *
 * Lean by design (mirrors TeacherReviewRoute): teacher session hook + quiz
 * library only — NO DashboardProvider, so no dashboard Firestore listeners. The
 * light-theme AddonShell kit matches Schoology's white chrome.
 *
 * TODO(lti): written-response grading. Auto-graded questions only for now —
 * written responses need the WrittenResponseGrader modal + a publish/grade
 * write, which the Classroom grader already wires up; bring it over once the
 * push path is live-verified.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { GraduationCap, Send } from 'lucide-react';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import {
  useQuizSessionTeacher,
  getResponseDocKey,
  QUIZ_SESSIONS_COLLECTION,
} from '@/hooks/useQuizSession';
import { normalizeQuizCode } from '@/utils/quizCode';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { resolveResponseDisplayName } from '@/components/widgets/QuizWidget/utils/resolveDisplayName';
import {
  canScoreResponse,
  getDisplayScore,
  getScoreSuffix,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import {
  buildQuizClassroomGradeEntries,
  type ClassroomGradeEntry,
} from '@/utils/classroomGradePush';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { logError } from '@/utils/logError';
import { isGoogleSession } from '@/utils/googleSession';
import { type QuizData } from '@/types';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
} from '@/components/classroomAddon/AddonShell';

/** Per-student AGS push result the `ltiPushGradesForAssignmentV1` callable returns. */
interface LtiPushGradeResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

/** Resolved shape of the `ltiPushGradesForAssignmentV1` callable. */
interface LtiPushGradesData {
  results: LtiPushGradeResult[];
  /** Successfully written line-item Scores. */
  pushed: number;
  /** Total entries the push was attempted for. */
  total: number;
}

/** Pinned contract for the AGS grade-push callable (built + deployed server-side). */
interface LtiPushGradesParams {
  resourceLinkId: string;
  maxPoints: number;
  grades: ClassroomGradeEntry[];
  pushAuth: string;
}

export const LtiTeacherGrader: React.FC<{
  quizCode: string;
  resourceLinkId: string;
  pushAuth: string;
}> = ({ quizCode, resourceLinkId, pushAuth }) => {
  const { user, signInWithGoogle, googleAccessToken, orgId } = useAuth();

  // The grader loads the teacher's OWN Drive-backed quiz (answers + points) to
  // compute scores and push them, so it needs a real Google sign-in (uid + Drive
  // token) — NOT just any Firebase session. Schoology launches this in a
  // cross-origin iframe where partitioned-storage auth can restore a leftover
  // `studentRole` custom-token session from a prior student launch in the same
  // partition; that has a uid (empty library) but no `google.com` provider and
  // no Drive token. Gating on `!!user` would skip the sign-in card and strand the
  // teacher on an ungradeable empty library. Require a Google session + Drive
  // token so the sign-in card shows until the teacher signs in as themselves.
  const teacherReady = isGoogleSession(user) && !!googleAccessToken;

  // Only subscribe to the teacher's library once they're a real Google session.
  // Passing a stale-session uid (e.g. a restored studentRole user) would open a
  // Firestore listener under a uid whose library the gated UI never shows —
  // wasted reads. useQuiz treats an undefined uid as "no library" (resets to
  // empty), so this just defers the subscription until the teacher signs in.
  // (Mirrors the deep-link picker, PR #1837.)
  const libraryUid = teacherReady ? user?.uid : undefined;
  const {
    quizzes,
    loadQuizData,
    loading: quizzesLoading,
  } = useQuiz(libraryUid);

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolve the session id from the join code (Firestore query → external sync,
  // so an effect is the right tool here). Mirrors TeacherReviewRoute.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resolvingSession, setResolvingSession] = useState(true);
  useEffect(() => {
    if (!quizCode || !user) {
      // Clear any prior session id so a stale one (after logout / a code change)
      // can't keep useQuizSessionTeacher subscribed to the previous session.
      setSessionId(null);
      setResolvingSession(false);
      return;
    }
    let active = true;
    setResolvingSession(true);
    void (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, QUIZ_SESSIONS_COLLECTION),
            where('code', '==', normalizeQuizCode(quizCode))
          )
        );
        if (!active) return;
        setSessionId(snap.empty ? null : snap.docs[0].id);
      } catch (err) {
        if (!active) return;
        logError('LtiTeacherGrader.resolveSession', err, { quizCode });
        setErrorMsg("Couldn't load this assignment's responses.");
      } finally {
        if (active) setResolvingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [quizCode, user]);

  const {
    session,
    responses,
    loading: sessionLoading,
  } = useQuizSessionTeacher(sessionId);

  // Load the full quiz (answers + points) for the score math. The session
  // carries quizId; match it to the teacher's library for the Drive id. Mirrors
  // TeacherReviewRoute's loader exactly.
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  // Which quizId the loaded `quizData` belongs to. The resolved quizId normally
  // settles just once, but if it ever changes — or the loader bails early
  // (library still loading, quiz not in this teacher's library, or no Drive id)
  // — drop the stale quiz synchronously during render (React's "adjust state
  // while rendering" reset, not a setState-in-effect) so the score math can
  // never show a previous quiz's questions/answers while the new one loads.
  const [quizDataForQuizId, setQuizDataForQuizId] = useState<string | null>(
    null
  );
  const currentQuizId = session?.quizId ?? null;
  if (quizData !== null && quizDataForQuizId !== currentQuizId) {
    setQuizData(null);
  }
  useEffect(() => {
    const quizId = session?.quizId;
    if (!quizId) return;
    // Wait for the library to finish loading rather than for a non-empty list —
    // an empty library is a legitimate "not found" signal, not "still loading".
    if (quizzesLoading || !googleAccessToken) return;
    const meta = quizzes.find((q) => q.id === quizId);
    if (!meta) {
      // The session's quiz isn't in this teacher's library (e.g. a co-teacher
      // who doesn't own it) — say so, rather than leaving the controls silently
      // disabled.
      setErrorMsg(
        'This quiz isn’t in your SpartBoard library, so it can’t be graded ' +
          'here. The teacher who created it can grade and push grades.'
      );
      return;
    }
    // The quiz resolved in the library — clear any stale "not in your library"
    // message a transient earlier snapshot may have set.
    setErrorMsg(null);
    if (!meta.driveFileId) return;
    let active = true;
    void (async () => {
      try {
        const data = await loadQuizData(meta.driveFileId);
        if (active) {
          setQuizData(data);
          setQuizDataForQuizId(quizId);
        }
      } catch (err) {
        if (!active) return;
        logError('LtiTeacherGrader.loadQuiz', err, { quizId });
        setErrorMsg("Couldn't load the quiz for grading.");
      }
    })();
    return () => {
      active = false;
    };
  }, [
    session?.quizId,
    quizzes,
    quizzesLoading,
    googleAccessToken,
    loadQuizData,
  ]);

  const pseudonyms = useAssignmentPseudonymsMulti(
    sessionId,
    session?.classIds ?? null,
    orgId
  );

  const questions = useMemo(() => quizData?.questions ?? [], [quizData]);
  const scoreSuffix = getScoreSuffix(session ?? undefined);

  // Per-response display name keyed by the deterministic response-doc key.
  // Schoology students are SSO (studentRole), so their real name resolves via
  // the pseudonym map keyed by studentUid — no roster needed (same as the
  // Classroom grader). PIN joiners (none in the LTI flow) would fall back.
  const displayNameByResponseKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of responses) {
      map.set(
        getResponseDocKey(r),
        resolveResponseDisplayName(r, {}, pseudonyms.byStudentUid)
      );
    }
    return map;
  }, [responses, pseudonyms.byStudentUid]);

  // The gradebook scale = the quiz's total points, so a 17/20 quiz posts 17/20
  // (not a percentage). Fall back to 100 only when the quiz has no points to
  // sum. Same computation as LtiDeepLinkPicker.addQuiz (the attach flow that
  // froze this same denominator into Schoology's line item).
  const maxPoints = useMemo(() => quizMaxPoints(questions), [questions]);

  // Count of completed responses that can ACTUALLY be scored AND carry a
  // resolvable pseudonym — i.e. exactly what buildQuizClassroomGradeEntries
  // will emit. This is the number of grades the push will attempt.
  const gradeableCount = useMemo(
    () =>
      responses.filter(
        (r) =>
          r.status === 'completed' &&
          !!r.studentUid &&
          canScoreResponse(r, questions)
      ).length,
    [responses, questions]
  );

  const pushGrades = useCallback(async () => {
    if (!quizData) return;
    setErrorMsg(null);
    // Pre-flight: don't fire the AGS push when there's nothing gradeable. Mirror
    // buildQuizClassroomGradeEntries' own filter so we never report a push of an
    // empty payload as a success.
    if (gradeableCount === 0) {
      setStatusMsg('No completed responses to push yet.');
      return;
    }
    if (!resourceLinkId) {
      setErrorMsg(
        'Missing the Schoology resource link — re-open SpartBoard from the ' +
          'assignment in your course.'
      );
      return;
    }
    setBusy(true);
    try {
      setStatusMsg('Pushing grades to Schoology…');
      const push = httpsCallable<LtiPushGradesParams, LtiPushGradesData>(
        functions,
        'ltiPushGradesForAssignmentV1'
      );
      const { data } = await push({
        resourceLinkId,
        maxPoints,
        grades: buildQuizClassroomGradeEntries(responses, questions, maxPoints),
        pushAuth,
      });
      // Bucket the non-pushed entries: a student who never opened the assignment
      // in Schoology (no line item yet) is a benign SKIP; anything else (invalid
      // entry, missing line item, or a non-2xx AGS POST) is a real FAILURE to
      // retry. Deriving skipped from total−pushed−failed would mislabel every
      // never-launched student as a connection failure (pushed+failed always
      // equals total, so it would report 0 skipped).
      const notPushed = data.results.filter((r) => !r.ok);
      const skipped = notPushed.filter(
        (r) => r.reason === 'student never launched'
      ).length;
      const failed = notPushed.length - skipped;
      const parts = [
        `Pushed ${data.pushed} grade${data.pushed === 1 ? '' : 's'} to Schoology.`,
      ];
      if (skipped > 0) {
        parts.push(`${skipped} skipped — not opened in Schoology yet.`);
      }
      if (failed > 0) {
        parts.push(
          `${failed} failed to push — check your connection and try again.`
        );
      }
      setStatusMsg(parts.join(' '));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('LtiTeacherGrader.pushGrades', err, {
        sessionId,
        resourceLinkId,
      });
      setErrorMsg(`Couldn't push grades: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [
    quizData,
    gradeableCount,
    resourceLinkId,
    maxPoints,
    responses,
    questions,
    pushAuth,
    sessionId,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!teacherReady) {
    return (
      <AddonShell maxWidthClassName="max-w-md">
        <AddonHeader
          icon={GraduationCap}
          title="Grade this assignment"
          subtitle={
            user
              ? 'Sign in with your teacher Google account to review and push grades right here.'
              : 'Sign in with your school Google account to review and push grades right here.'
          }
        />
        <AddonCard className="p-6">
          <AddonButton
            onClick={() => {
              setErrorMsg(null);
              void signInWithGoogle().catch((err: unknown) => {
                setErrorMsg(
                  `Couldn't sign in: ${
                    err instanceof Error ? err.message : String(err)
                  }`
                );
              });
            }}
          >
            Sign in to SpartBoard
          </AddonButton>
        </AddonCard>
        <div className="mt-4">
          <AddonError message={errorMsg} />
        </div>
      </AddonShell>
    );
  }

  // Loading while resolving the code, or while the session doc is streaming.
  // Once both finish with no session, fall to the not-found state rather than
  // spinning forever (mirrors TeacherReviewRoute).
  const loading = resolvingSession || (sessionId !== null && sessionLoading);
  const notFound = !loading && !session;

  return (
    <AddonShell>
      <AddonHeader
        icon={GraduationCap}
        title="Grade this assignment"
        subtitle={session?.quizTitle ?? 'Review and push grades to Schoology.'}
      />

      {loading ? (
        <AddonCard className="p-6">
          <AddonStatus message="Loading responses…" busy />
        </AddonCard>
      ) : notFound ? (
        <AddonError message="This assignment's session is no longer available." />
      ) : (
        <div className="space-y-4">
          {/* Response list */}
          <AddonCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Responses
              </h2>
              <span className="text-xs text-slate-500">
                {responses.length} student{responses.length === 1 ? '' : 's'}
              </span>
            </div>
            {responses.length === 0 ? (
              <p className="text-sm text-slate-500">
                No responses yet — students who open and complete the assignment
                in Schoology will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {responses.map((r) => {
                  const key = getResponseDocKey(r);
                  const name = displayNameByResponseKey.get(key) ?? 'Student';
                  const done = r.status === 'completed';
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">
                        {name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {quizData
                            ? `${Math.round(
                                getDisplayScore(
                                  r,
                                  questions,
                                  session ?? undefined
                                )
                              )}${scoreSuffix}`
                            : '—'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            done
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {done ? 'Done' : 'In progress'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </AddonCard>

          {/* Push summary + action */}
          <AddonCard className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Ready to push</span>
              <span className="font-semibold text-slate-900">
                {gradeableCount} student{gradeableCount === 1 ? '' : 's'} ·{' '}
                {maxPoints} pts max
              </span>
            </div>
            <AddonButton
              icon={Send}
              loading={busy}
              disabled={!quizData || gradeableCount === 0}
              onClick={() => void pushGrades()}
            >
              Push grades to Schoology
            </AddonButton>
            <p className="text-xs text-slate-500">
              Posts each completed student’s auto-graded score to the Schoology
              gradebook. Auto-graded questions only — written responses aren’t
              graded here yet.
            </p>
          </AddonCard>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <AddonError message={errorMsg} />
        {busy && <AddonStatus message={statusMsg} busy />}
        {!busy && statusMsg && !errorMsg && <AddonStatus message={statusMsg} />}
      </div>
    </AddonShell>
  );
};

export default LtiTeacherGrader;

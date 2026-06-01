/**
 * Google Classroom Add-on TEACHER VIEW — in-iframe quiz grading.
 *
 * Route: /classroom-addon/teacher  WITHOUT an addOnToken (Classroom opens the
 * teacher view of an already-created attachment). The teacher-view URI carries
 * the quiz join `code` (embedded at attach time), so this view can resolve the
 * session and let the teacher grade right inside Classroom — no round-trip to
 * the SpartBoard dashboard.
 *
 * LEAN by design (chosen over mounting the full QuizResults): it runs on the
 * teacher session hook + the quiz library only — NO DashboardProvider, so it
 * adds no dashboard Firestore listeners. It reuses the real WrittenResponseGrader
 * modal and the existing publish-scores / push-grades plumbing.
 *
 * Flow:
 *   1. Teacher signs into SpartBoard (Google) — gives the Firebase uid (owns the
 *      session) + a Drive token (loads the full quiz for grading).
 *   2. Resolve the quiz_sessions doc id from the join code.
 *   3. Stream the session + responses (useQuizSessionTeacher) and load the full
 *      QuizData from Drive (needed: WrittenResponseGrader + score math read the
 *      real questions/answers, not the answer-stripped publicQuestions).
 *   4. The teacher can: grade written responses, publish scores to students
 *      (so the student view shows results — see QuizStudentApp), and push grades
 *      to Classroom (a DRAFT grade; the final "Return" stays in Classroom — an
 *      add-on cannot publish final grades).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ClipboardList, GraduationCap, Send, Eye } from 'lucide-react';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import {
  useQuizSessionTeacher,
  getResponseDocKey,
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/useQuizSession';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { resolveResponseDisplayName } from '@/components/widgets/QuizWidget/utils/resolveDisplayName';
import {
  getDisplayScore,
  getScoreSuffix,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import { WrittenResponseGrader } from '@/components/widgets/QuizWidget/components/WrittenResponseGrader';
import {
  buildQuizClassroomGradeEntries,
  pushClassroomGradesForAssignment,
  formatGradePushToast,
} from '@/utils/classroomGradePush';
import { requestClassroomTeacherToken } from './gisOAuth';
import { logError } from '@/utils/logError';
import {
  isWrittenQuestionType,
  type QuizData,
  type QuizScoreVisibility,
} from '@/types';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
  AddonSelect,
} from './AddonShell';

// Visibility levels the teacher can publish (excludes 'none' = unpublished).
const PUBLISH_OPTIONS: {
  value: Exclude<QuizScoreVisibility, 'none'>;
  label: string;
}[] = [
  { value: 'score-only', label: 'Score only' },
  { value: 'score-and-responses', label: 'Score + their answers' },
  {
    value: 'score-responses-and-answers',
    label: 'Score + answers + correct answers',
  },
];

/** Resolve the quiz_sessions doc id from a join code (mirrors the student lookup). */
function normalizeCode(code: string): string {
  return code
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export const ClassroomAddonTeacherReview: React.FC = () => {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const code = params.get('code') ?? '';
  const kind = params.get('kind') ?? 'quiz';
  const loginHint = params.get('login_hint') ?? undefined;

  const { user, signInWithGoogle, googleAccessToken, orgId } = useAuth();
  const { quizzes, loadQuizData, loading: quizzesLoading } = useQuiz(user?.uid);
  const { publishAssignmentScores } = useQuizAssignments(user?.uid);

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolve the session id from the join code (Firestore query → external sync,
  // so an effect is the right tool here).
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resolvingSession, setResolvingSession] = useState(true);
  useEffect(() => {
    if (kind !== 'quiz' || !code || !user) {
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
            where('code', '==', normalizeCode(code))
          )
        );
        if (!active) return;
        setSessionId(snap.empty ? null : snap.docs[0].id);
      } catch (err) {
        if (!active) return;
        logError('ClassroomAddonTeacherReview.resolveSession', err, { code });
        setErrorMsg("Couldn't load this assignment's responses.");
      } finally {
        if (active) setResolvingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kind, code, user]);

  const {
    session,
    responses,
    loading: sessionLoading,
  } = useQuizSessionTeacher(sessionId);

  // Load the full quiz (answers + points) for the grader + score math. The
  // session carries quizId; match it to the teacher's library for the Drive id.
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  useEffect(() => {
    const quizId = session?.quizId;
    // Wait for the library to finish loading (quizzesLoading) rather than for a
    // non-empty list — an empty library is a legitimate "not found" signal, not
    // "still loading".
    if (!quizId || quizzesLoading || !googleAccessToken) return;
    const meta = quizzes.find((q) => q.id === quizId);
    if (!meta) {
      // The session's quiz isn't in this teacher's library (e.g. a co-teacher
      // who doesn't own it) — say so, rather than leaving the grading controls
      // silently disabled.
      setErrorMsg(
        'This quiz isn’t in your SpartBoard library, so it can’t be graded ' +
          'here. The teacher who created it can grade and push grades.'
      );
      return;
    }
    if (!meta.driveFileId) return;
    let active = true;
    void (async () => {
      try {
        const data = await loadQuizData(meta.driveFileId);
        if (active) setQuizData(data);
      } catch (err) {
        if (!active) return;
        logError('ClassroomAddonTeacherReview.loadQuiz', err, { quizId });
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
  const hasWritten = useMemo(
    () => questions.some((q) => isWrittenQuestionType(q.type)),
    [questions]
  );
  const scoreSuffix = getScoreSuffix(session ?? undefined);

  // Per-response display name keyed by the deterministic response-doc key (same
  // key WrittenResponseGrader + the grade write use). Classroom students are
  // SSO, so their real name resolves via the pseudonym map (no roster needed);
  // PIN names would need rosters we don't have in the iframe, so they fall back.
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

  const [showGrader, setShowGrader] = useState(false);
  const [publishVisibility, setPublishVisibility] = useState<
    Exclude<QuizScoreVisibility, 'none'>
  >('score-and-responses');

  const saveWrittenGrade = useCallback<
    React.ComponentProps<typeof WrittenResponseGrader>['onSaveGrade']
  >(
    async (responseKey, questionId, grade) => {
      if (!sessionId) return;
      await updateDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          responseKey
        ),
        { [`grading.${questionId}`]: grade }
      );
    },
    [sessionId]
  );

  const publish = useCallback(async () => {
    if (!sessionId || !quizData) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      setStatusMsg('Publishing scores to students…');
      const { responsesUpdated } = await publishAssignmentScores(
        sessionId,
        quizData,
        publishVisibility
      );
      setStatusMsg(
        `Published — ${responsesUpdated} student${
          responsesUpdated === 1 ? '' : 's'
        } can now see their results.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('ClassroomAddonTeacherReview.publish', err, { sessionId });
      setErrorMsg(`Couldn't publish scores: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, quizData, publishVisibility, publishAssignmentScores]);

  const pushGrades = useCallback(async () => {
    const attachment = session?.classroomAttachment;
    if (!attachment || !quizData) return;
    // Check for gradeable work BEFORE the OAuth popup — don't prompt the teacher
    // for Classroom permission only to tell them there's nothing to push. Require
    // a RESOLVABLE pseudonym too (the grade builder also needs studentUid), so a
    // quiz completed only by non-SSO/PIN students doesn't pop a consent dialog
    // that then no-ops on an empty payload.
    if (!responses.some((r) => r.status === 'completed' && !!r.studentUid)) {
      setStatusMsg('No completed responses to push yet.');
      return;
    }
    // Guard the grade scale BEFORE the OAuth popup: a malformed/stale attachment
    // could carry 0/NaN maxPoints, which would scale every grade to 0 (or NaN).
    if (!Number.isFinite(attachment.maxPoints) || attachment.maxPoints <= 0) {
      setErrorMsg(
        'This assignment is missing its Classroom point total — re-attach it ' +
          'to push grades.'
      );
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      setStatusMsg('Granting Classroom permission…');
      const accessToken = await requestClassroomTeacherToken(
        user?.email ?? loginHint
      );

      // Scale each completed student's earned points onto the attachment's grade
      // scale (== the quiz's total points) via the shared builder — same scaling
      // the dashboard monitor (QuizResults) uses, so they can't drift.
      const grades = buildQuizClassroomGradeEntries(
        responses,
        questions,
        attachment.maxPoints
      );
      if (grades.length === 0) {
        setStatusMsg('No completed responses to push yet.');
        return;
      }

      setStatusMsg('Pushing grades to Google Classroom…');
      const data = await pushClassroomGradesForAssignment(functions, {
        courseId: attachment.courseId,
        itemId: attachment.itemId,
        attachmentId: attachment.attachmentId,
        accessToken,
        grades,
        maxPoints: attachment.maxPoints,
      });
      setStatusMsg(`${formatGradePushToast(data)} Return them in Classroom.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('ClassroomAddonTeacherReview.pushGrades', err, {
        sessionId,
      });
      // permission-denied → the course isn't linked to ClassLink under this
      // teacher (the CF gates push on the link doc); give an actionable hint
      // instead of the raw error.
      const code = (err as { code?: string } | null)?.code ?? '';
      setErrorMsg(
        code.includes('permission-denied')
          ? 'Only the teacher who linked this course to ClassLink can push grades. Link it from your Classes list first.'
          : `Couldn't push grades: ${message}`
      );
    } finally {
      setBusy(false);
    }
  }, [
    session,
    quizData,
    questions,
    responses,
    user?.email,
    loginHint,
    sessionId,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (kind !== 'quiz') {
    // Video-activity grading-in-iframe is a separate runner (its own Results
    // component) — out of scope for this lean quiz grader.
    return (
      <AddonShell maxWidthClassName="max-w-md">
        <AddonHeader
          icon={GraduationCap}
          title="Review in SpartBoard"
          subtitle="Open this video activity's results from the SpartBoard dashboard to grade and push grades."
        />
      </AddonShell>
    );
  }

  if (!user) {
    return (
      <AddonShell maxWidthClassName="max-w-md">
        <AddonHeader
          icon={GraduationCap}
          title="Grade this assignment"
          subtitle="Sign in with your school Google account to review and grade student work right here."
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
  // Once both finish with no session (empty-code query, a doc deleted between
  // resolve and snapshot, or a listener error the hook swallowed), fall to the
  // not-found state rather than spinning forever.
  const loading = resolvingSession || (sessionId !== null && sessionLoading);
  const notFound = !loading && !session;

  return (
    <AddonShell>
      <AddonHeader
        icon={GraduationCap}
        title="Grade this assignment"
        subtitle={session?.quizTitle ?? 'Review and grade student work.'}
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
                in Classroom will appear here.
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
                          {Math.round(
                            getDisplayScore(r, questions, session ?? undefined)
                          )}
                          {scoreSuffix}
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

          {/* Actions */}
          <AddonCard className="space-y-4 p-4">
            {hasWritten && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">
                  Written responses
                </p>
                <AddonButton
                  variant="secondary"
                  icon={ClipboardList}
                  disabled={!quizData || responses.length === 0}
                  onClick={() => setShowGrader(true)}
                >
                  Grade written responses
                </AddonButton>
              </div>
            )}

            <div>
              <label
                htmlFor="addon-publish-visibility"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Show results to students
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="sm:flex-1">
                  <AddonSelect
                    id="addon-publish-visibility"
                    ariaLabel="What students can see"
                    value={publishVisibility}
                    onChange={(v) =>
                      setPublishVisibility(
                        v as Exclude<QuizScoreVisibility, 'none'>
                      )
                    }
                    placeholder="What students see"
                    options={PUBLISH_OPTIONS}
                  />
                </div>
                <AddonButton
                  variant="secondary"
                  icon={Eye}
                  loading={busy}
                  disabled={!quizData}
                  onClick={() => void publish()}
                >
                  Publish scores
                </AddonButton>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Students see their results when they reopen the assignment.
              </p>
            </div>

            {session?.classroomAttachment && (
              <div className="border-t border-slate-100 pt-4">
                <AddonButton
                  icon={Send}
                  loading={busy}
                  disabled={!quizData}
                  onClick={() => void pushGrades()}
                >
                  Push grades to Classroom
                </AddonButton>
                <p className="mt-1.5 text-xs text-slate-500">
                  Sends each student a draft grade. Open the assignment in
                  Classroom to review and Return them.
                </p>
              </div>
            )}
          </AddonCard>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <AddonError message={errorMsg} />
        {busy && <AddonStatus message={statusMsg} busy />}
        {!busy && statusMsg && !errorMsg && <AddonStatus message={statusMsg} />}
      </div>

      {showGrader && quizData && sessionId && user?.uid && (
        <WrittenResponseGrader
          quiz={quizData}
          responses={responses}
          displayNameByResponseKey={displayNameByResponseKey}
          teacherUid={user.uid}
          onSaveGrade={saveWrittenGrade}
          onClose={() => setShowGrader(false)}
        />
      )}
    </AddonShell>
  );
};

export default ClassroomAddonTeacherReview;

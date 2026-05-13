/**
 * PLC contribution publishing — Firestore-native replacement for the
 * Google-Sheet-based cross-teacher aggregation that previously lived in
 * `quizDriveService.readPlcSheet`.
 *
 * Each PLC member's `QuizResults` view auto-publishes a contribution doc
 * to `/plcs/{plcId}/contributions/{quizId}_{teacherUid}`. Every PLC member
 * can read every contribution (via Firestore rules) — `PlcTab` aggregates
 * across them with `onSnapshot`, no shared sheet required.
 *
 * Side-effect-free `buildContributionDoc` is exported separately so tests
 * (and the offline migration script) can verify the shape without going
 * through Firestore.
 */

import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { gradeAnswer } from '@/hooks/useQuizSession';
import type {
  PlcContribution,
  PlcContributionQuestion,
  PlcContributionResponse,
  QuizData,
  QuizQuestion,
  QuizResponse,
} from '@/types';
import { resolvePinName } from '@/components/widgets/QuizWidget/utils/quizScoreboard';

const PLC_CONTRIBUTION_SCHEMA_VERSION = 1 as const;

export interface PublishPlcContributionArgs {
  plcId: string;
  teacherUid: string;
  teacherName: string;
  quiz: QuizData;
  responses: QuizResponse[];
  /** From `quiz.sync?.groupId` — used by PlcTab to group contributions across members. */
  syncGroupId?: string | null;
  /** PIN → roster display name lookup (per-period when keyed). */
  pinToName?: Record<string, string>;
  /** SSO uid → name lookup for ClassLink joiners (no PIN). */
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
}

/**
 * Resolve the display name for a single response, mirroring the priority
 * used by `buildResultsSheetData` so the PlcTab and a manual sheet export
 * stay consistent. SSO wins over PIN; PIN falls through to "Student (PIN: …)"
 * when the roster lookup misses; unknown joiners are labeled "Student".
 */
function resolveStudentDisplayName(
  response: QuizResponse,
  pinToName: Record<string, string>,
  byStudentUid?: Map<string, { givenName: string; familyName: string }>
): string {
  const sso = byStudentUid?.get(response.studentUid);
  if (sso) {
    const full = `${sso.givenName ?? ''} ${sso.familyName ?? ''}`.trim();
    if (full) return full;
  }
  if (response.pin) {
    const fromRoster = resolvePinName(
      pinToName,
      response.classPeriod,
      response.pin
    );
    return fromRoster ?? `Student (PIN: ${response.pin})`;
  }
  return 'Student';
}

/**
 * Project a single QuizResponse into the typed shape stored on the
 * contribution doc. Grades each answered question via `gradeAnswer` so
 * the PlcTab doesn't have to re-run the grader at view time. The grader
 * is deterministic per (question, answer) pair so re-publishing the same
 * response gives the same row.
 */
function buildContributionResponse(
  response: QuizResponse,
  questions: QuizQuestion[],
  maxPoints: number,
  pinToName: Record<string, string>,
  byStudentUid?: Map<string, { givenName: string; familyName: string }>
): PlcContributionResponse {
  const answerByQuestionId = new Map(
    response.answers.map((a) => [a.questionId, a.answer])
  );

  const pointsByQuestionId: Record<string, number> = {};
  let pointsEarned = 0;
  for (const q of questions) {
    const answer = answerByQuestionId.get(q.id);
    if (answer === undefined) continue;
    // Written types (`short`/`essay`) carry their points on the response's
    // top-level `grading` map; passing it in here keeps the PLC
    // contribution's per-question points and aggregate score in sync with
    // the teacher's manual grading. Ungraded written questions fall back to
    // zero points until the teacher enters a grade.
    const manualGrade =
      q.type === 'short' || q.type === 'essay'
        ? response.grading?.[q.id]
        : undefined;
    const grade = gradeAnswer(q, answer, manualGrade);
    pointsByQuestionId[q.id] = grade.pointsEarned;
    pointsEarned += grade.pointsEarned;
  }

  const status: 'completed' | 'in-progress' =
    response.status === 'completed' ? 'completed' : 'in-progress';
  const scorePercent =
    status === 'completed' && maxPoints > 0
      ? Math.round((pointsEarned / maxPoints) * 100)
      : null;

  return {
    studentDisplayName: resolveStudentDisplayName(
      response,
      pinToName,
      byStudentUid
    ),
    pin: response.pin ?? null,
    classPeriod: response.classPeriod ?? '',
    status,
    scorePercent,
    pointsEarned,
    maxPoints,
    tabSwitchWarnings: response.tabSwitchWarnings ?? 0,
    submittedAt: status === 'completed' ? (response.submittedAt ?? null) : null,
    pointsByQuestionId,
  };
}

/**
 * Produce the full PlcContribution document for the given (teacher, quiz,
 * responses) tuple. Pure / side-effect-free — call this from tests, the
 * migration script, or wrap with `publishPlcContribution` for live writes.
 */
export function buildContributionDoc(
  args: PublishPlcContributionArgs
): PlcContribution {
  const {
    teacherUid,
    teacherName,
    quiz,
    responses,
    pinToName = {},
    byStudentUid,
  } = args;
  const id = `${quiz.id}_${teacherUid}`;
  const maxPoints = quiz.questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  const questionsSnapshot: PlcContributionQuestion[] = quiz.questions.map(
    (q) => ({
      id: q.id,
      text: q.text,
      points: q.points ?? 1,
    })
  );
  const contributionResponses = responses.map((r) =>
    buildContributionResponse(
      r,
      quiz.questions,
      maxPoints,
      pinToName,
      byStudentUid
    )
  );

  return {
    id,
    schemaVersion: PLC_CONTRIBUTION_SCHEMA_VERSION,
    quizId: quiz.id,
    syncGroupId: args.syncGroupId ?? null,
    teacherUid,
    teacherName,
    questionsSnapshot,
    responses: contributionResponses,
    updatedAt: Date.now(),
  };
}

/**
 * Live-write the contribution doc to Firestore. The doc id is pinned to
 * `{quizId}_{teacherUid}` so re-publishing overwrites the same row — safe
 * to call on every responses-update without piling up history.
 */
export async function publishPlcContribution(
  args: PublishPlcContributionArgs
): Promise<void> {
  const contribution = buildContributionDoc(args);
  await setDoc(
    doc(db, 'plcs', args.plcId, 'contributions', contribution.id),
    contribution
  );
}

/**
 * Remove a teacher's contribution from a PLC. Used when she deletes the
 * source assignment or unlinks the PLC — leaves the row in place would
 * leave stale stats in every other member's aggregate.
 */
export async function deletePlcContribution(args: {
  plcId: string;
  quizId: string;
  teacherUid: string;
}): Promise<void> {
  const id = `${args.quizId}_${args.teacherUid}`;
  await deleteDoc(doc(db, 'plcs', args.plcId, 'contributions', id));
}

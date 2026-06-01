/**
 * classroomGradePush — shared seam for the "Push grades to Google Classroom"
 * action that both QuizResults and the Video Activity Results view expose.
 *
 * Each results view builds its own grade payload (the scoring is widget-
 * specific: a quiz scales raw earned points onto the frozen Classroom
 * denominator, a video activity scales the displayed 0–100 percentage). What
 * is *identical* across both is the Cloud Function call and the way its result
 * (and its needs-consent failure) gets turned into a teacher-facing toast.
 * Funneling that through this one module keeps the success / skipped /
 * needs-consent wording from drifting between the two surfaces.
 *
 * The CF (`pushClassroomGradesForAssignment`) is runner-agnostic — it takes
 * `{ courseId, itemId, attachmentId, accessToken, grades }` and writes DRAFT
 * grades to the linked coursework item, resolving each PII-free `pseudonymUid`
 * to a Classroom submission server-side. `accessToken` is a fresh
 * `classroom.addons.teacher` token the monitor mints via a GIS popup at push
 * time (the teacher is present), which the CF PATCHes with directly.
 */

import { httpsCallable, type Functions } from 'firebase/functions';
import { getEarnedPoints } from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import type { QuizQuestion, QuizResponse, QuizSession } from '@/types';

/** A single PII-free grade entry: ClassLink pseudonym → earned points. */
export interface ClassroomGradeEntry {
  pseudonymUid: string;
  pointsEarned: number;
}

/**
 * Build the quiz grade payload for a Classroom push — the single source of truth
 * shared by the dashboard monitor (QuizResults) and the in-iframe grader
 * (TeacherReviewRoute) so their scaling can't drift.
 *
 * One entry per COMPLETED response with a resolvable pseudonym. The current quiz
 * total can drift from the Classroom denominator (`maxPoints`, frozen at attach
 * time) if the quiz was edited after attaching, so each student's raw earned
 * points are scaled onto `maxPoints`, then rounded and clamped to [0, maxPoints].
 * A non-finite earned score (e.g. a malformed question) is treated as 0 so NaN
 * can never propagate into the payload (the CF would otherwise reject it).
 *
 * Callers must still validate `maxPoints` (finite & > 0) and surface an
 * actionable message — this helper assumes a valid denominator.
 */
export function buildQuizClassroomGradeEntries(
  responses: QuizResponse[],
  questions: QuizQuestion[],
  session: QuizSession | null | undefined,
  maxPoints: number
): ClassroomGradeEntry[] {
  const currentTotal = questions.reduce((s, q) => s + (q.points ?? 1), 0);
  return responses
    .filter((r) => r.status === 'completed' && !!r.studentUid)
    .map((r) => {
      const rawPoints = getEarnedPoints(r, questions, session ?? undefined);
      const earned = Number.isFinite(rawPoints) ? rawPoints : 0;
      const scaled = currentTotal > 0 ? (earned / currentTotal) * maxPoints : 0;
      return {
        pseudonymUid: r.studentUid,
        pointsEarned: Math.max(0, Math.min(maxPoints, Math.round(scaled))),
      };
    });
}

/** Arguments the `pushClassroomGradesForAssignment` callable accepts. */
export interface PushClassroomGradesArgs {
  courseId: string;
  itemId: string;
  attachmentId: string;
  /**
   * A fresh `classroom.addons.teacher` access token, minted by the monitor's
   * GIS popup at push time (see `requestClassroomTeacherToken`). The CF PATCHes
   * the DRAFT grades with it directly — the caller is still verified as the
   * linking teacher server-side.
   */
  accessToken: string;
  grades: ClassroomGradeEntry[];
}

/** Per-student result the callable returns alongside the pushed/skipped tally. */
export interface ClassroomGradeResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

/** Shape of the callable's resolved data. */
export interface PushClassroomGradesData {
  results: ClassroomGradeResult[];
  pushed: number;
  skipped: number;
}

/**
 * Invoke the `pushClassroomGradesForAssignment` Cloud Function. The callable is
 * runner-agnostic, so quiz and video-activity callers share it unchanged — they
 * differ only in how they build `args.grades`.
 */
export async function pushClassroomGradesForAssignment(
  functions: Functions,
  args: PushClassroomGradesArgs
): Promise<PushClassroomGradesData> {
  const callable = httpsCallable<
    PushClassroomGradesArgs,
    PushClassroomGradesData
  >(functions, 'pushClassroomGradesForAssignment');
  const { data } = await callable(args);
  return data;
}

/**
 * Build the success toast for a completed push. Skipped entries are students
 * who haven't opened the assignment in Classroom yet (so there's no submission
 * to grade against) — surface that count when non-zero so the teacher isn't
 * confused by a lower-than-expected pushed total.
 */
export function formatGradePushToast(data: PushClassroomGradesData): string {
  const skippedNote =
    data.skipped > 0
      ? ` ${data.skipped} skipped — students who haven't opened the assignment yet.`
      : '';
  return (
    `Pushed ${data.pushed} grade${data.pushed === 1 ? '' : 's'} to Google ` +
    `Classroom.${skippedNote}`
  );
}

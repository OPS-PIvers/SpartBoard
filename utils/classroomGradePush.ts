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
import {
  getEarnedPoints,
  canScoreResponse,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import type { QuizQuestion, QuizResponse } from '@/types';

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
 * One entry per COMPLETED response with a resolvable pseudonym THAT CAN ACTUALLY
 * BE SCORED. The current quiz total can drift from the Classroom denominator
 * (`maxPoints`, frozen at attach time) if the quiz was edited after attaching, so
 * each student's CORRECTNESS points are scaled onto `maxPoints`, then rounded and
 * clamped to [0, maxPoints]. A non-finite earned score (e.g. a malformed
 * question) is treated as 0 so NaN can never propagate into the payload (the CF
 * would otherwise reject it).
 *
 * Responses `canScoreResponse` rejects (the answer key hasn't loaded, or a
 * synced-quiz id drift means no answer maps to a loaded question) are EXCLUDED
 * rather than pushed: `getEarnedPoints` would silently return 0 for them, and
 * unlike the "—" placeholder the teacher views render, a phantom 0 written to the
 * real Classroom gradebook is persistent and hard to notice/undo. Omitting a
 * student is the safe default — better no grade than a wrong 0.
 *
 * Grades are intentionally correctness-based: `getEarnedPoints` is called with NO
 * session, so speed/streak bonuses are excluded. A Classroom gradebook grade
 * should reflect mastery, not answer speed — with bonuses folded in, `earned`
 * can exceed the raw total and a fast-but-wrong student would clamp up to full
 * marks. The live monitor still shows the gamified "pts" (getDisplayScore); only
 * the pushed grade is correctness-based.
 *
 * Callers must still validate `maxPoints` (finite & > 0) and surface an
 * actionable message — this helper assumes a valid denominator.
 */
export function buildQuizClassroomGradeEntries(
  responses: QuizResponse[],
  questions: QuizQuestion[],
  maxPoints: number
): ClassroomGradeEntry[] {
  const currentTotal = questions.reduce((s, q) => s + (q.points ?? 1), 0);
  return responses
    .filter(
      (r) =>
        r.status === 'completed' &&
        !!r.studentUid &&
        // Skip responses we can't actually score (answer key not loaded /
        // question-id drift) so a phantom 0 never reaches the gradebook.
        canScoreResponse(r, questions)
    )
    .map((r) => {
      // No session arg → correctness points only (no speed/streak bonus); see
      // the function doc for why the gradebook grade excludes gamification.
      const rawPoints = getEarnedPoints(r, questions);
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
  /**
   * The attachment's frozen grade scale. Forwarded so the CF can clamp each
   * pointsEarned to [0, maxPoints] server-side (defense-in-depth; the client
   * already clamps in buildQuizClassroomGradeEntries). Optional for back-compat.
   */
  maxPoints?: number;
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
  /** Successfully PATCHed. */
  pushed: number;
  /** Benign: the student hadn't opened the attachment, so there's nothing to grade. */
  skipped: number;
  /** Real errors (upstream PATCH / lookup / malformed) the teacher should retry. */
  failed: number;
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
 * Build the result toast for a completed push. Two non-pushed buckets are
 * surfaced SEPARATELY so a real failure is never disguised as a benign skip:
 *   - `skipped`: students who haven't opened the assignment in Classroom yet
 *     (no submission to grade against) — expected, no action needed.
 *   - `failed`: entries that errored upstream (token/network/lookup) — the
 *     teacher should retry. Reporting these as "not opened yet" would make a
 *     failed push look like a partial success.
 */
export function formatGradePushToast(data: PushClassroomGradesData): string {
  const parts = [
    `Pushed ${data.pushed} grade${data.pushed === 1 ? '' : 's'} to Google Classroom.`,
  ];
  if (data.skipped > 0) {
    parts.push(`${data.skipped} skipped — not opened in Classroom yet.`);
  }
  if (data.failed > 0) {
    parts.push(
      `${data.failed} failed to push — check your connection and try again.`
    );
  }
  return parts.join(' ');
}

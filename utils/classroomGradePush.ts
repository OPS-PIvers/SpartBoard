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
 * `{ courseId, itemId, attachmentId, grades }` and writes DRAFT grades to the
 * linked coursework item, resolving each PII-free `pseudonymUid` to a
 * Classroom userId server-side.
 */

import { httpsCallable, type Functions } from 'firebase/functions';

/** A single PII-free grade entry: ClassLink pseudonym → earned points. */
export interface ClassroomGradeEntry {
  pseudonymUid: string;
  pointsEarned: number;
}

/** Arguments the `pushClassroomGradesForAssignment` callable accepts. */
export interface PushClassroomGradesArgs {
  courseId: string;
  itemId: string;
  attachmentId: string;
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

/**
 * True when the CF rejected because the teacher's Google grant is missing the
 * scope needed to write grades (the server throws a `needs-consent` error).
 * Callers surface a "reconnect your Google account" toast in this case rather
 * than the generic failure message.
 */
export function isNeedsConsentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /needs-consent/i.test(message);
}

/**
 * ltiGradePush — shared client seam for the "Push to Schoology" action exposed
 * by both QuizResults and the Video Activity Results view.
 *
 * The grade payload is built per-widget (quiz scales correctness points onto the
 * quiz denominator; VA scales the displayed percentage onto the activity
 * denominator), but the callable contract, the result bucketing, the toast
 * wording, and the error→message mapping are IDENTICAL across both surfaces.
 * Funnelling them through one module keeps the two views from drifting (they
 * previously inlined slightly different bucketing + a hard-coded reason string).
 *
 * Mirrors the Classroom analogue in `classroomGradePush.ts`.
 */

import type { ClassroomGradeEntry } from '@/utils/classroomGradePush';

/** A Schoology grade entry is shape-identical to the Classroom one. */
export type LtiGradeEntry = ClassroomGradeEntry;

/**
 * The grade-push CF's benign "skip" reason: the student hasn't opened the
 * assignment in Schoology yet, so there is no AGS line item to score against.
 * `ltiPushGradesForAssignmentV1` returns this verbatim; the bucketing below
 * matches on it to separate skips from real failures. MUST stay in sync with
 * the server literal in `functions/src/lti/serviceEndpoints.ts`.
 */
export const LTI_PUSH_SKIP_REASON = 'student never launched';

/** Per-student AGS push result the callable returns. */
export interface LtiPushGradeResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

/** Resolved shape of the `ltiPushGradesForAssignmentV1` callable. */
export interface LtiPushGradesData {
  results: LtiPushGradeResult[];
  /** Successfully written line-item Scores. */
  pushed: number;
  /** Total entries the push was attempted for. */
  total: number;
}

/** Request shape for the `ltiPushGradesForAssignmentV1` callable. */
export interface LtiPushGradesRequest {
  sessionId: string;
  kind: 'quiz' | 'va';
  maxPoints: number;
  grades: LtiGradeEntry[];
}

/**
 * Split a push result into pushed / skipped / failed. A not-ok entry whose
 * reason is `LTI_PUSH_SKIP_REASON` is a benign skip (student hasn't opened the
 * assignment in Schoology yet); every other not-ok entry is a real failure to
 * retry. Deriving skipped from total−pushed−failed would mislabel every
 * never-launched student as a failure, so we count it explicitly.
 */
export function bucketLtiPushResults(data: LtiPushGradesData): {
  pushed: number;
  skipped: number;
  failed: number;
} {
  const notPushed = data.results.filter((r) => !r.ok);
  const skipped = notPushed.filter(
    (r) => r.reason === LTI_PUSH_SKIP_REASON
  ).length;
  return { pushed: data.pushed, skipped, failed: notPushed.length - skipped };
}

/** Build the teacher-facing toast for a completed Schoology push. */
export function formatLtiPushToast(b: {
  pushed: number;
  skipped: number;
  failed: number;
}): string {
  const parts = [
    `Pushed ${b.pushed} grade${b.pushed === 1 ? '' : 's'} to Schoology.`,
  ];
  if (b.skipped > 0) {
    parts.push(`${b.skipped} skipped — not opened in Schoology yet.`);
  }
  if (b.failed > 0) {
    parts.push(
      `${b.failed} failed to push — check your connection and try again.`
    );
  }
  return parts.join(' ');
}

/**
 * Map a thrown callable error to a teacher-facing message. `failed-precondition`
 * (the assignment isn't linked to Schoology) and `permission-denied` (not the
 * owning teacher) are NOT connectivity problems — retrying won't help — so the
 * server's actionable message is surfaced verbatim. Everything else (network,
 * `unavailable`, timeouts, unknown) gets the generic retry copy. The Firebase
 * callable SDK prefixes codes with `functions/`, so we match on the suffix.
 */
export function ltiPushErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  const message = (err as { message?: string } | null)?.message ?? '';
  const actionable =
    code.endsWith('failed-precondition') ||
    code.endsWith('permission-denied') ||
    code.endsWith('invalid-argument');
  if (actionable && message) return message;
  return 'Could not push grades to Schoology — check your connection and try again.';
}

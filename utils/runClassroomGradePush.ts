/**
 * runClassroomGradePush — the one shared "Push grades to Google Classroom" flow
 * behind the three teacher surfaces that expose it:
 *   - the dashboard quiz monitor (QuizResults),
 *   - the dashboard video-activity monitor (VideoActivityWidget Results), and
 *   - the in-iframe quiz grader (TeacherReviewRoute).
 *
 * Each surface differs ONLY in how it builds its grade payload (quiz scaling vs
 * video-activity percentage) and how it reports progress (toasts vs an inline
 * status line). The orchestration in between — minting a fresh add-on teacher
 * token, calling the Cloud Function, and discriminating a "course not linked"
 * permission-denied from a generic failure — is identical, and was previously
 * copy-pasted into all three. Centralizing it here keeps the wording and the
 * failure handling from drifting between surfaces.
 *
 * The CF wrapper (`pushClassroomGradesForAssignment`) lives in
 * `@/utils/classroomGradePush`; this module imports it across that module
 * boundary ON PURPOSE so a test can mock the CF at the
 * `@/utils/classroomGradePush` seam while exercising the real orchestration here
 * (an intra-module call could not be intercepted that way).
 *
 * Pre-flight guards (maxPoints validity + an eligible-empty check) stay at the
 * CALL SITE because their ORDER and reporting channel differ per surface; the
 * shared helpers/constants below let those guards stay byte-identical without
 * living here. This function begins at the optional confirm.
 */
import type { Functions } from 'firebase/functions';
import type { Toast } from '@/types';
import { logError } from '@/utils/logError';
import {
  pushClassroomGradesForAssignment,
  formatGradePushToast,
  type ClassroomGradeEntry,
  type PushClassroomGradesData,
} from '@/utils/classroomGradePush';

/** Shared copy: the attachment carries no usable Classroom point total. */
export const MISSING_MAX_POINTS_MESSAGE =
  'This assignment is missing its Classroom point total — re-attach it to push grades.';

/** Shared copy: the benign "nothing eligible to push" toast (info, not error). */
export const NOTHING_TO_PUSH_TOAST = 'No completed submissions to push yet';

/** Shared copy: the GIS consent popup was dismissed / failed. */
export const TOKEN_CANCELLED_MESSAGE =
  'Google sign-in was cancelled — no grades were pushed.';

/** Shared copy: the push failed because the course isn't ClassLink-linked. */
export const PUSH_PERMISSION_DENIED_MESSAGE =
  'Only the teacher who linked this course to ClassLink can push grades. Link it from your Classes list first.';

/** Shared copy: a generic (non-permission) push failure. */
export const GRADE_PUSH_GENERIC_ERROR_MESSAGE =
  'Could not push grades to Google Classroom.';

/** True when a Classroom attachment's frozen denominator is usable for scaling. */
export function hasValidMaxPoints(maxPoints: number): boolean {
  return Number.isFinite(maxPoints) && maxPoints > 0;
}

/**
 * True when a thrown CF error is the batch endpoint's `permission-denied` —
 * raised when the course isn't linked to ClassLink under the calling teacher.
 */
export function isPushPermissionDenied(err: unknown): boolean {
  // `code` is a string for Firebase callable errors, but guard the type: a
  // non-Firebase error can carry a numeric `code` (e.g. 403), and `??` wouldn't
  // catch it — `.includes()` on a number would throw and turn a handled error
  // into an unhandled one.
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.includes('permission-denied');
}

/** The Classroom-attachment identifiers + frozen scale a push targets. */
export interface ClassroomGradePushAttachment {
  courseId: string;
  itemId: string;
  attachmentId: string;
  maxPoints: number;
}

/**
 * Progress / terminal beats `runClassroomGradePush` emits, in order. A run goes
 * `start` → `requesting-token` → (`token-cancelled` | `nothing-to-push` |
 * (`pushing` → `pushed`)) and always ends on `settled`. Each surface maps these
 * to its own UI (a toast monitor ignores the progress beats; the iframe shows
 * them as an inline status line).
 */
export type ClassroomGradePushStatus =
  | { phase: 'start' }
  | { phase: 'requesting-token' }
  | { phase: 'pushing' }
  | { phase: 'token-cancelled'; error: unknown }
  | { phase: 'nothing-to-push' }
  | { phase: 'pushed'; data: PushClassroomGradesData }
  | { phase: 'settled' };

/** A failed push, with the permission-denied case pre-discriminated. */
export interface ClassroomGradePushError {
  permissionDenied: boolean;
  error: unknown;
}

export interface RunClassroomGradePushOptions {
  functions: Functions;
  /**
   * The Classroom attachments to push to — ONE per linked course (Item D
   * multi-course fan-out). Must be non-empty (callers run their maxPoints /
   * eligibility guards first). The token is minted ONCE and the SAME grade
   * payload is sent to each course, so the teacher sees a single consent popup,
   * not one per course; a per-course failure is collected, never fatal to the
   * others. The in-iframe grader (one open courseWork) simply passes a
   * single-element array.
   */
  attachments: ClassroomGradePushAttachment[];
  /** Builds the PII-free grade payload — the only genuinely per-surface logic. */
  buildGrades: () => ClassroomGradeEntry[];
  /** Mints a fresh `classroom.addons.teacher` token (a GIS popup). */
  requestToken: () => Promise<string>;
  /** Maps each emitted status beat to the surface's UI. */
  onStatus: (status: ClassroomGradePushStatus) => void;
  /** Renders a push failure (permission-denied vs generic) in the surface's UI. */
  onError: (err: ClassroomGradePushError) => void;
  /**
   * Optional confirm gate run BEFORE any token mint. Resolve false to abort
   * silently (no status emitted). The dashboard monitors confirm; the in-iframe
   * grader pushes without a dialog (omit).
   */
  confirm?: () => Promise<boolean>;
  /**
   * When true, a token/consent failure is reported as a distinct
   * `token-cancelled` status (and logged under `${logTag}.token`) instead of
   * falling through to `onError` as a generic failure. The dashboard monitors
   * set this; the iframe folds a token failure into its generic error line.
   */
  distinctTokenCancel?: boolean;
  /** logError tag for a push failure (the token catch logs `${logTag}.token`). */
  logTag: string;
  /**
   * Extra logError context (e.g. sessionId / attachmentId). Matches logError's
   * own `LogErrorContext` value shape (scalars only — it isn't exported).
   */
  logContext?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Run the shared push flow. Owns everything from the (optional) confirm through
 * the token mint, the CF call, and its success / failure reporting; the caller's
 * pre-flight guards run before this.
 */
export async function runClassroomGradePush({
  functions,
  attachments,
  buildGrades,
  requestToken,
  onStatus,
  onError,
  confirm,
  distinctTokenCancel,
  logTag,
  logContext,
}: RunClassroomGradePushOptions): Promise<void> {
  if (confirm) {
    const confirmed = await confirm();
    if (!confirmed) return;
  }

  onStatus({ phase: 'start' });
  try {
    onStatus({ phase: 'requesting-token' });
    let accessToken: string;
    if (distinctTokenCancel) {
      // The teacher is present; a cancelled/failed consent is a distinct, benign
      // outcome (nothing was pushed) — surfaced apart from a CF failure.
      try {
        accessToken = await requestToken();
      } catch (tokenErr) {
        logError(`${logTag}.token`, tokenErr, logContext);
        onStatus({ phase: 'token-cancelled', error: tokenErr });
        return;
      }
    } else {
      // No distinct handling: a token failure falls through to the catch below
      // and renders as a generic push error (the iframe's behavior).
      accessToken = await requestToken();
    }

    const grades = buildGrades();
    if (grades.length === 0) {
      onStatus({ phase: 'nothing-to-push' });
      return;
    }

    onStatus({ phase: 'pushing' });
    // Fan the SAME payload out to EVERY linked course, reusing the one token
    // minted above. Per-course failures are collected (logged with their
    // courseId), NOT thrown — a 403 on one course can't abort the rest — and the
    // counts are aggregated into a single result. Each student resolves a
    // submission only in the course they actually launched, so sending every
    // course the full payload is safe (the others skip them). Only if EVERY
    // course fails do we surface the failure, discriminating the last error's
    // permission-denied case so the right remediation copy shows.
    const agg: PushClassroomGradesData = {
      results: [],
      pushed: 0,
      skipped: 0,
      failed: 0,
    };
    let anySucceeded = false;
    let lastError: unknown = null;
    for (const attachment of attachments) {
      try {
        const data = await pushClassroomGradesForAssignment(functions, {
          courseId: attachment.courseId,
          itemId: attachment.itemId,
          attachmentId: attachment.attachmentId,
          accessToken,
          grades,
          maxPoints: attachment.maxPoints,
        });
        agg.results.push(...data.results);
        agg.pushed += data.pushed;
        agg.skipped += data.skipped;
        agg.failed += data.failed;
        anySucceeded = true;
      } catch (err) {
        lastError = err;
        logError(logTag, err, { ...logContext, courseId: attachment.courseId });
      }
    }
    if (anySucceeded) {
      onStatus({ phase: 'pushed', data: agg });
    } else {
      onError({
        permissionDenied: isPushPermissionDenied(lastError),
        error: lastError,
      });
    }
  } catch (err) {
    logError(logTag, err, logContext);
    onError({ permissionDenied: isPushPermissionDenied(err), error: err });
  } finally {
    onStatus({ phase: 'settled' });
  }
}

/**
 * Build the `{ onStatus, onError }` reporter the two dashboard monitors share —
 * they are byte-identical: progress beats are silent, a completed push is a
 * success toast, a cancelled consent / failed push is an error toast, and the
 * pushing flag toggles on `start` / `settled`. The in-iframe grader does NOT use
 * this (it renders an inline status line instead).
 */
export function createToastGradePushHandlers(
  addToast: (message: string, type: Toast['type']) => void,
  setPushing: (pushing: boolean) => void
): Pick<RunClassroomGradePushOptions, 'onStatus' | 'onError'> {
  return {
    onStatus: (status) => {
      switch (status.phase) {
        case 'start':
          setPushing(true);
          break;
        case 'settled':
          setPushing(false);
          break;
        case 'token-cancelled':
          addToast(TOKEN_CANCELLED_MESSAGE, 'error');
          break;
        case 'nothing-to-push':
          addToast(NOTHING_TO_PUSH_TOAST, 'info');
          break;
        case 'pushed':
          addToast(formatGradePushToast(status.data), 'success');
          break;
        case 'requesting-token':
        case 'pushing':
          // The dashboard monitors show no inline progress — these are silent.
          break;
      }
    },
    onError: ({ permissionDenied }) =>
      addToast(
        permissionDenied
          ? PUSH_PERMISSION_DENIED_MESSAGE
          : GRADE_PUSH_GENERIC_ERROR_MESSAGE,
        'error'
      ),
  };
}

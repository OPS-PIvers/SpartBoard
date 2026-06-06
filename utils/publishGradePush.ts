/**
 * publishGradePush — the "Publish = Push" chaining shared by the quiz and
 * video-activity Publish-Scores flows. After a SpartBoard publish succeeds, this
 * also pushes grades to whichever LMS the assignment is linked to, in the SAME
 * action, so the teacher never has to separately remember to "Push grades".
 *
 * Two pushes, independent and non-fatal:
 *   - Google Classroom → the FINAL-grade CF (assignedGrade + return), using a
 *     `classroom.coursework.students` token the CALLER pre-mints from the Publish
 *     click (a user gesture — `requestClassroomFinalGradeToken`); passing it in
 *     keeps the GIS popup out of the post-publish await chain where it'd be
 *     blocked. A null token (unlinked, or the teacher dismissed consent) skips
 *     the GC push with a clear "use Push grades to retry" note.
 *   - Schoology → the existing AGS push CF (server-side, no popup).
 *
 * The SpartBoard publish has ALREADY committed before this runs, so a push
 * failure must NEVER throw — it's reported as its own toast and the publish
 * stands. Responses are fetched ONCE here (only when something is actually
 * linked) and handed to the caller's runner-specific grade builders, so quiz vs
 * VA scaling stays where it already lives.
 */
import { httpsCallable, type Functions } from 'firebase/functions';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ClassroomAttachmentLink, Toast } from '@/types';
import { logError } from '@/utils/logError';
import {
  pushClassroomFinalGradesForAssignment,
  formatGradePushToast,
  type ClassroomGradeEntry,
} from '@/utils/classroomGradePush';
import {
  hasValidMaxPoints,
  isPushPermissionDenied,
  GRADE_PUSH_GENERIC_ERROR_MESSAGE,
} from '@/utils/runClassroomGradePush';
import {
  bucketLtiPushResults,
  formatLtiPushToast,
  ltiPushErrorMessage,
  type LtiGradeEntry,
  type LtiPushGradesData,
  type LtiPushGradesRequest,
} from '@/utils/ltiGradePush';

/** Copy shown when an assignment is Classroom-linked but no token was minted. */
export const CLASSROOM_PUSH_SKIPPED_NO_TOKEN =
  'Scores published. Google Classroom grades weren’t sent (sign-in needed) — use “Push grades” on the Results screen to send them.';

/**
 * Classroom-specific permission-denied copy. The final push is gated on the
 * Google Classroom course link (who assigned it), NOT the ClassLink roster link,
 * so the generic `PUSH_PERMISSION_DENIED_MESSAGE` ("link to ClassLink") would be
 * the wrong remediation here.
 */
export const CLASSROOM_FINAL_PUSH_PERMISSION_DENIED =
  'Only the teacher who assigned this to Google Classroom can push its final grades.';

export interface RunPublishGradePushOptions<R> {
  functions: Functions;
  addToast: (message: string, type: Toast['type']) => void;
  kind: 'quiz' | 'va';
  /** Session id (== assignmentId). Identifies the responses + the Schoology line item. */
  sessionId: string;
  /**
   * The Google Classroom attachments eligible for the FINAL-grade auto-push —
   * ALREADY filtered by the caller to partner-first (SpartBoard owns the
   * courseWork) AND the feature being enabled. One per linked course (Item D
   * multi-course fan-out); empty when not eligible (student-initiated, flag off,
   * or unlinked), in which case GC is skipped silently and the manual draft
   * "Push grades" button remains the path. Pre-filtering here is ALSO what keeps
   * the restricted `classroom.coursework.students` token behind the feature flag.
   */
  classroomFinalAttachments: ClassroomAttachmentLink[];
  /**
   * A `classroom.coursework.students` token pre-minted from the Publish click —
   * only when there are eligible attachments. null → the teacher dismissed the
   * popup.
   */
  classroomToken: string | null;
  /**
   * The Schoology line item's frozen denominator (quiz/VA maxPoints). Schoology
   * linkage itself is read from the session doc here (`ltiAttachment` lives on
   * the session, not the assignment), so the caller need only supply the scale.
   */
  schoologyMaxPoints: number;
  /** Build the Classroom payload (scaled to the attachment's frozen maxPoints). */
  buildClassroomGrades: (responses: R[]) => ClassroomGradeEntry[];
  /** Build the Schoology payload (scaled to schoologyMaxPoints). */
  buildSchoologyGrades: (responses: R[]) => LtiGradeEntry[];
}

/** The Firestore session collection a runner kind targets. */
function sessionCollectionForKind(kind: 'quiz' | 'va'): string {
  return kind === 'va' ? 'video_activity_sessions' : 'quiz_sessions';
}

/**
 * Chain the LMS grade push(es) after a successful publish. Never throws — every
 * failure is surfaced as a toast so the (already-committed) publish stands.
 */
export async function runPublishGradePush<R>({
  functions,
  addToast,
  kind,
  sessionId,
  classroomFinalAttachments,
  classroomToken,
  schoologyMaxPoints,
  buildClassroomGrades,
  buildSchoologyGrades,
}: RunPublishGradePushOptions<R>): Promise<void> {
  // The attachments are pre-filtered to partner-first + flag-on, with a valid
  // grade scale (defensive re-check below). A student-initiated attachment is
  // never here — its courseWork isn't SpartBoard's to set assignedGrade on, so
  // the manual draft "Push grades" button remains its path.
  const gcAttachments = classroomFinalAttachments.filter((a) =>
    hasValidMaxPoints(a.maxPoints)
  );
  const needGcPush = gcAttachments.length > 0 && !!classroomToken;

  // Eligible but no token → the teacher dismissed consent (or it's a re-publish
  // without a fresh popup). Publish already stood; nudge toward the manual push.
  if (gcAttachments.length > 0 && !classroomToken) {
    addToast(CLASSROOM_PUSH_SKIPPED_NO_TOKEN, 'info');
  }

  // Schoology linkage lives on the SESSION doc (not the assignment), so read it
  // here. One cheap getDoc on an infrequent action; failures fall back to "not
  // linked" (the Schoology push is then skipped).
  let ltiLinked = false;
  try {
    const sessSnap = await getDoc(
      doc(db, sessionCollectionForKind(kind), sessionId)
    );
    ltiLinked = !!(sessSnap.data() as { ltiAttachment?: unknown } | undefined)
      ?.ltiAttachment;
  } catch (err) {
    logError('publishGradePush.readSession', err, { sessionId, kind });
  }

  // Nothing to push → done.
  if (!needGcPush && !ltiLinked) return;

  // Fetch the assignment's responses ONCE; both pushes scale from the same set.
  let responses: R[] = [];
  try {
    const snap = await getDocs(
      collection(db, sessionCollectionForKind(kind), sessionId, 'responses')
    );
    responses = snap.docs.map((d) => d.data() as R);
  } catch (err) {
    logError('publishGradePush.fetchResponses', err, { sessionId, kind });
    addToast(
      'Scores published, but grades could not be read to push to your LMS — use “Push grades” to retry.',
      'error'
    );
    return;
  }

  // Google Classroom — FINAL grade (assignedGrade + return), fanned out to EACH
  // linked course. The grade build is INSIDE the try so a malformed response
  // can't throw out of this function and surface as "Failed to publish" (the
  // publish already committed). Each student only resolves a submission for the
  // course they actually launched, so the same payload is safe to send to every
  // attachment — a student in course A is skipped by course B's push.
  if (needGcPush && classroomToken) {
    try {
      const grades = buildClassroomGrades(responses);
      if (grades.length > 0) {
        const agg = { pushed: 0, skipped: 0, failed: 0 };
        let permissionDenied = false;
        let unreachableCourses = 0;
        for (const att of gcAttachments) {
          try {
            const data = await pushClassroomFinalGradesForAssignment(
              functions,
              {
                courseId: att.courseId,
                itemId: att.itemId,
                attachmentId: att.attachmentId,
                accessToken: classroomToken,
                grades,
                maxPoints: att.maxPoints,
              }
            );
            agg.pushed += data.pushed;
            agg.skipped += data.skipped;
            agg.failed += data.failed;
          } catch (err) {
            logError('publishGradePush.classroom', err, {
              sessionId,
              courseId: att.courseId,
            });
            if (isPushPermissionDenied(err)) permissionDenied = true;
            unreachableCourses += 1;
          }
        }
        if (agg.pushed === 0 && (permissionDenied || unreachableCourses > 0)) {
          addToast(
            permissionDenied
              ? CLASSROOM_FINAL_PUSH_PERMISSION_DENIED
              : GRADE_PUSH_GENERIC_ERROR_MESSAGE,
            'error'
          );
        } else {
          const suffix =
            unreachableCourses > 0
              ? ` Couldn’t reach ${unreachableCourses} course${unreachableCourses === 1 ? '' : 's'} — retry.`
              : '';
          addToast(
            formatGradePushToast({ results: [], ...agg }) + suffix,
            agg.failed > 0 || unreachableCourses > 0 ? 'error' : 'success'
          );
        }
      }
    } catch (err) {
      // Per-course CF throws are caught inside the loop above, so the only thing
      // that reaches here is `buildClassroomGrades` throwing on a malformed
      // response — tag it distinctly from the per-course `.classroom` logs.
      logError('publishGradePush.classroom.build', err, { sessionId });
      addToast(GRADE_PUSH_GENERIC_ERROR_MESSAGE, 'error');
    }
  }

  // Schoology — AGS final score (server-side, no popup). Build inside the try too.
  if (ltiLinked) {
    try {
      const grades = buildSchoologyGrades(responses);
      if (grades.length > 0) {
        const push = httpsCallable<LtiPushGradesRequest, LtiPushGradesData>(
          functions,
          'ltiPushGradesForAssignmentV1'
        );
        const { data } = await push({
          sessionId,
          kind,
          maxPoints: schoologyMaxPoints,
          grades,
        });
        const bucket = bucketLtiPushResults(data);
        addToast(
          formatLtiPushToast(bucket),
          bucket.failed > 0 ? 'error' : 'success'
        );
      }
    } catch (err) {
      logError('publishGradePush.schoology', err, { sessionId });
      addToast(ltiPushErrorMessage(err), 'error');
    }
  }
}

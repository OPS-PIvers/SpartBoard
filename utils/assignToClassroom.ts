/**
 * Client seam for the teacher-initiated ("partner-first") "Assign to Google
 * Classroom" flow: the callable wrapper for the `assignToClassroomV1` Cloud
 * Function, plus the linkage-persistence helper that records the resulting
 * `classroomAttachment` so the EXISTING grade-push button (which reads
 * `session.classroomAttachment`) lights up unchanged.
 *
 * Gated upstream behind CLASSROOM_ASSIGN_ENABLED — see config/constants.ts.
 */
import { httpsCallable, type Functions } from 'firebase/functions';
import { doc, updateDoc, type Firestore } from 'firebase/firestore';
import type { ClassroomAttachmentLink } from '@/types';

/** Which SpartBoard runner the assignment targets. */
export type AssignRunnerKind = 'quiz' | 'va';

/** Arguments sent to `assignToClassroomV1`. */
export interface AssignToClassroomArgs {
  accessToken: string;
  courseId: string;
  /** Must be one of SpartBoard's allowed origins (validated server-side). */
  origin: string;
  kind: AssignRunnerKind;
  /** Quiz join code — required when kind === 'quiz'. */
  quizCode?: string;
  /** SpartBoard session id (== assignmentId). Always required. */
  sessionId: string;
  title: string;
  description?: string;
  maxPoints?: number;
  /** Epoch ms or null. Synced to the Classroom assignment's due date. */
  dueAt?: number | null;
}

/** Result returned by `assignToClassroomV1`. */
export interface AssignToClassroomResult {
  courseWorkId: string;
  /** Present only in the embedded add-on path; null for the link/redirect path. */
  attachmentId: string | null;
  /** 'addon' = embedded runner + grade passback; 'link' = plain redirect. */
  mode: 'addon' | 'link';
  maxPoints: number;
  dueAt: number | null;
}

/** Invoke the `assignToClassroomV1` Cloud Function. */
export async function assignToClassroom(
  functions: Functions,
  args: AssignToClassroomArgs
): Promise<AssignToClassroomResult> {
  const callable = httpsCallable<
    AssignToClassroomArgs,
    AssignToClassroomResult
  >(functions, 'assignToClassroomV1');
  const { data } = await callable(args);
  return data;
}

/**
 * Build the `ClassroomAttachmentLink` to persist from an assign result, or null
 * when there's nothing grade-syncable to persist (the link/redirect path has no
 * add-on attachment and therefore no embedded grade passback).
 */
export function buildClassroomAttachmentLink(
  result: AssignToClassroomResult,
  courseId: string
): ClassroomAttachmentLink | null {
  if (result.mode !== 'addon' || !result.attachmentId) return null;
  return {
    attachmentId: result.attachmentId,
    courseId,
    itemId: result.courseWorkId,
    maxPoints: result.maxPoints,
    attachedAt: Date.now(),
  };
}

/**
 * Persist the `classroomAttachment` onto the SESSION doc first (load-bearing —
 * the Results monitor reads it from the session, so the grade-push button
 * appears even if the second write fails) then the assignment archive doc.
 * Mirrors TeacherDiscoveryRoute's two-write pattern exactly.
 */
export async function persistClassroomAttachmentLink(
  db: Firestore,
  kind: AssignRunnerKind,
  sessionId: string,
  uid: string,
  link: ClassroomAttachmentLink
): Promise<void> {
  const sessionCollection =
    kind === 'va' ? 'video_activity_sessions' : 'quiz_sessions';
  const assignmentCollection =
    kind === 'va' ? 'video_activity_assignments' : 'quiz_assignments';
  // Session doc FIRST — Results reads classroomAttachment from the session.
  await updateDoc(doc(db, sessionCollection, sessionId), {
    classroomAttachment: link,
  });
  await updateDoc(doc(db, 'users', uid, assignmentCollection, sessionId), {
    classroomAttachment: link,
    updatedAt: Date.now(),
  });
}

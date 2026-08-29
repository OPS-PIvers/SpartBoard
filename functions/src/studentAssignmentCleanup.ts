/**
 * Pointer-doc cleanup on assignment deletion — M17 §5 A2b.
 *
 * Assignment deletion is a pure client `writeBatch`, and clients can never
 * touch `/student_assignments` (CF/Admin-SDK writes only, server-only HMAC
 * secret). Without this trigger every delete would strand pointer docs forever
 * and the removed assignment would keep showing on `/my-assignments`.
 *
 * A trigger (not a callable) so admin-console and script deletes are covered
 * too. The deleted doc's own `targetStudents` refs are re-hashed to recover the
 * exact pointer uids, so no `/student_assignments` query is needed — which also
 * keeps the A3 non-goal (no cross-assignment per-student querying) intact.
 * Assignments with no `targetStudents` (every pre-M17 doc) are a no-op.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';
import { STUDENT_PSEUDONYM_HMAC_SECRET } from './secrets';
import {
  STUDENT_ASSIGNMENTS_ROOT,
  STUDENT_ASSIGNMENT_ITEMS,
  targetRefsFromAssignment,
  uidForRef,
  type StudentTargetRef,
} from './studentAssignmentTargets';

const BATCH_OP_LIMIT = 400;

// Shared with the fan-out CF so both sides hash the identical ref set.
export { targetRefsFromAssignment };

export async function deletePointersForAssignment(
  db: admin.firestore.Firestore,
  assignmentId: string,
  refs: readonly StudentTargetRef[],
  hmacSecret: string
): Promise<number> {
  if (refs.length === 0) return 0;
  const uids = [...new Set(refs.map((ref) => uidForRef(ref, hmacSecret)))];
  for (let i = 0; i < uids.length; i += BATCH_OP_LIMIT) {
    const batch = db.batch();
    for (const uid of uids.slice(i, i + BATCH_OP_LIMIT)) {
      batch.delete(
        db
          .collection(STUDENT_ASSIGNMENTS_ROOT)
          .doc(uid)
          .collection(STUDENT_ASSIGNMENT_ITEMS)
          .doc(assignmentId)
      );
    }
    await batch.commit();
  }
  return uids.length;
}

async function handleAssignmentDeleted(
  assignmentId: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  const refs = targetRefsFromAssignment(data);
  if (refs.length === 0) return;
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmacSecret) {
    logger.error('studentAssignmentCleanup: HMAC secret unavailable', {
      assignmentId,
    });
    return;
  }
  const removed = await deletePointersForAssignment(
    admin.firestore(),
    assignmentId,
    refs,
    hmacSecret
  );
  logger.info('studentAssignmentCleanup: pointers removed', {
    assignmentId,
    removed,
  });
}

const triggerOptions = (document: string) => ({
  document,
  memory: '256MiB' as const,
  maxInstances: 5,
  secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
});

export const cleanupQuizAssignmentPointers = onDocumentDeleted(
  triggerOptions('users/{userId}/quiz_assignments/{assignmentId}'),
  (event) =>
    handleAssignmentDeleted(event.params.assignmentId, event.data?.data())
);

export const cleanupVideoActivityAssignmentPointers = onDocumentDeleted(
  triggerOptions('users/{userId}/video_activity_assignments/{assignmentId}'),
  (event) =>
    handleAssignmentDeleted(event.params.assignmentId, event.data?.data())
);

export const cleanupGuidedLearningAssignmentPointers = onDocumentDeleted(
  triggerOptions('users/{userId}/guided_learning_assignments/{assignmentId}'),
  (event) =>
    handleAssignmentDeleted(event.params.assignmentId, event.data?.data())
);

export const cleanupMiniAppAssignmentPointers = onDocumentDeleted(
  triggerOptions('users/{userId}/miniapp_assignments/{assignmentId}'),
  (event) =>
    handleAssignmentDeleted(event.params.assignmentId, event.data?.data())
);

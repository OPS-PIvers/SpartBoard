/**
 * useGuidedLearningAssignments hook
 *
 * Per-teacher archive of guided learning assignments. An assignment is the
 * durable record of a GuidedLearningSession the teacher handed out to
 * students — it lives under /users/{teacherUid}/guided_learning_assignments/
 * and is paired 1:1 with a /guided_learning_sessions/{sessionId} doc.
 *
 * Guided Learning doesn't have the same join-code / lifecycle surface as
 * Quiz, so this hook is intentionally small: record new assignments when the
 * teacher "assigns" a set, archive them to remove from the In Progress tab,
 * and delete them (plus the session + responses) permanently.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  GuidedLearningAssignment,
  GuidedLearningAssignmentStatus,
} from '@/types';

const GL_ASSIGNMENTS_COLLECTION = 'guided_learning_assignments';
const GL_SESSIONS_COLLECTION = 'guided_learning_sessions';
const GL_SESSION_RESPONSES_SUBCOLLECTION = 'responses';

export interface CreateAssignmentInput {
  /** The session id (also becomes the assignment id). */
  sessionId: string;
  /** The set that was assigned. */
  setId: string;
  setTitle: string;
  /** Whether the set came from the personal (Drive) or building library. */
  source?: 'personal' | 'building';
  /** Unified roster targeting (rosters are the single source of truth for
   *  assignments; ClassLink-imported rosters carry `classlinkClassId` so the
   *  student SSO gate resolves via session derivation). */
  rosterIds?: string[];
}

export interface UseGuidedLearningAssignmentsResult {
  assignments: GuidedLearningAssignment[];
  loading: boolean;
  error: string | null;
  /** Persist a new assignment entry (usually right after createSession). */
  createAssignment: (
    input: CreateAssignmentInput
  ) => Promise<GuidedLearningAssignment>;
  /** Move an assignment to the Archive tab (session stays queryable). */
  archiveAssignment: (assignmentId: string) => Promise<void>;
  /** Move an archived assignment back into In Progress. */
  unarchiveAssignment: (assignmentId: string) => Promise<void>;
  /** Delete assignment + session + all responses permanently. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
}

export const useGuidedLearningAssignments = (
  userId: string | undefined
): UseGuidedLearningAssignmentsResult => {
  const [assignments, setAssignments] = useState<GuidedLearningAssignment[]>(
    []
  );
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Adjust state during render when userId transitions — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data on
  // sign-out.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setAssignments([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAssignments(
          snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as GuidedLearningAssignment
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useGuidedLearningAssignments] Firestore error:', err);
        setError('Failed to load guided learning assignments');
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  const createAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['createAssignment']
  >(
    async (input) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const rosterIds = (input.rosterIds ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const assignment: GuidedLearningAssignment = {
        id: input.sessionId,
        sessionId: input.sessionId,
        setId: input.setId,
        setTitle: input.setTitle,
        teacherUid: userId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        source: input.source,
        ...(rosterIds.length > 0 ? { rosterIds } : {}),
      };
      await setDoc(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, input.sessionId),
        assignment
      );
      return assignment;
    },
    [userId]
  );

  const setStatus = useCallback(
    async (
      assignmentId: string,
      status: GuidedLearningAssignmentStatus
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      await updateDoc(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, assignmentId),
        {
          status,
          updatedAt: now,
          archivedAt: status === 'archived' ? now : null,
        }
      );
    },
    [userId]
  );

  const archiveAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['archiveAssignment']
  >((assignmentId) => setStatus(assignmentId, 'archived'), [setStatus]);

  const unarchiveAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['unarchiveAssignment']
  >((assignmentId) => setStatus(assignmentId, 'active'), [setStatus]);

  const deleteAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');

      // Delete response documents in batches of 500 (Firestore batch limit).
      const responsesSnap = await getDocs(
        collection(
          db,
          GL_SESSIONS_COLLECTION,
          assignmentId,
          GL_SESSION_RESPONSES_SUBCOLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < responsesSnap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        responsesSnap.docs
          .slice(i, i + BATCH_LIMIT)
          .forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Delete session doc and the per-teacher assignment doc together.
      const finalBatch = writeBatch(db);
      finalBatch.delete(doc(db, GL_SESSIONS_COLLECTION, assignmentId));
      finalBatch.delete(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, assignmentId)
      );
      await finalBatch.commit();
    },
    [userId]
  );

  return {
    assignments,
    loading,
    error,
    createAssignment,
    archiveAssignment,
    unarchiveAssignment,
    deleteAssignment,
  };
};

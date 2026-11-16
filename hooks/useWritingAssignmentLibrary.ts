/** Teacher-owned Writing assignment library at `/users/{uid}/writing_assignments/{id}`. */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingAssignmentDefinition } from '@/types';
import { logError } from '@/utils/logError';
import {
  duplicateWritingAssignment,
  normalizeGrading,
  normalizeWritingAssignment,
} from '@/utils/writingAssignments';

export const WRITING_ASSIGNMENTS_COLLECTION = 'writing_assignments';

interface UseWritingAssignmentLibraryResult {
  assignments: WritingAssignmentDefinition[];
  loading: boolean;
  error: string | null;
  saveAssignment: (assignment: WritingAssignmentDefinition) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  duplicateAssignment: (
    assignment: WritingAssignmentDefinition
  ) => Promise<WritingAssignmentDefinition>;
  reorderAssignments: (orderedIds: string[]) => Promise<void>;
}

export function useWritingAssignmentLibrary(
  userId: string | undefined
): UseWritingAssignmentLibraryResult {
  const [assignments, setAssignments] = useState<WritingAssignmentDefinition[]>(
    []
  );
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const [previousUserId, setPreviousUserId] = useState(userId);
  if (previousUserId !== userId) {
    setPreviousUserId(userId);
    setAssignments([]);
    setLoading(Boolean(userId));
    setError(null);
  }

  useEffect(() => {
    if (!userId) return undefined;
    return onSnapshot(
      query(
        collection(db, 'users', userId, WRITING_ASSIGNMENTS_COLLECTION),
        orderBy('updatedAt', 'desc')
      ),
      (snapshot) => {
        setAssignments(
          snapshot.docs.map((snapshotDoc) => {
            const data = snapshotDoc.data() as Omit<
              WritingAssignmentDefinition,
              'id'
            >;
            return {
              ...data,
              grading: normalizeGrading(data.grading),
              id: snapshotDoc.id,
            };
          })
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useWritingAssignmentLibrary.onSnapshot', snapshotError, {
          userId,
        });
        setError('Writing assignments could not be loaded.');
        setLoading(false);
      }
    );
  }, [userId]);

  const itemRef = useCallback(
    (uid: string, id: string) =>
      doc(db, 'users', uid, WRITING_ASSIGNMENTS_COLLECTION, id),
    []
  );

  const saveAssignment = useCallback(
    async (assignment: WritingAssignmentDefinition) => {
      if (!userId) throw new Error('Sign in to save.');
      const normalized = normalizeWritingAssignment(assignment, Date.now());
      await setDoc(itemRef(userId, normalized.id), normalized);
    },
    [itemRef, userId]
  );

  const deleteAssignment = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('Sign in to delete.');
      await deleteDoc(itemRef(userId, id));
    },
    [itemRef, userId]
  );

  const duplicateAssignment = useCallback(
    async (
      assignment: WritingAssignmentDefinition
    ): Promise<WritingAssignmentDefinition> => {
      if (!userId) throw new Error('Sign in to duplicate.');
      const copy = duplicateWritingAssignment(
        assignment,
        () => crypto.randomUUID(),
        Date.now()
      );
      await setDoc(itemRef(userId, copy.id), copy);
      return copy;
    },
    [itemRef, userId]
  );

  const reorderAssignments = useCallback(
    async (orderedIds: string[]) => {
      if (!userId) throw new Error('Sign in to reorder.');
      // No updatedAt bump: reordering is a display choice, not an edit.
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(itemRef(userId, id), { order: index });
      });
      await batch.commit();
    },
    [itemRef, userId]
  );

  return {
    assignments,
    loading,
    error,
    saveAssignment,
    deleteAssignment,
    duplicateAssignment,
    reorderAssignments,
  };
}

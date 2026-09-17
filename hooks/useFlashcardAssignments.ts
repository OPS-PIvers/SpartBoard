import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { readAllDocsPaged } from '@/utils/firestorePaging';
import type {
  FlashcardAssignment,
  FlashcardAssignmentKind,
  FlashcardMasteryThreshold,
  FlashcardMode,
  FlashcardModeSettings,
  FlashcardScoreVisibility,
  FlashcardSession,
  FlashcardSet,
  StudentOverride,
} from '@/types';

export const FLASHCARD_ASSIGNMENTS_COLLECTION = 'flashcard_assignments';
export const FLASHCARD_SESSIONS_COLLECTION = 'flashcard_sessions';
export const FLASHCARD_PROGRESS_SUBCOLLECTION = 'progress';

export interface CreateFlashcardAssignmentInput {
  set: FlashcardSet;
  kind: FlashcardAssignmentKind;
  checkMode?: FlashcardMode;
  lockedSettings?: FlashcardModeSettings;
  masteryThreshold?: FlashcardMasteryThreshold;
  scoreVisibility?: FlashcardScoreVisibility;
  classIds: string[];
  periodNames: string[];
  rosterIds: string[];
  targetGroupIds?: string[];
  overridesBySourcedId?: Record<string, StudentOverride>;
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
}

export interface UseFlashcardAssignmentsResult {
  assignments: FlashcardAssignment[];
  loading: boolean;
  error: string | null;
  /** Writes the session and teacher assignment docs atomically; returns the session id. */
  createAssignment: (input: CreateFlashcardAssignmentInput) => Promise<string>;
  endAssignment: (assignmentId: string) => Promise<void>;
  /** Deletes progress docs, then the session and assignment docs. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
}

const nonEmptyStrings = (values: string[] | undefined): string[] =>
  (values ?? []).filter((v): v is string => typeof v === 'string' && !!v);

export const useFlashcardAssignments = (
  userId: string | undefined
): UseFlashcardAssignmentsResult => {
  const [assignments, setAssignments] = useState<FlashcardAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Reset during render when the signed-in user changes.
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
      collection(db, 'users', userId, FLASHCARD_ASSIGNMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => {
        setAssignments(
          snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as FlashcardAssignment
          )
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useFlashcardAssignments] Firestore error:', err);
        setError('Failed to load flashcard assignments');
        setLoading(false);
      }
    );
  }, [userId]);

  const createAssignment = useCallback<
    UseFlashcardAssignmentsResult['createAssignment']
  >(
    async (input) => {
      if (!userId) throw new Error('Not authenticated');
      if (!input.set.cards || input.set.cards.length === 0) {
        throw new Error('Cannot assign a flashcard set with no cards');
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const isCheck = input.kind === 'check';
      const classIds = nonEmptyStrings(input.classIds);
      const periodNames = nonEmptyStrings(input.periodNames);
      const rosterIds = nonEmptyStrings(input.rosterIds);
      const windows = {
        ...(input.openAt != null ? { openAt: input.openAt } : {}),
        ...(input.closeAt != null ? { closeAt: input.closeAt } : {}),
        ...(input.dueAt != null ? { dueAt: input.dueAt } : {}),
      };
      const checkMode =
        isCheck && input.checkMode ? input.checkMode : undefined;
      const scoreVisibility =
        isCheck && input.scoreVisibility ? input.scoreVisibility : undefined;

      const session: FlashcardSession = {
        id,
        teacherUid: userId,
        setId: input.set.id,
        title: input.set.title,
        kind: input.kind,
        ...(checkMode ? { checkMode } : {}),
        ...(isCheck && input.lockedSettings
          ? { lockedSettings: input.lockedSettings }
          : {}),
        ...(isCheck && input.masteryThreshold !== undefined
          ? { masteryThreshold: input.masteryThreshold }
          : {}),
        ...(scoreVisibility ? { scoreVisibility } : {}),
        termLanguage: input.set.termLanguage,
        definitionLanguage: input.set.definitionLanguage,
        cards: input.set.cards,
        classIds,
        classId: classIds[0] ?? '',
        ...(periodNames.length > 0 ? { periodNames } : {}),
        status: 'active',
        ...windows,
        createdAt: now,
      };

      const assignment: FlashcardAssignment = {
        id,
        sessionId: id,
        setId: input.set.id,
        setTitle: input.set.title,
        teacherUid: userId,
        kind: input.kind,
        ...(checkMode ? { checkMode } : {}),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        rosterIds,
        classIds,
        periodNames,
        ...(scoreVisibility ? { scoreVisibility } : {}),
        ...(input.targetGroupIds && input.targetGroupIds.length > 0
          ? { targetGroupIds: input.targetGroupIds }
          : {}),
        ...(input.overridesBySourcedId &&
        Object.keys(input.overridesBySourcedId).length > 0
          ? { overridesBySourcedId: input.overridesBySourcedId }
          : {}),
        ...windows,
      };

      const batch = writeBatch(db);
      batch.set(doc(db, FLASHCARD_SESSIONS_COLLECTION, id), session);
      batch.set(
        doc(db, 'users', userId, FLASHCARD_ASSIGNMENTS_COLLECTION, id),
        assignment
      );
      await batch.commit();
      return id;
    },
    [userId]
  );

  const endAssignment = useCallback<
    UseFlashcardAssignmentsResult['endAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const patch = { status: 'ended', endedAt: now, updatedAt: now };
      const batch = writeBatch(db);
      batch.update(
        doc(
          db,
          'users',
          userId,
          FLASHCARD_ASSIGNMENTS_COLLECTION,
          assignmentId
        ),
        patch
      );
      batch.update(doc(db, FLASHCARD_SESSIONS_COLLECTION, assignmentId), patch);
      await batch.commit();
    },
    [userId]
  );

  const deleteAssignment = useCallback<
    UseFlashcardAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      // Progress rules read the session doc, so progress goes first.
      const progressDocs = await readAllDocsPaged(
        collection(
          db,
          FLASHCARD_SESSIONS_COLLECTION,
          assignmentId,
          FLASHCARD_PROGRESS_SUBCOLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < progressDocs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        progressDocs
          .slice(i, i + BATCH_LIMIT)
          .forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      const finalBatch = writeBatch(db);
      finalBatch.delete(doc(db, FLASHCARD_SESSIONS_COLLECTION, assignmentId));
      finalBatch.delete(
        doc(db, 'users', userId, FLASHCARD_ASSIGNMENTS_COLLECTION, assignmentId)
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
    endAssignment,
    deleteAssignment,
  };
};

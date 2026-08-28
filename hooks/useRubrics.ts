/**
 * useRubrics
 *
 * Real-time bridge to a teacher's rubric library at
 * `/users/{userId}/rubrics/{rubricId}`. Mirrors `useQuiz.ts`'s Firestore
 * metadata pattern but simpler — rubrics have no Drive mirror, the full
 * payload lives in the Firestore doc.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
  addDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Rubric, SharedRubric } from '@/types';

const RUBRICS_COLLECTION = 'rubrics';
const SHARED_RUBRICS_COLLECTION = 'shared_rubrics';

export interface UseRubricsResult {
  rubrics: Rubric[];
  loading: boolean;
  error: Error | null;
  saveRubric: (rubric: Rubric) => Promise<void>;
  deleteRubric: (rubricId: string) => Promise<void>;
  shareRubric: (rubricId: string) => Promise<string>;
  importSharedRubric: (shareId: string) => Promise<void>;
}

export const useRubrics = (userId: string | undefined): UseRubricsResult => {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<Error | null>(null);

  // Adjusting-state-while-rendering: synchronously reset on userId transitions.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setRubrics([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, RUBRICS_COLLECTION),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRubrics(snap.docs.map((d) => d.data() as Rubric));
        setLoading(false);
      },
      (err) => {
        console.error('[useRubrics] Firestore error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const saveRubric = useCallback(
    async (rubric: Rubric): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      await setDoc(doc(db, 'users', userId, RUBRICS_COLLECTION, rubric.id), {
        ...rubric,
        updatedAt: Date.now(),
      });
    },
    [userId]
  );

  const deleteRubric = useCallback(
    async (rubricId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      await deleteDoc(doc(db, 'users', userId, RUBRICS_COLLECTION, rubricId));
    },
    [userId]
  );

  const shareRubric = useCallback(
    async (rubricId: string): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');
      const snap = await getDoc(
        doc(db, 'users', userId, RUBRICS_COLLECTION, rubricId)
      );
      if (!snap.exists()) throw new Error('Rubric not found');
      const rubric = snap.data() as Rubric;
      const shareRef = await addDoc(collection(db, SHARED_RUBRICS_COLLECTION), {
        ...rubric,
        originalAuthor: userId,
        sharedAt: Date.now(),
      });
      return shareRef.id;
    },
    [userId]
  );

  const importSharedRubric = useCallback(
    async (shareId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const snap = await getDoc(doc(db, SHARED_RUBRICS_COLLECTION, shareId));
      if (!snap.exists()) throw new Error('Shared rubric not found');
      const shared = snap.data() as SharedRubric;
      const {
        originalAuthor: _originalAuthor,
        sharedAt: _sharedAt,
        ...rest
      } = shared;
      const now = Date.now();
      const imported: Rubric = {
        ...rest,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(
        doc(db, 'users', userId, RUBRICS_COLLECTION, imported.id),
        imported
      );
    },
    [userId]
  );

  return {
    rubrics,
    loading,
    error,
    saveRubric,
    deleteRubric,
    shareRubric,
    importSharedRubric,
  };
};

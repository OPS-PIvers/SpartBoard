import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardSet } from '@/types';
import { logError } from '@/utils/logError';

interface UseFlashcardSetsResult {
  sets: FlashcardSet[];
  loading: boolean;
  error: string | null;
  saveSet: (set: FlashcardSet) => Promise<void>;
  deleteSet: (setId: string) => Promise<void>;
}

const SETS_COLLECTION = 'flashcard_sets';

export function useFlashcardSets(
  userId: string | undefined
): UseFlashcardSetsResult {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const [previousUserId, setPreviousUserId] = useState(userId);
  if (previousUserId !== userId) {
    setPreviousUserId(userId);
    setSets([]);
    setLoading(Boolean(userId));
    setError(null);
  }

  useEffect(() => {
    if (!userId) return undefined;

    const setsQuery = query(
      collection(db, 'users', userId, SETS_COLLECTION),
      orderBy('updatedAt', 'desc')
    );
    return onSnapshot(
      setsQuery,
      (snapshot) => {
        setSets(
          snapshot.docs.map((snapshotDoc) => {
            const data = snapshotDoc.data() as Omit<FlashcardSet, 'id'> & {
              id?: string;
            };
            return { ...data, id: snapshotDoc.id };
          })
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useFlashcardSets.onSnapshot', snapshotError, { userId });
        setError('Flashcard sets could not be loaded.');
        setLoading(false);
      }
    );
  }, [userId]);

  const saveSet = useCallback(
    async (set: FlashcardSet): Promise<void> => {
      if (!userId) throw new Error('Sign in to save flashcard sets.');
      const cards = set.cards.slice(0, 500).map((card) => ({
        id: card.id,
        term: card.term.slice(0, 500),
        definition: card.definition.slice(0, 1000),
      }));
      const normalized: FlashcardSet = {
        ...set,
        title: set.title.trim(),
        description: set.description?.trim() ?? '',
        termLanguage: set.termLanguage.trim() || 'en-US',
        definitionLanguage: set.definitionLanguage.trim() || 'en-US',
        cards,
        folderId: set.folderId ?? null,
        updatedAt: Date.now(),
      };
      await setDoc(
        doc(db, 'users', userId, SETS_COLLECTION, normalized.id),
        normalized
      );
    },
    [userId]
  );

  const deleteSet = useCallback(
    async (setId: string): Promise<void> => {
      if (!userId) throw new Error('Sign in to delete flashcard sets.');
      await deleteDoc(doc(db, 'users', userId, SETS_COLLECTION, setId));
    },
    [userId]
  );

  return { sets, loading, error, saveSet, deleteSet };
}

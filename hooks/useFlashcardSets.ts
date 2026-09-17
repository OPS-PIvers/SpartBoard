import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardSet, PublicFlashcardSet } from '@/types';
import { logError } from '@/utils/logError';

/** Thrown when the set saved but its open Study assignments could not be rewritten. */
export class FlashcardStudySyncError extends Error {
  constructor() {
    super('Open Study assignments still show the old cards.');
    this.name = 'FlashcardStudySyncError';
  }
}

interface UseFlashcardSetsResult {
  sets: FlashcardSet[];
  loading: boolean;
  error: string | null;
  /** Resolves with the number of open Study assignments rewritten with the new cards. */
  saveSet: (set: FlashcardSet) => Promise<number>;
  deleteSet: (setId: string) => Promise<void>;
  publishSet: (set: FlashcardSet) => Promise<string>;
  revokeShare: (set: FlashcardSet) => Promise<void>;
}

const SETS_COLLECTION = 'flashcard_sets';

// Study assignments stay live (docs/plans/FLASHCARDS.md Q46); Check stays frozen.
const rewriteOpenStudySessions = async (
  userId: string,
  set: FlashcardSet
): Promise<number> => {
  const openStudy = query(
    collection(db, 'flashcard_sessions'),
    where('teacherUid', '==', userId),
    where('setId', '==', set.id),
    where('kind', '==', 'study'),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(openStudy);
  if (snapshot.empty) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach((sessionDoc) =>
    batch.update(sessionDoc.ref, {
      title: set.title,
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      cards: set.cards,
    })
  );
  await batch.commit();
  return snapshot.size;
};

const normalizeSet = (set: FlashcardSet): FlashcardSet => ({
  ...set,
  title: set.title.trim(),
  description: set.description?.trim() ?? '',
  termLanguage: set.termLanguage.trim() || 'en-US',
  definitionLanguage: set.definitionLanguage.trim() || 'en-US',
  cards: set.cards.slice(0, 500).map((card) => ({
    id: card.id,
    term: card.term.slice(0, 500),
    definition: card.definition.slice(0, 1000),
  })),
  folderId: set.folderId ?? null,
  updatedAt: Date.now(),
});

const toPublicSnapshot = (
  set: FlashcardSet,
  teacherUid: string
): PublicFlashcardSet => ({
  teacherUid,
  setId: set.id,
  title: set.title,
  description: set.description ?? '',
  termLanguage: set.termLanguage,
  definitionLanguage: set.definitionLanguage,
  cards: set.cards,
  updatedAt: set.updatedAt,
});

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
    async (set: FlashcardSet): Promise<number> => {
      if (!userId) throw new Error('Sign in to save flashcard sets.');
      const normalized = normalizeSet(set);
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, SETS_COLLECTION, normalized.id),
        normalized
      );
      if (normalized.publicShareId) {
        batch.set(
          doc(db, 'public_flashcard_sets', normalized.publicShareId),
          toPublicSnapshot(normalized, userId)
        );
      }
      await batch.commit();
      try {
        return await rewriteOpenStudySessions(userId, normalized);
      } catch (syncError) {
        logError('useFlashcardSets.rewriteOpenStudySessions', syncError, {
          userId,
          setId: normalized.id,
        });
        throw new FlashcardStudySyncError();
      }
    },
    [userId]
  );

  const deleteSet = useCallback(
    async (setId: string): Promise<void> => {
      if (!userId) throw new Error('Sign in to delete flashcard sets.');
      const existing = sets.find((set) => set.id === setId);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', userId, SETS_COLLECTION, setId));
      if (existing?.publicShareId) {
        batch.delete(doc(db, 'public_flashcard_sets', existing.publicShareId));
      }
      await batch.commit();
    },
    [sets, userId]
  );

  const publishSet = useCallback(
    async (set: FlashcardSet): Promise<string> => {
      if (!userId) throw new Error('Sign in to share flashcard sets.');
      if (set.cards.length === 0) {
        throw new Error('Add at least one card before sharing this set.');
      }
      const shareId = set.publicShareId ?? crypto.randomUUID();
      const normalized = normalizeSet({ ...set, publicShareId: shareId });
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, SETS_COLLECTION, normalized.id),
        normalized
      );
      batch.set(
        doc(db, 'public_flashcard_sets', shareId),
        toPublicSnapshot(normalized, userId)
      );
      await batch.commit();
      return shareId;
    },
    [userId]
  );

  const revokeShare = useCallback(
    async (set: FlashcardSet): Promise<void> => {
      if (!userId) throw new Error('Sign in to manage flashcard sharing.');
      if (!set.publicShareId) return;
      const batch = writeBatch(db);
      batch.delete(doc(db, 'public_flashcard_sets', set.publicShareId));
      batch.set(
        doc(db, 'users', userId, SETS_COLLECTION, set.id),
        { publicShareId: null, updatedAt: Date.now() },
        { merge: true }
      );
      await batch.commit();
    },
    [userId]
  );

  return {
    sets,
    loading,
    error,
    saveSet,
    deleteSet,
    publishSet,
    revokeShare,
  };
}

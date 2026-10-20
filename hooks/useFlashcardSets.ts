import { withoutClaudeReview } from '@/utils/claudeReview';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  FlashcardSet,
  PublicFlashcardSet,
} from '@/types';
import { logError } from '@/utils/logError';
import { AuthContext } from '@/context/AuthContextValue';
import {
  FLASHCARDS_SPEAK_SETTINGS_DOC,
  defaultFlashcardsSpeakAdminConfig,
  normalizeFlashcardsSpeakAdminConfig,
} from '@/config/flashcardsSpeakAdmin';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import {
  buildSpeakStamp,
  speakCardsFor,
  type FlashcardSpeakStamp,
} from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  FC_CONTENT_COLLECTION,
  FC_CONTENT_DOC,
} from '@/utils/flashcardSessionContent';

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

/** F22: one read at save time; any failure falls back to the shipped defaults. */
export const readFlashcardsSpeakAdminConfig =
  async (): Promise<FlashcardsSpeakAdminConfig> => {
    try {
      const snap = await getDoc(
        doc(db, 'admin_settings', FLASHCARDS_SPEAK_SETTINGS_DOC)
      );
      return normalizeFlashcardsSpeakAdminConfig(snap.data());
    } catch (readError) {
      logError('readFlashcardsSpeakAdminConfig', readError);
      return defaultFlashcardsSpeakAdminConfig();
    }
  };

/** Null when no stamp is possible, so a teacher without the flag never reads admin_settings. */
export const speakAdminConfigFor = (
  set: Pick<FlashcardSet, 'termLanguage'>,
  canSpeak: boolean
): Promise<FlashcardsSpeakAdminConfig | null> =>
  canSpeak && speakLanguageOf(set.termLanguage)
    ? readFlashcardsSpeakAdminConfig()
    : Promise.resolve(null);

const withoutLock = ({
  locked: _locked,
  ...settings
}: FlashcardSpeakStamp): FlashcardSpeakSettings => settings;

const stampFor = (
  set: FlashcardSet,
  adminConfig: FlashcardsSpeakAdminConfig | null,
  lock: boolean
): FlashcardSpeakStamp | undefined =>
  adminConfig ? buildSpeakStamp(set, true, adminConfig, lock) : undefined;

// Study assignments stay live (docs/plans/shipped/FLASHCARDS.md Q46); Check stays frozen.
const rewriteOpenStudySessions = async (
  userId: string,
  set: FlashcardSet,
  adminConfig: FlashcardsSpeakAdminConfig | null
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
  snapshot.docs.forEach((sessionDoc) => {
    // A per-period session's cards live in its content doc, hidden until the period opens.
    const inContent = sessionDoc.get('cardsInContent') === true;
    // F21: re-stamp on every save, keeping the assignment's lock; a lost flag clears it.
    const previous: unknown = sessionDoc.get('speak');
    const stamp =
      sessionDoc.get('speakOff') === true
        ? undefined
        : stampFor(
            set,
            adminConfig,
            (previous as { locked?: unknown } | undefined)?.locked === true
          );
    const cards = speakCardsFor(set.cards, stamp);
    batch.update(sessionDoc.ref, {
      title: set.title,
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      ...(inContent ? {} : { cards }),
      ...(stamp
        ? { speak: stamp }
        : previous !== undefined
          ? { speak: deleteField() }
          : {}),
    });
    if (inContent) {
      batch.set(
        doc(
          db,
          'flashcard_sessions',
          sessionDoc.id,
          FC_CONTENT_COLLECTION,
          FC_CONTENT_DOC
        ),
        { cards }
      );
    }
  });
  await batch.commit();
  return snapshot.size;
};

/** References are per language; a changed term language drops the old ones (they hold another language's dialects). */
const speakFitsLanguage = (
  speak: NonNullable<FlashcardSet['cards'][number]['speak']>,
  termLanguage: string
): boolean => {
  const primary = termLanguage.trim().split(/[-_]/)[0].toLowerCase();
  return speak.refs.every((ref) => ref.dialect.split('-')[0] === primary);
};

const normalizeSet = (set: FlashcardSet): FlashcardSet => ({
  ...withoutClaudeReview(set),
  title: set.title.trim(),
  description: set.description?.trim() ?? '',
  termLanguage: set.termLanguage.trim() || 'en-US',
  definitionLanguage: set.definitionLanguage.trim() || 'en-US',
  cards: set.cards.slice(0, 500).map((card) => ({
    id: card.id,
    term: card.term.slice(0, 500),
    definition: card.definition.slice(0, 1000),
    ...(card.speak && speakFitsLanguage(card.speak, set.termLanguage)
      ? { speak: card.speak }
      : {}),
  })),
  folderId: set.folderId ?? null,
  updatedAt: Date.now(),
});

const toPublicSnapshot = (
  set: FlashcardSet,
  teacherUid: string,
  adminConfig: FlashcardsSpeakAdminConfig | null
): PublicFlashcardSet => {
  const stamp = stampFor(set, adminConfig, false);
  return {
    teacherUid,
    setId: set.id,
    title: set.title,
    description: set.description ?? '',
    termLanguage: set.termLanguage,
    definitionLanguage: set.definitionLanguage,
    cards: speakCardsFor(set.cards, stamp),
    ...(stamp ? { speak: withoutLock(stamp) } : {}),
    updatedAt: set.updatedAt,
  };
};

export function useFlashcardSets(
  userId: string | undefined
): UseFlashcardSetsResult {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const canSpeak =
    useContext(AuthContext)?.canAccessFeature('flashcards-speak') ?? false;

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
      const adminConfig = await speakAdminConfigFor(normalized, canSpeak);
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, SETS_COLLECTION, normalized.id),
        normalized
      );
      if (normalized.publicShareId) {
        batch.set(
          doc(db, 'public_flashcard_sets', normalized.publicShareId),
          toPublicSnapshot(normalized, userId, adminConfig)
        );
      }
      await batch.commit();
      try {
        return await rewriteOpenStudySessions(userId, normalized, adminConfig);
      } catch (syncError) {
        logError('useFlashcardSets.rewriteOpenStudySessions', syncError, {
          userId,
          setId: normalized.id,
        });
        throw new FlashcardStudySyncError();
      }
    },
    [canSpeak, userId]
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
      const adminConfig = await speakAdminConfigFor(normalized, canSpeak);
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, SETS_COLLECTION, normalized.id),
        normalized
      );
      batch.set(
        doc(db, 'public_flashcard_sets', shareId),
        toPublicSnapshot(normalized, userId, adminConfig)
      );
      await batch.commit();
      return shareId;
    },
    [canSpeak, userId]
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

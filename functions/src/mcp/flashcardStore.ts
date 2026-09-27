// Server mirror of hooks/useFlashcardSets.ts saveSet: normalise, write, refresh share, rewrite open Study sessions.
import type * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';

type Firestore = admin.firestore.Firestore;
type WriteBatch = admin.firestore.WriteBatch;

export const MAX_CARDS = 500;
export const MAX_TERM = 500;
export const MAX_DEFINITION = 1000;

export interface FlashcardCard {
  id: string;
  term: string;
  definition: string;
}

export interface FlashcardSet {
  id: string;
  title: string;
  description?: string;
  termLanguage: string;
  definitionLanguage: string;
  cards: FlashcardCard[];
  folderId?: string | null;
  publicShareId?: string | null;
  createdAt: number;
  updatedAt: number;
  claudeCreatedAt?: number;
  claudeEditedAt?: number;
}

export const setsPath = (uid: string) => `users/${uid}/flashcard_sets`;

/** Mirrors normalizeSet in hooks/useFlashcardSets.ts. */
export function normalizeSet(
  set: FlashcardSet,
  now = Date.now()
): FlashcardSet {
  return {
    ...set,
    title: set.title.trim(),
    description: set.description?.trim() ?? '',
    termLanguage: set.termLanguage.trim() || 'en-US',
    definitionLanguage: set.definitionLanguage.trim() || 'en-US',
    cards: set.cards.slice(0, MAX_CARDS).map((card) => ({
      id: card.id,
      term: card.term.slice(0, MAX_TERM),
      definition: card.definition.slice(0, MAX_DEFINITION),
    })),
    folderId: set.folderId ?? null,
    updatedAt: now,
  };
}

/** Keeps existing card ids (study progress keys) when Claude passes them back; new cards get fresh ids. */
export function mergeCards(
  existing: FlashcardCard[],
  incoming: { id?: string; term: string; definition: string }[]
): FlashcardCard[] {
  const known = new Set(existing.map((c) => c.id));
  const used = new Set<string>();
  return incoming.map((card) => {
    const id =
      card.id && known.has(card.id) && !used.has(card.id)
        ? card.id
        : randomUUID();
    used.add(id);
    return { id, term: card.term, definition: card.definition };
  });
}

export async function readSet(
  db: Firestore,
  uid: string,
  setId: string
): Promise<FlashcardSet | null> {
  const snap = await db.doc(`${setsPath(uid)}/${setId}`).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as FlashcardSet), id: snap.id };
}

/** Adds the set (and its public snapshot when shared) to the batch. */
export function stageSetWrite(
  db: Firestore,
  batch: WriteBatch,
  uid: string,
  set: FlashcardSet
): void {
  batch.set(db.doc(`${setsPath(uid)}/${set.id}`), set);
  if (set.publicShareId) {
    // Mirrors toPublicSnapshot in hooks/useFlashcardSets.ts.
    batch.set(db.doc(`public_flashcard_sets/${set.publicShareId}`), {
      teacherUid: uid,
      setId: set.id,
      title: set.title,
      description: set.description ?? '',
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      cards: set.cards,
      updatedAt: set.updatedAt,
    });
  }
}

/** Mirrors rewriteOpenStudySessions in hooks/useFlashcardSets.ts; returns sessions rewritten. */
export async function rewriteOpenStudySessions(
  db: Firestore,
  uid: string,
  set: FlashcardSet
): Promise<number> {
  const snapshot = await db
    .collection('flashcard_sessions')
    .where('teacherUid', '==', uid)
    .where('setId', '==', set.id)
    .where('kind', '==', 'study')
    .where('status', '==', 'active')
    .get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach((sessionDoc) => {
    const inContent = sessionDoc.get('cardsInContent') === true;
    batch.update(sessionDoc.ref, {
      title: set.title,
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      ...(inContent ? {} : { cards: set.cards }),
    });
    if (inContent) {
      batch.set(db.doc(`flashcard_sessions/${sessionDoc.id}/content/cards`), {
        cards: set.cards,
      });
    }
  });
  await batch.commit();
  return snapshot.size;
}

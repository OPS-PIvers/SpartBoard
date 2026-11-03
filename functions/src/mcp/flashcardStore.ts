// Server mirror of hooks/useFlashcardSets.ts saveSet: normalise, write, refresh share, rewrite open Study sessions.
import type * as admin from '../firebaseAdmin';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { ToolError } from './activity';

type Firestore = admin.firestore.Firestore;
type WriteBatch = admin.firestore.WriteBatch;

export const MAX_CARDS = 500;
export const MAX_TERM = 500;
export const MAX_DEFINITION = 1000;

export interface FlashcardCard {
  id: string;
  term: string;
  definition: string;
  /** Speak references (client FlashcardCardSpeak); valid only for the term they were computed for. */
  speak?: Record<string, unknown>;
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
  /** Speak settings (client FlashcardSpeakSettings), carried untouched. */
  speak?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  claudeCreatedAt?: number;
  claudeEditedAt?: number;
  claudeReviewPendingAt?: number;
}

export const setsPath = (uid: string) => `users/${uid}/flashcard_sets`;

const primaryLanguage = (tag: unknown): string =>
  typeof tag === 'string' ? tag.trim().split(/[-_]/)[0].toLowerCase() : '';

/** True when every dialect named (card refs or a stamp's dialects) belongs to the set's term language. */
const dialectsFit = (dialects: unknown[], termLanguage: string): boolean =>
  dialects.every((d) => primaryLanguage(d) === primaryLanguage(termLanguage));

const refDialects = (speak: Record<string, unknown>): unknown[] =>
  Array.isArray(speak.refs)
    ? speak.refs.map((ref) => (ref as { dialect?: unknown }).dialect)
    : [];

const withoutCardSpeak = (cards: FlashcardCard[]): FlashcardCard[] =>
  cards.map(({ id, term, definition }) => ({ id, term, definition }));

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
      ...(card.speak &&
      dialectsFit(refDialects(card.speak), set.termLanguage || 'en-US')
        ? { speak: card.speak }
        : {}),
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
  const known = new Map(existing.map((c) => [c.id, c]));
  const used = new Set<string>();
  return incoming.map((card) => {
    const id =
      card.id && known.has(card.id) && !used.has(card.id)
        ? card.id
        : randomUUID();
    used.add(id);
    // Speak references belong to a term; a changed term drops them for the next lookup.
    const previous = known.get(id);
    const speak =
      previous?.speak && previous.term === card.term
        ? previous.speak
        : undefined;
    return {
      id,
      term: card.term,
      definition: card.definition,
      ...(speak ? { speak } : {}),
    };
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

/** What the public snapshot looked like when the save read it; the write fails if that has since changed. */
export type ShareGuard =
  { exists: false } | { exists: true; updateTime: Timestamp };

/** Reads a set's public snapshot and refuses when it belongs to another teacher. */
export async function guardPublicShare(
  db: Firestore,
  uid: string,
  shareId: string
): Promise<ShareGuard> {
  const snap = await db.doc(`public_flashcard_sets/${shareId}`).get();
  if (!snap.exists) return { exists: false };
  if (snap.get('teacherUid') !== uid)
    throw new ToolError(
      'This set points at a shared page that is not yours. Re-share the set in SpartBoard, then try again.'
    );
  return { exists: true, updateTime: snap.updateTime as Timestamp };
}

/** Adds the set (and its public snapshot when shared, guarded by `share`) to the batch; a changed language drops the snapshot's Speak stamp, and `speakStamp` replaces it. */
export function stageSetWrite(
  db: Firestore,
  batch: WriteBatch,
  uid: string,
  set: FlashcardSet,
  previousTermLanguage?: string,
  speakStamp?: Record<string, unknown>,
  share?: ShareGuard
): void {
  const dropStamp =
    !speakStamp &&
    previousTermLanguage !== undefined &&
    primaryLanguage(previousTermLanguage) !== primaryLanguage(set.termLanguage);
  batch.set(db.doc(`${setsPath(uid)}/${set.id}`), set);
  if (set.publicShareId) {
    if (!share) throw new ToolError('The shared page was not checked.');
    const ref = db.doc(`public_flashcard_sets/${set.publicShareId}`);
    // Mirrors toPublicSnapshot in hooks/useFlashcardSets.ts.
    const fields = {
      teacherUid: uid,
      setId: set.id,
      title: set.title,
      description: set.description ?? '',
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      cards: set.cards,
      updatedAt: set.updatedAt,
      ...(speakStamp ? { speak: speakStamp } : {}),
    };
    if (share.exists)
      batch.update(
        ref,
        { ...fields, ...(dropStamp ? { speak: FieldValue.delete() } : {}) },
        { lastUpdateTime: share.updateTime }
      );
    else batch.create(ref, fields);
  }
}

/** Mirrors rewriteOpenStudySessions in hooks/useFlashcardSets.ts; without `speakStamp` keeps a client stamp unless the language moved off it. */
export async function rewriteOpenStudySessions(
  db: Firestore,
  uid: string,
  set: FlashcardSet,
  speakStamp?: Record<string, unknown>
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
    const stamp: unknown = sessionDoc.get('speak');
    const dialects = (stamp as { dialects?: unknown } | undefined)?.dialects;
    const speakOff = sessionDoc.get('speakOff') === true;
    // A fresh stamp keeps the assignment's lock; a session turned off never gets one.
    const nextStamp =
      speakStamp && !speakOff
        ? {
            ...speakStamp,
            locked:
              (stamp as { locked?: unknown } | undefined)?.locked === true,
          }
        : undefined;
    const keepStamp =
      !!nextStamp ||
      (!speakOff &&
        Array.isArray(dialects) &&
        dialectsFit(dialects, set.termLanguage));
    // Students get card references only alongside a stamp, as on the client.
    const cards = keepStamp ? set.cards : withoutCardSpeak(set.cards);
    batch.update(sessionDoc.ref, {
      title: set.title,
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      ...(inContent ? {} : { cards }),
      ...(nextStamp ? { speak: nextStamp } : {}),
      ...(stamp !== undefined && !keepStamp
        ? { speak: FieldValue.delete() }
        : {}),
    });
    if (inContent) {
      batch.set(db.doc(`flashcard_sessions/${sessionDoc.id}/content/cards`), {
        cards,
      });
    }
  });
  await batch.commit();
  return snapshot.size;
}

// Server mirror of hooks/useFlashcardSets.ts saveSet: normalise, write, refresh share, rewrite open Study sessions.
import type * as admin from '../firebaseAdmin';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { ToolError } from './activity';
import {
  SPEAK_GROUP_IDS,
  speakLanguageOf,
  speakPresetSettings,
  type SpeakPreset,
} from './flashcardSpeakSettings';

type Firestore = admin.firestore.Firestore;
type WriteBatch = admin.firestore.WriteBatch;

export const MAX_CARDS = 500;
export const MAX_TERM = 500;
export const MAX_DEFINITION = 1000;

export interface FlashcardCard {
  id: string;
  term: string;
  definition: string;
  /** The teacher's card pictures; Claude tools keep them but never set them. */
  termImageUrl?: string;
  definitionImageUrl?: string;
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

const imageFields = (
  card: FlashcardCard
): Pick<FlashcardCard, 'termImageUrl' | 'definitionImageUrl'> => ({
  ...(card.termImageUrl ? { termImageUrl: card.termImageUrl } : {}),
  ...(card.definitionImageUrl
    ? { definitionImageUrl: card.definitionImageUrl }
    : {}),
});

const withoutCardSpeak = (cards: FlashcardCard[]): FlashcardCard[] =>
  cards.map(({ id, term, definition, ...card }) => ({
    id,
    term,
    definition,
    ...imageFields(card as FlashcardCard),
  }));

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
      ...imageFields(card),
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
    // A kept card keeps its pictures; term_picture and definition_picture change them after.
    return {
      id,
      term: card.term,
      definition: card.definition,
      ...(previous ? imageFields(previous) : {}),
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

/** A set as a save read it; the save's write fails if the set has changed since. */
export interface LoadedSet {
  set: FlashcardSet;
  updateTime: Timestamp;
}

export async function readSetForSave(
  db: Firestore,
  uid: string,
  setId: string
): Promise<LoadedSet | null> {
  const snap = await db.doc(`${setsPath(uid)}/${setId}`).get();
  if (!snap.exists) return null;
  return {
    set: { ...(snap.data() as FlashcardSet), id: snap.id },
    updateTime: snap.updateTime as Timestamp,
  };
}

/** Reads a set's public snapshot and returns its update time; refuses one that is gone or another teacher's. */
export async function guardPublicShare(
  db: Firestore,
  uid: string,
  shareId: string
): Promise<Timestamp> {
  const snap = await db.doc(`public_flashcard_sets/${shareId}`).get();
  // A revoke deletes the snapshot first, so a missing one must not be re-created from a stale read.
  if (!snap.exists)
    throw new ToolError(
      'Sharing for this set changed in SpartBoard while Claude was saving. Fetch the set again and redo the change; if it still fails, turn sharing off or share it again in SpartBoard.'
    );
  if (snap.get('teacherUid') !== uid)
    throw new ToolError(
      'This set points at a shared page that is not yours. Re-share the set in SpartBoard, then try again.'
    );
  return snap.updateTime as Timestamp;
}

export interface StageOptions {
  previousTermLanguage?: string;
  speakStamp?: Record<string, unknown>;
  /** The public snapshot's update time from guardPublicShare; required when the set is shared. */
  shareTime?: Timestamp;
  /** The set as the save read it; the write then replaces it only if it is unchanged. */
  loaded?: LoadedSet;
}

/** Adds the set (and its public snapshot when shared) to the batch; a changed language drops the snapshot's Speak stamp, and `speakStamp` replaces it. */
export function stageSetWrite(
  db: Firestore,
  batch: WriteBatch,
  uid: string,
  set: FlashcardSet,
  { previousTermLanguage, speakStamp, shareTime, loaded }: StageOptions = {}
): void {
  const dropStamp =
    !speakStamp &&
    previousTermLanguage !== undefined &&
    primaryLanguage(previousTermLanguage) !== primaryLanguage(set.termLanguage);
  const setRef = db.doc(`${setsPath(uid)}/${set.id}`);
  if (loaded) {
    const removed: Record<string, unknown> = {};
    for (const key of Object.keys(loaded.set))
      if (!(key in set)) removed[key] = FieldValue.delete();
    batch.update(
      setRef,
      { ...removed, ...set },
      { lastUpdateTime: loaded.updateTime }
    );
  } else batch.set(setRef, set);
  if (set.publicShareId) {
    if (!shareTime) throw new ToolError('The shared page was not checked.');
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
    batch.update(
      ref,
      { ...fields, ...(dropStamp ? { speak: FieldValue.delete() } : {}) },
      { lastUpdateTime: shareTime }
    );
  }
}

/** Mirrors parseSpeakChoice + withSpeakChoice in components/widgets/Flashcards/utils/flashcardAssign.ts. */
export function speakChoiceOf(
  raw: unknown,
  termLanguage: string
): Record<string, unknown> | undefined {
  const language = speakLanguageOf(termLanguage);
  if (!language || !raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined;
  const r = raw as Record<string, unknown>;
  const presets = ['beginner', 'intermediate', 'advanced', 'custom'];
  if (
    !presets.includes(r.preset as string) ||
    typeof r.strict !== 'boolean' ||
    typeof r.attempts !== 'number' ||
    !Number.isFinite(r.attempts) ||
    typeof r.example !== 'boolean' ||
    !r.groups ||
    typeof r.groups !== 'object' ||
    Array.isArray(r.groups)
  ) {
    return undefined;
  }
  const ids = SPEAK_GROUP_IDS[language];
  const fits = Object.keys(r.groups).every((id) => ids.includes(id));
  // A named level follows the current language; a Custom from another language becomes Intermediate.
  const preset = (
    r.preset === 'custom' && !fits ? 'intermediate' : r.preset
  ) as SpeakPreset;
  return {
    preset,
    strict: r.strict,
    groups:
      preset === 'custom'
        ? r.groups
        : speakPresetSettings(language, preset).groups,
    attempts: Math.min(10, Math.max(1, Math.round(r.attempts))),
    example: r.example,
  };
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
    // Rules picked when assigning win over the set's, as on the client.
    const choice = speakChoiceOf(
      sessionDoc.get('speakChoice'),
      set.termLanguage
    );
    const nextStamp =
      speakStamp && !speakOff
        ? {
            ...speakStamp,
            ...choice,
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

// Firestore echoes map keys alphabetized, so compare with sorted keys.
const sortedJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
          )
        )
      : v
  );

const cardSpeakable = (card: FlashcardCard): boolean => {
  const refs = (card.speak as { refs?: unknown } | undefined)?.refs;
  return (
    Array.isArray(refs) &&
    refs.some(
      (ref) =>
        Array.isArray((ref as { tokens?: unknown }).tokens) &&
        (ref as { tokens: unknown[] }).tokens.length > 0
    )
  );
};

/** A swap or a side cleared is a new card, not a fix, so it never reaches a Check. */
const side = (text: string): string => text.trim().toLowerCase();
const notAFix = (old: FlashcardCard, fixed: FlashcardCard): boolean =>
  (side(old.term) !== '' && side(fixed.term) === '') ||
  (side(old.definition) !== '' && side(fixed.definition) === '') ||
  (side(fixed.term) !== side(old.term) &&
    side(old.term) !== side(old.definition) &&
    (side(fixed.term) === side(old.definition) ||
      side(fixed.definition) === side(old.term)));

/** Mirrors fixedCheckCards in components/widgets/Flashcards/utils/flashcardCheckSync.ts. */
export function fixedCheckCards(
  checkCards: FlashcardCard[],
  setCards: FlashcardCard[],
  speakStamped: boolean
): FlashcardCard[] | null {
  const byId = new Map(setCards.map((card) => [card.id, card]));
  let changed = false;
  const next = checkCards.map((old) => {
    const fixed = byId.get(old.id);
    if (!fixed) return old;
    if (notAFix(old, fixed)) return old;
    const { speak, ...text } = fixed;
    let card: FlashcardCard = speakStamped && speak ? { ...text, speak } : text;
    if (speakStamped && cardSpeakable(card) !== cardSpeakable(old)) {
      if (fixed.term !== old.term) return old;
      card = old.speak ? { ...text, speak: old.speak } : text;
    }
    if (sortedJson(card) === sortedJson(old)) return old;
    changed = true;
    return card;
  });
  return changed ? next : null;
}

/** Mirrors rewriteOpenCheckSessions in hooks/useFlashcardSets.ts: fixes only, the card list stays as assigned. */
export async function rewriteOpenCheckSessions(
  db: Firestore,
  uid: string,
  set: FlashcardSet
): Promise<{ updated: number; cardsChanged: string[] }> {
  const snapshot = await db
    .collection('flashcard_sessions')
    .where('teacherUid', '==', uid)
    .where('setId', '==', set.id)
    .where('kind', '==', 'check')
    .where('status', '==', 'active')
    .get();
  if (snapshot.empty) return { updated: 0, cardsChanged: [] };
  const batch = db.batch();
  let updated = 0;
  const cardsChanged: string[] = [];
  for (const sessionDoc of snapshot.docs) {
    const inContent = sessionDoc.get('cardsInContent') === true;
    const contentRef = db.doc(
      `flashcard_sessions/${sessionDoc.id}/content/cards`
    );
    const raw: unknown = inContent
      ? (await contentRef.get()).get('cards')
      : sessionDoc.get('cards');
    if (!Array.isArray(raw)) continue;
    const cards = fixedCheckCards(
      raw as FlashcardCard[],
      set.cards,
      sessionDoc.get('speak') !== undefined
    );
    const retitled = sessionDoc.get('title') !== set.title;
    if (!cards && !retitled) continue;
    updated += 1;
    if (cards) cardsChanged.push(sessionDoc.id);
    batch.update(sessionDoc.ref, {
      ...(retitled ? { title: set.title } : {}),
      ...(cards && !inContent ? { cards } : {}),
    });
    if (cards && inContent) batch.set(contentRef, { cards }, { merge: true });
  }
  if (updated > 0) await batch.commit();
  return { updated, cardsChanged };
}

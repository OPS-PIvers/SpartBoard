// Connector side of Flashcards Speak (docs/multilingual-pronunciation-engine.md S10): settings, save-time lookup, stamps.
import type * as admin from 'firebase-admin';
import {
  computeSpeakReferences,
  FLASHCARDS_SPEAK_FEATURE_ID,
  parseLookupInput,
  SPEAK_G2P_VERSION,
  SPEAK_G2P_VOICES_PENDING,
} from '../pronunciation/lookup';
import type {
  FlashcardCardSpeak,
  SpeakDialect,
  SpeakLanguage,
} from '../pronunciation/types';
import { ToolError } from './activity';
import type { FlashcardCard, FlashcardSet } from './flashcardStore';
import {
  clampSpeakAttempts,
  normalizeSpeakAdminDefaults,
  ownSpeakFits,
  resolveSpeakSettings,
  SPEAK_DIALECTS,
  speakLanguageOf,
  speakPresetSettings,
  type SpeakAdminDefaults,
  type SpeakSettings,
  type SpeakSettingsInput,
} from './flashcardSpeakSettings';

type Firestore = admin.firestore.Firestore;
const ADMIN_DOC = 'admin_settings/flashcardsSpeak';

/** F22: one read at save time; any failure falls back to the shipped defaults. */
export async function readSpeakAdminDefaults(
  db: Firestore
): Promise<SpeakAdminDefaults> {
  try {
    return normalizeSpeakAdminDefaults((await db.doc(ADMIN_DOC).get()).data());
  } catch (err) {
    console.error('[mcpServer] Speak defaults read failed', { err });
    return normalizeSpeakAdminDefaults(undefined);
  }
}

/** Applies Claude's choices on top of the resolved settings. */
export function applySpeakInput(
  language: SpeakLanguage,
  settings: SpeakSettings,
  input: SpeakSettingsInput
): SpeakSettings {
  const dialects = input.dialects
    ? SPEAK_DIALECTS[language].filter((d) => input.dialects?.includes(d))
    : settings.dialects;
  if (dialects.length === 0) {
    throw new ToolError(
      `Pick accents for this language: ${SPEAK_DIALECTS[language].join(', ')}.`
    );
  }
  return {
    ...settings,
    ...(input.level
      ? { preset: input.level, ...speakPresetSettings(language, input.level) }
      : {}),
    dialects,
    attempts:
      input.attempts === undefined
        ? settings.attempts
        : clampSpeakAttempts(input.attempts, settings.attempts),
    example: input.hear_it ?? settings.example,
  };
}

// Voice refs ride along with their dialect's espeak ref, so only espeak refs say which dialects were looked up.
const espeakRefs = (speak: FlashcardCardSpeak) =>
  speak.refs.filter((ref) => ref.source !== 'voice');

// Reasons only a dialect with no reference produces.
const NO_REF_REASONS = ['unrenderable', 'untokenizable', 'multi-word'];

/** Mirrors refsFitDialects (components/widgets/Flashcards/speak/speakEditorState.ts). */
const sameDialects = (speak: FlashcardCardSpeak, dialects: SpeakDialect[]) =>
  speak.refs.every((ref) => dialects.includes(ref.dialect)) &&
  (speak.refs.length === 0 ||
    dialects.every((d) => espeakRefs(speak).some((ref) => ref.dialect === d)) ||
    // A language has at most two accents, so a recorded failure explains the missing one.
    (speak.reasons ?? []).some((r) => NO_REF_REASONS.includes(r)));

/** A card's references are current for its term, the engine version and the set's dialects. */
export function cardSpeakCurrent(
  card: FlashcardCard,
  dialects: SpeakDialect[]
): boolean {
  const speak = card.speak as FlashcardCardSpeak | undefined;
  return (
    !!speak &&
    speak.term === card.term &&
    // The connector never reads voices, so a card waiting on them is as current as it can make it.
    (speak.g2pVersion === SPEAK_G2P_VERSION ||
      speak.g2pVersion === SPEAK_G2P_VOICES_PENDING) &&
    Array.isArray(speak.refs) &&
    !speak.reasons?.includes('lookup-failed') &&
    sameDialects(speak, dialects)
  );
}

const lookupFailed = (card: FlashcardCard): FlashcardCardSpeak => ({
  term: card.term,
  refs: [],
  g2pVersion: SPEAK_G2P_VERSION,
  status: 'unavailable',
  reasons: ['lookup-failed'],
});

/** Looks up every card whose references are stale; a failed lookup marks those cards so the next save retries. */
export async function attachSpeakReferences(
  cards: FlashcardCard[],
  language: SpeakLanguage,
  dialects: SpeakDialect[],
  compute: typeof computeSpeakReferences = computeSpeakReferences
): Promise<FlashcardCard[]> {
  const stale = cards.filter((card) => !cardSpeakCurrent(card, dialects));
  if (stale.length === 0) return cards;
  let found: Record<string, FlashcardCardSpeak>;
  try {
    const input = parseLookupInput({
      language,
      dialects,
      terms: stale.map((card) => {
        const previous = card.speak as FlashcardCardSpeak | undefined;
        const ipaOverride =
          previous?.term === card.term ? previous.ipaOverride : undefined;
        return {
          cardId: card.id,
          term: card.term,
          ...(ipaOverride ? { ipaOverride } : {}),
        };
      }),
    });
    found =
      // The voice model blocks the event loop for seconds, so the shared connector leaves voices pending for the editor's callable.
      (await compute(input, undefined, { voices: false })).cards;
  } catch (err) {
    console.error('[mcpServer] Speak lookup failed', { err });
    found = {};
  }
  const staleIds = new Set(stale.map((card) => card.id));
  return cards.map((card) =>
    staleIds.has(card.id)
      ? {
          ...card,
          speak: keepConfirmation(
            card.speak as FlashcardCardSpeak | undefined,
            found[card.id] ?? lookupFailed(card)
          ) as unknown as Record<string, unknown>,
        }
      : card
  );
}

/** A teacher's confirmation survives a re-lookup that returns the same references. */
const keepConfirmation = (
  previous: FlashcardCardSpeak | undefined,
  next: FlashcardCardSpeak
): FlashcardCardSpeak =>
  previous?.confirmedAt &&
  previous.term === next.term &&
  next.status === 'needs-review' &&
  JSON.stringify(espeakRefs(previous)) === JSON.stringify(espeakRefs(next))
    ? { ...next, confirmedAt: previous.confirmedAt }
    : next;

export interface SpeakCounts {
  ready: number;
  to_check: number;
  unavailable: number;
}

export const countSpeakCards = (cards: FlashcardCard[]): SpeakCounts => {
  const counts: SpeakCounts = { ready: 0, to_check: 0, unavailable: 0 };
  for (const card of cards) {
    const speak = card.speak as FlashcardCardSpeak | undefined;
    if (speak?.status === 'ready') counts.ready += 1;
    else if (speak?.status === 'needs-review' && !speak.confirmedAt) {
      counts.to_check += 1;
    } else if (speak?.status === 'needs-review') counts.ready += 1;
    else counts.unavailable += 1;
  }
  return counts;
};

export interface SpeakSaveResult {
  set: FlashcardSet;
  /** Present when the teacher has Speak and the language supports it (F21 stamp source). */
  stamp?: SpeakSettings & { unclearConfidence: number };
  counts?: SpeakCounts;
}

/** Server gate, mirrors canAccessFeature('flashcards-speak'). */
export async function speakGranted(
  db: Firestore,
  email: string | null,
  uid: string
): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  return isGlobalFeatureGranted(db, FLASHCARDS_SPEAK_FEATURE_ID, email, uid);
}

/** Resolves Speak for a connector save: settings (written only when Claude passed some or the set has its own), card lookups and the stamp. */
export async function prepareSpeakSave(
  db: Firestore,
  who: { email: string | null; uid: string },
  set: FlashcardSet,
  input: SpeakSettingsInput | undefined
): Promise<SpeakSaveResult> {
  const language = speakLanguageOf(set.termLanguage);
  if (input && !language) {
    throw new ToolError(
      'Speak works when the term language is Spanish, German or English.'
    );
  }
  const granted =
    language !== null && (await speakGranted(db, who.email, who.uid));
  if (input && !granted) {
    throw new ToolError('Speak is not turned on for this account.');
  }
  if (!language || !granted) return { set };
  const own = ownSpeakFits(set.speak, language) ? set.speak : undefined;
  const defaults = await readSpeakAdminDefaults(db);
  const resolved = resolveSpeakSettings(language, own, defaults);
  const settings = input
    ? applySpeakInput(language, resolved, input)
    : resolved;
  const cards = await attachSpeakReferences(
    set.cards,
    language,
    settings.dialects
  );
  const next: FlashcardSet = { ...set, cards };
  if (input || own) next.speak = settings as unknown as Record<string, unknown>;
  else delete next.speak;
  return {
    set: next,
    stamp: { ...settings, unclearConfidence: defaults.unclearConfidence },
    counts: countSpeakCards(cards),
  };
}

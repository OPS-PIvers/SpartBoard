// Client for the save-time reference lookup (docs/multilingual-pronunciation-engine.md §5, S3).
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type {
  FlashcardCard,
  FlashcardCardSpeak,
  SpeakDialect,
  SpeakLanguage,
} from '@/types';
import {
  cardNeedsLookup,
  effectiveIpaOverride,
  keepSpeakConfirmation,
  lookupFailedSpeak,
  speakForTerm,
  type SpeakIpaDrafts,
} from './speakEditorState';
import { logError } from '@/utils/logError';
import {
  firestoreBytes,
  SPEAK_DOC_BUDGET_BYTES,
} from '@/utils/pronunciation/fitSpeakToDoc';

export interface LookupInput {
  /** false skips the slow voice readings, leaving those cards pending. */
  voices?: false;
  language: SpeakLanguage;
  dialects: SpeakDialect[];
  terms: Array<{
    cardId: string;
    term: string;
    ipaOverride?: Partial<Record<SpeakDialect, string>>;
  }>;
}

export interface LookupOutput {
  g2pVersion: string;
  cards: Record<string, FlashcardCardSpeak>;
}

export type SpeakLookupCall = (input: LookupInput) => Promise<LookupOutput>;

const lookupCaller =
  (timeout: number): SpeakLookupCall =>
  async (input) => {
    const call = httpsCallable<LookupInput, LookupOutput>(
      functions,
      'lookupSpeakReferencesV1',
      { timeout }
    );
    return (await call(input)).data;
  };

export const callLookup = lookupCaller(130_000);
// Voice readings can use the callable's whole 540 s; its 420 s voice budget returns first.
export const callVoiceLookup = lookupCaller(540_000);

// Generous per-card size of a looked-up card, so retried cards don't push the set back over.
const RETRY_CARD_BYTES = 4096;

const droppedForSize = (card: FlashcardCard): boolean =>
  !!speakForTerm(card)?.reasons?.includes('set-too-large');

/** Cards whose references must be looked up again before saving; cards dropped for size retry, first first, while the set has room. */
export const cardsNeedingLookup = (
  cards: readonly FlashcardCard[],
  dialects: readonly SpeakDialect[],
  drafts: SpeakIpaDrafts
): FlashcardCard[] => {
  const stale = cards.filter(
    (card) => card.term.trim() !== '' && cardNeedsLookup(card, dialects, drafts)
  );
  const dropped = cards.filter(
    (card) =>
      card.term.trim() !== '' && droppedForSize(card) && !stale.includes(card)
  );
  if (dropped.length === 0) return stale;
  const room =
    SPEAK_DOC_BUDGET_BYTES -
    firestoreBytes(cards) -
    stale.length * RETRY_CARD_BYTES;
  const retry = new Set(
    dropped.slice(0, Math.max(0, Math.floor(room / RETRY_CARD_BYTES)))
  );
  return cards.filter((card) => stale.includes(card) || retry.has(card));
};

/** Quick lookup of new or changed terms, without voices; a failure marks those cards so the next save retries. */
export async function attachSpeakReferences(
  cards: FlashcardCard[],
  language: SpeakLanguage,
  dialects: SpeakDialect[],
  drafts: SpeakIpaDrafts,
  call: SpeakLookupCall = callLookup
): Promise<FlashcardCard[]> {
  const stale = cardsNeedingLookup(cards, dialects, drafts);
  if (stale.length === 0) return cards;
  let found: Record<string, FlashcardCardSpeak> = {};
  let g2pVersion = '';
  try {
    const out = await call({
      voices: false,
      language,
      dialects,
      terms: stale.map((card) => {
        const ipaOverride = effectiveIpaOverride(card, drafts, dialects);
        return {
          cardId: card.id,
          term: card.term,
          ...(ipaOverride ? { ipaOverride } : {}),
        };
      }),
    });
    found = out.cards;
    g2pVersion = out.g2pVersion;
  } catch (err) {
    logError('attachSpeakReferences', err);
  }
  const staleIds = new Set(stale.map((card) => card.id));
  return cards.map((card) =>
    staleIds.has(card.id)
      ? {
          ...card,
          speak: keepSpeakConfirmation(
            speakForTerm(card),
            found[card.id] ??
              lookupFailedSpeak(
                card,
                g2pVersion,
                effectiveIpaOverride(card, drafts, dialects)
              )
          ),
        }
      : card
  );
}

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

interface LookupInput {
  language: SpeakLanguage;
  dialects: SpeakDialect[];
  terms: Array<{
    cardId: string;
    term: string;
    ipaOverride?: Partial<Record<SpeakDialect, string>>;
  }>;
}

interface LookupOutput {
  g2pVersion: string;
  cards: Record<string, FlashcardCardSpeak>;
}

export type SpeakLookupCall = (input: LookupInput) => Promise<LookupOutput>;

const callLookup: SpeakLookupCall = async (input) => {
  const call = httpsCallable<LookupInput, LookupOutput>(
    functions,
    'lookupSpeakReferencesV1',
    { timeout: 130_000 }
  );
  return (await call(input)).data;
};

// A card dropped from a set that was too big gets another lookup once the set has room again.
const RETRY_DROPPED_BYTES = SPEAK_DOC_BUDGET_BYTES * 0.75;

const droppedForSize = (card: FlashcardCard): boolean =>
  !!speakForTerm(card)?.reasons?.includes('set-too-large');

/** Cards whose references must be looked up again before saving. */
export const cardsNeedingLookup = (
  cards: readonly FlashcardCard[],
  dialects: readonly SpeakDialect[],
  drafts: SpeakIpaDrafts
): FlashcardCard[] => {
  const retryDropped =
    cards.some(droppedForSize) && firestoreBytes(cards) < RETRY_DROPPED_BYTES;
  return cards.filter(
    (card) =>
      card.term.trim() !== '' &&
      (cardNeedsLookup(card, dialects, drafts) ||
        (retryDropped && droppedForSize(card)))
  );
};

/** Looks up only new or changed terms; a failure marks those cards so the next save retries. */
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

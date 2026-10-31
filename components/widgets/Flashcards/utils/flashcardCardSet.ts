// A card set a Platform reader sent (docs/plans/IMPORT.md D38) as Flashcards cards and languages.
import type { FlashcardCard } from '@/types';
import type {
  ImportCardSet,
  ImportCardsLeftOut,
} from '@/utils/import/contract';
import { flashcardsFromRows } from './flashcardImport';
import { flashcardLanguageFor } from './flashcardLanguages';

export interface CardSetImport {
  cards: FlashcardCard[];
  termLanguage?: string;
  definitionLanguage?: string;
  warnings: string[];
  /** What didn't come over; absent when everything did. */
  note?: string;
}

const PHRASES: Record<ImportCardsLeftOut, (n: number) => string> = {
  picture: (n) => (n === 1 ? '1 picture' : `${n} pictures`),
  audio: (n) => (n === 1 ? '1 audio recording' : `${n} audio recordings`),
  diagram: (n) => (n === 1 ? '1 diagram card' : `${n} diagram cards`),
};

export function cardSetLeftOut(
  leftOut: ImportCardSet['leftOut'] = {}
): string | undefined {
  const parts = (Object.keys(PHRASES) as ImportCardsLeftOut[])
    .filter((k) => (leftOut[k] ?? 0) > 0)
    .map((k) => PHRASES[k](leftOut[k] ?? 0));
  if (!parts.length) return undefined;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Left out: ${list}.`;
}

export function flashcardsFromCardSet(set: ImportCardSet): CardSetImport {
  const { cards, warnings } = flashcardsFromRows(
    set.cards.map((c) => [c.term, c.definition]),
    { headerless: true }
  );
  const termLanguage = flashcardLanguageFor(set.termLanguage);
  const definitionLanguage = flashcardLanguageFor(set.definitionLanguage);
  const note = cardSetLeftOut(set.leftOut);
  return {
    cards,
    warnings,
    ...(termLanguage ? { termLanguage } : {}),
    ...(definitionLanguage ? { definitionLanguage } : {}),
    ...(note ? { note } : {}),
  };
}

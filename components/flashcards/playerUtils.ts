import type { FlashcardCard, FlashcardMode, FlashcardSide } from '@/types';

export interface FlashcardSides {
  prompt: string;
  answer: string;
}

/** A card without a definition shows its term first and has no answer side. */
export const getFlashcardSides = (
  card: FlashcardCard,
  showFirst: FlashcardSide
): FlashcardSides =>
  !card.definition.trim()
    ? { prompt: card.term, answer: '' }
    : showFirst === 'term'
      ? { prompt: card.term, answer: card.definition }
      : { prompt: card.definition, answer: card.term };

/** Write and Test need both sides of every card. */
export const isTermOnlyDeck = (cards: readonly FlashcardCard[]): boolean =>
  cards.some((card) => !card.definition.trim());

export const DEFINITION_MODES: readonly FlashcardMode[] = ['write', 'test'];

export const cx = (
  ...values: Array<string | false | null | undefined>
): string => values.filter(Boolean).join(' ');

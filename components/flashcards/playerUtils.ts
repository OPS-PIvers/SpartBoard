import { isFlashcardImageUrl } from '@/utils/flashcardImageUrls';
import type { FlashcardCard, FlashcardMode, FlashcardSide } from '@/types';

export interface FlashcardSides {
  prompt: string;
  answer: string;
  promptImage?: string;
  answerImage?: string;
}

const imageOf = (url: string | undefined): string | undefined =>
  isFlashcardImageUrl(url) ? url : undefined;

/** A card without a definition shows its term first and has no answer side. */
export const getFlashcardSides = (
  card: FlashcardCard,
  showFirst: FlashcardSide
): FlashcardSides => {
  const term = { text: card.term, image: imageOf(card.termImageUrl) };
  const definition = {
    text: card.definition,
    image: imageOf(card.definitionImageUrl),
  };
  if (!card.definition.trim()) {
    return { prompt: term.text, answer: '', promptImage: term.image };
  }
  const [first, second] =
    showFirst === 'term' ? [term, definition] : [definition, term];
  return {
    prompt: first.text,
    answer: second.text,
    promptImage: first.image,
    answerImage: second.image,
  };
};

/** Write and Test need both sides of every card. */
export const isTermOnlyDeck = (cards: readonly FlashcardCard[]): boolean =>
  cards.some((card) => !card.definition.trim());

export const DEFINITION_MODES: readonly FlashcardMode[] = ['write', 'test'];

export const cx = (
  ...values: Array<string | false | null | undefined>
): string => values.filter(Boolean).join(' ');

import type { FlashcardCard, FlashcardSide } from '@/types';

export interface FlashcardSides {
  prompt: string;
  answer: string;
}

export const getFlashcardSides = (
  card: FlashcardCard,
  showFirst: FlashcardSide
): FlashcardSides =>
  showFirst === 'term'
    ? { prompt: card.term, answer: card.definition }
    : { prompt: card.definition, answer: card.term };

export const cx = (
  ...values: Array<string | false | null | undefined>
): string => values.filter(Boolean).join(' ');

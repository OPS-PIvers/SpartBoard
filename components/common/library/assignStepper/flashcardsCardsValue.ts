// Which cards a Flashcards submission assignment uses (flag flashcards-assign-v2).
import type { FlashcardCard, FlashcardCardSelection } from '@/types';

export type FlashcardsCardsValue = FlashcardCardSelection;

export const DEFAULT_FLASHCARDS_CARDS_VALUE: FlashcardsCardsValue = {
  mode: 'all',
};

/** A random count that fits this deck; at least 1, below the deck size. */
export const clampRandomCount = (count: number, cardCount: number): number =>
  Math.max(1, Math.min(Math.round(count), Math.max(1, cardCount - 1)));

export const defaultRandomCount = (cardCount: number): number =>
  clampRandomCount(Math.min(10, Math.ceil(cardCount / 2)), cardCount);

/** Picked ids still in the set, in deck order. */
export const pickedCardIds = (
  value: FlashcardsCardsValue,
  cards: readonly FlashcardCard[]
): string[] => {
  if (value.mode !== 'pick') return [];
  const picked = new Set(value.cardIds);
  return cards.filter((card) => picked.has(card.id)).map((card) => card.id);
};

/** How many cards each student gets. */
export const selectedCardCount = (
  value: FlashcardsCardsValue,
  cards: readonly FlashcardCard[]
): number =>
  value.mode === 'random'
    ? clampRandomCount(value.count, cards.length)
    : value.mode === 'pick'
      ? pickedCardIds(value, cards).length
      : cards.length;

export const formatFlashcardsCardsValue = (
  value: FlashcardsCardsValue,
  cards: readonly FlashcardCard[]
): string => {
  const n = selectedCardCount(value, cards);
  const noun = n === 1 ? 'card' : 'cards';
  if (value.mode === 'random') return `${n} random ${noun}`;
  if (value.mode === 'pick') return `${n} chosen ${noun}`;
  return `All ${n} ${noun}`;
};

/** The cards the session gets; `random` draws once, so every student has the same cards. */
export const resolveSelectedCards = (
  value: FlashcardsCardsValue,
  cards: readonly FlashcardCard[],
  random: () => number = Math.random
): FlashcardCard[] => {
  if (value.mode === 'pick') {
    const picked = new Set(value.cardIds);
    return cards.filter((card) => picked.has(card.id));
  }
  if (value.mode === 'random') {
    const count = clampRandomCount(value.count, cards.length);
    if (count >= cards.length) return [...cards];
    const order = cards.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const chosen = new Set(order.slice(0, count));
    return cards.filter((_, i) => chosen.has(i));
  }
  return [...cards];
};

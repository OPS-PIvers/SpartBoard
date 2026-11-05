import { describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import {
  clampRandomCount,
  formatFlashcardsCardsValue,
  resolveSelectedCards,
  selectedCardCount,
} from './flashcardsCardsValue';

const cards: FlashcardCard[] = Array.from({ length: 6 }, (_, i) => ({
  id: `c${i}`,
  term: `t${i}`,
  definition: `d${i}`,
}));

describe('flashcardsCardsValue', () => {
  it('keeps every card for all', () => {
    expect(resolveSelectedCards({ mode: 'all' }, cards)).toEqual(cards);
    expect(formatFlashcardsCardsValue({ mode: 'all' }, cards)).toBe(
      'All 6 cards'
    );
  });

  it('draws the asked-for number of distinct cards in deck order', () => {
    let seed = 0.3;
    const random = () => (seed = (seed * 9301 + 0.49297) % 1);
    const drawn = resolveSelectedCards(
      { mode: 'random', count: 3 },
      cards,
      random
    );
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn.map((c) => c.id)).size).toBe(3);
    const order = drawn.map((c) => cards.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('clamps a random count below the deck size', () => {
    expect(clampRandomCount(0, 6)).toBe(1);
    expect(clampRandomCount(10, 6)).toBe(5);
    expect(selectedCardCount({ mode: 'random', count: 99 }, cards)).toBe(5);
  });

  it('keeps picked cards that still exist, in deck order', () => {
    const value = { mode: 'pick' as const, cardIds: ['c4', 'gone', 'c1'] };
    expect(resolveSelectedCards(value, cards).map((c) => c.id)).toEqual([
      'c1',
      'c4',
    ]);
    expect(formatFlashcardsCardsValue(value, cards)).toBe('2 chosen cards');
    expect(
      formatFlashcardsCardsValue({ mode: 'pick', cardIds: ['c0'] }, cards)
    ).toBe('1 chosen card');
  });
});

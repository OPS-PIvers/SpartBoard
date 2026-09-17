import { describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import {
  buildFlashcardRoundQueue,
  countMasteredFlashcards,
  recordFlashcardAnswer,
} from './flashcardSchedule';

const cards: FlashcardCard[] = [
  { id: 'a', term: 'uno', definition: 'one' },
  { id: 'b', term: 'dos', definition: 'two' },
  { id: 'c', term: 'tres', definition: 'three' },
];

describe('flashcard schedule', () => {
  it('masters a perfect card in three views and skips empty rounds', () => {
    const first = recordFlashcardAnswer(undefined, 1, true);
    const second = recordFlashcardAnswer(first, 2, true);
    const third = recordFlashcardAnswer(second, 4, true);

    expect(first).toMatchObject({ s: 1, due: 2, c: 1, w: 0 });
    expect(second).toMatchObject({ s: 2, due: 4 });
    expect(third).toMatchObject({ s: 3, due: 8 });
    expect(countMasteredFlashcards(cards.slice(0, 1), { a: third })).toBe(1);
    expect(
      buildFlashcardRoundQueue({
        cards: cards.slice(0, 1),
        progress: { a: second },
        round: 3,
      })
    ).toMatchObject({ round: 4, cards: [cards[0]] });
  });

  it('resets the streak and schedules a miss for the next round', () => {
    const progress = recordFlashcardAnswer(
      { s: 3, due: 4, c: 4, w: 1 },
      4,
      false
    );
    expect(progress).toEqual({ s: 0, due: 5, c: 4, w: 2 });
  });

  it('applies favorites and mastered filters before finding the next due round', () => {
    const queue = buildFlashcardRoundQueue({
      cards,
      progress: {
        a: { s: 3, due: 8, c: 3, w: 0 },
        b: { s: 1, due: 2, c: 1, w: 0 },
        c: { s: 0, due: 5, c: 0, w: 1 },
      },
      starred: ['a', 'c'],
      favoritesOnly: true,
      hideMastered: true,
      round: 1,
    });

    expect(queue.round).toBe(5);
    expect(queue.cards.map((card) => card.id)).toEqual(['c']);
  });

  it('uses a deterministic shuffle per round', () => {
    const first = buildFlashcardRoundQueue({
      cards,
      progress: {},
      round: 1,
      shuffle: true,
      seed: 'shared-set',
    });
    const second = buildFlashcardRoundQueue({
      cards,
      progress: {},
      round: 1,
      shuffle: true,
      seed: 'shared-set',
    });
    expect(second.cards.map((card) => card.id)).toEqual(
      first.cards.map((card) => card.id)
    );
  });
});

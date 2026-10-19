import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import {
  buildFlashcardRoundQueue,
  buildSpeakRoundQueue,
  countMasteredFlashcards,
  mergeSpeakTally,
  recordFlashcardAnswer,
  recordSpeakAnswer,
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

describe('flashcard schedule server parity', () => {
  const cases = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'functions',
        'src',
        'flashcardSchedule.cases.json'
      ),
      'utf8'
    )
  ) as Array<{
    name: string;
    ratings: Array<{ round: number; correct: boolean }>;
    expected: { s: number; due: number; c: number; w: number };
  }>;
  it.each(cases)('$name', ({ ratings, expected }) => {
    const result = ratings.reduce<
      ReturnType<typeof recordFlashcardAnswer> | undefined
    >(
      (current, rating) =>
        recordFlashcardAnswer(current, rating.round, rating.correct),
      undefined
    );
    expect(result).toEqual(expected);
  });
});

describe('Speak schedule', () => {
  const speakCard = (
    id: string,
    overrides: Partial<NonNullable<FlashcardCard['speak']>> = {}
  ): FlashcardCard => ({
    id,
    term: id,
    definition: `${id} def`,
    speak: {
      term: id,
      refs: [{ dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [0] }],
      g2pVersion: 'v1',
      status: 'ready',
      ...overrides,
    },
  });

  it('queues only cards with usable references for their current term', () => {
    const cards: FlashcardCard[] = [
      speakCard('ready'),
      speakCard('review', { status: 'needs-review' }),
      speakCard('gone', { status: 'unavailable' }),
      speakCard('stale', { term: 'older' }),
      speakCard('empty', { refs: [] }),
      { id: 'plain', term: 'plain', definition: 'p' },
    ];
    const queue = buildSpeakRoundQueue({
      cards,
      speak: undefined,
      speakRound: undefined,
    });
    expect(queue.round).toBe(1);
    expect(queue.cards.map((card) => card.id)).toEqual(['ready', 'review']);
  });

  it('runs on Speak progress and round, not recall', () => {
    const cards = [speakCard('a'), speakCard('b')];
    const queue = buildSpeakRoundQueue({
      cards,
      speak: {
        a: { s: 2, due: 5, c: 2, w: 0, best: 90, last: 90, tries: 1 },
        b: { s: 1, due: 4, c: 1, w: 0, best: 80, last: 80, tries: 1 },
      },
      speakRound: 3,
    });
    expect(queue).toEqual({ round: 4, cards: [cards[1]] });
  });

  it('records passes on the shared spacing and merges tallies', () => {
    const first = recordSpeakAnswer(undefined, 1, true, 72.4, 2);
    expect(first).toEqual({
      s: 1,
      due: 2,
      c: 1,
      w: 0,
      best: 72,
      last: 72,
      tries: 2,
    });
    expect(recordSpeakAnswer(first, 2, false, 30, 3)).toMatchObject({
      s: 0,
      best: 72,
      last: 30,
    });
    expect(
      mergeSpeakTally({ r: { n: 1, m: 1, f: 0 } }, { r: { n: 1, m: 0, f: 1 } })
    ).toEqual({ r: { n: 2, m: 1, f: 1 } });
    expect(
      mergeSpeakTally(undefined, {
        r: { n: 1, m: 0, f: 0 },
        notAToken: { n: 1, m: 1, f: 0 },
      })
    ).toEqual({ r: { n: 1, m: 0, f: 0 } });
  });
});

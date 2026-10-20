import { describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import { cardsNeedingLookup } from './lookupSpeakReferences';
import { SPEAK_G2P_VERSION } from '@/utils/pronunciation/g2pVersion';

const dropped = (id: string, definition = 'd'): FlashcardCard => ({
  id,
  term: 'perro',
  definition,
  speak: {
    term: 'perro',
    refs: [],
    g2pVersion: SPEAK_G2P_VERSION,
    status: 'unavailable',
    reasons: ['set-too-large'],
    dialects: ['es-419'],
  },
});

describe('cardsNeedingLookup', () => {
  it('looks a card dropped for size up again once the set has room', () => {
    expect(
      cardsNeedingLookup([dropped('a')], ['es-419'], {}).map((c) => c.id)
    ).toEqual(['a']);
  });

  it('leaves dropped cards alone while the set is still near the limit', () => {
    const cards = Array.from({ length: 500 }, (_, i) =>
      dropped(`c${i}`, 'd'.repeat(1400))
    );
    expect(cardsNeedingLookup(cards, ['es-419'], {})).toEqual([]);
  });
});

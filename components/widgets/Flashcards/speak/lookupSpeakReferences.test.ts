import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCard } from '@/types';
import {
  attachSpeakReferences,
  cardsNeedingLookup,
  type SpeakLookupCall,
} from './lookupSpeakReferences';
import { resetServedG2pVersion } from './speakEditorState';
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
      dropped(`c${i}`, 'd'.repeat(1800))
    );
    expect(cardsNeedingLookup(cards, ['es-419'], {})).toEqual([]);
  });
});

describe('cardsNeedingLookup headroom', () => {
  it('retries only as many dropped cards as the set has room for, first first', () => {
    // About 870 KiB of cards leaves room for a few retried cards.
    const cards = Array.from({ length: 500 }, (_, i) =>
      dropped(`c${i}`, 'd'.repeat(1550))
    );
    const ids = cardsNeedingLookup(cards, ['es-419'], {}).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(30);
    expect(ids).toEqual(cards.slice(0, ids.length).map((c) => c.id));
  });
});

describe('attachSpeakReferences', () => {
  it('asks for the quick check, leaving voices to the background fill', async () => {
    const call = vi.fn<SpeakLookupCall>().mockResolvedValue({
      g2pVersion: SPEAK_G2P_VERSION,
      cards: {},
    });
    await attachSpeakReferences(
      [{ id: 'a', term: 'perro', definition: 'dog' }],
      'es',
      ['es-419'],
      {},
      call
    );
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ voices: false })
    );
  });
});

describe('attachSpeakReferences against a trailing function', () => {
  it('looks a card up once, not again on the next save', async () => {
    resetServedG2pVersion();
    const call = vi.fn<SpeakLookupCall>().mockImplementation(({ terms }) =>
      Promise.resolve({
        g2pVersion: 'v-old',
        cards: Object.fromEntries(
          terms.map((t) => [
            t.cardId,
            {
              term: t.term,
              refs: [{ dialect: 'es-419', tokens: ['p'], stress: [0] }],
              g2pVersion: 'v-old/pending',
              status: 'ready',
              dialects: ['es-419'],
            },
          ])
        ),
      } as Awaited<ReturnType<SpeakLookupCall>>)
    );
    const first = await attachSpeakReferences(
      [{ id: 'a', term: 'perro', definition: 'dog' }],
      'es',
      ['es-419'],
      {},
      call
    );
    await attachSpeakReferences(first, 'es', ['es-419'], {}, call);
    expect(call).toHaveBeenCalledTimes(1);
    resetServedG2pVersion();
  });
});

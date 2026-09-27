import { describe, expect, it } from 'vitest';
import {
  MAX_CARDS,
  MAX_TERM,
  mergeCards,
  normalizeSet,
  type FlashcardSet,
} from './flashcardStore';

const base: FlashcardSet = {
  id: 's1',
  title: '  Cells ',
  description: ' d ',
  termLanguage: ' ',
  definitionLanguage: 'es-MX',
  cards: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('normalizeSet', () => {
  it('trims, defaults languages and caps cards like the client', () => {
    const cards = Array.from({ length: MAX_CARDS + 3 }, (_, i) => ({
      id: `c${i}`,
      term: 't'.repeat(MAX_TERM + 10),
      definition: 'd',
    }));
    const out = normalizeSet({ ...base, cards }, 99);
    expect(out.title).toBe('Cells');
    expect(out.description).toBe('d');
    expect(out.termLanguage).toBe('en-US');
    expect(out.definitionLanguage).toBe('es-MX');
    expect(out.cards).toHaveLength(MAX_CARDS);
    expect(out.cards[0].term).toHaveLength(MAX_TERM);
    expect(out.folderId).toBeNull();
    expect(out.updatedAt).toBe(99);
  });
});

describe('mergeCards', () => {
  it('keeps known ids once and mints ids for new or unknown cards', () => {
    const existing = [{ id: 'a', term: 'x', definition: 'y' }];
    const out = mergeCards(existing, [
      { id: 'a', term: 'x2', definition: 'y2' },
      { id: 'a', term: 'dup', definition: 'dup' },
      { id: 'ghost', term: 'g', definition: 'g' },
      { term: 'n', definition: 'n' },
    ]);
    expect(out[0].id).toBe('a');
    expect(new Set(out.map((c) => c.id)).size).toBe(4);
    expect(out.map((c) => c.id)).not.toContain('ghost');
  });
});

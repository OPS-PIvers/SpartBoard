import { describe, expect, it } from 'vitest';
import {
  MAX_CARDS,
  MAX_TERM,
  mergeCards,
  normalizeSet,
  stageSetWrite,
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

describe('Speak carry-through', () => {
  const speak = { term: 'hola', refs: [], g2pVersion: 'v1', status: 'ready' };

  it('keeps card references only while the term is unchanged', () => {
    const existing = [
      { id: 'a', term: 'hola', definition: 'hi', speak },
      { id: 'b', term: 'perro', definition: 'dog', speak },
    ];
    const out = mergeCards(existing, [
      { id: 'a', term: 'hola', definition: 'hello' },
      { id: 'b', term: 'gato', definition: 'cat' },
    ]);
    expect(out[0].speak).toBe(speak);
    expect('speak' in out[1]).toBe(false);
  });

  it('carries set and card Speak through normalizeSet and adds nothing without it', () => {
    const settings = { dialects: ['es-419'], attempts: 3 };
    const out = normalizeSet({
      ...base,
      speak: settings,
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak }],
    });
    expect(out.speak).toBe(settings);
    expect(out.cards[0].speak).toBe(speak);
    const plain = normalizeSet({
      ...base,
      cards: [{ id: 'a', term: 'hola', definition: 'hi' }],
    });
    expect('speak' in plain).toBe(false);
    expect(Object.keys(plain.cards[0])).toEqual(['id', 'term', 'definition']);
  });

  it('leaves the snapshot Speak stamp to the teacher client', () => {
    const calls: unknown[][] = [];
    const db = { doc: (path: string) => path } as unknown as Parameters<
      typeof stageSetWrite
    >[0];
    const batch = {
      set: (...args: unknown[]) => calls.push(args),
    } as unknown as Parameters<typeof stageSetWrite>[1];
    stageSetWrite(db, batch, 'uid', { ...base, publicShareId: 'share' });
    const snapshotCall = calls[1];
    expect(snapshotCall?.[0]).toBe('public_flashcard_sets/share');
    const { mergeFields } = snapshotCall?.[2] as { mergeFields: string[] };
    expect(mergeFields).not.toContain('speak');
    expect([...mergeFields].sort()).toEqual(
      Object.keys(snapshotCall?.[1] as object).sort()
    );
  });
});

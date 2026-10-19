import { describe, expect, it } from 'vitest';
import {
  MAX_CARDS,
  MAX_TERM,
  mergeCards,
  normalizeSet,
  rewriteOpenStudySessions,
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

  it('drops card references from another language', () => {
    const esSpeak = { ...speak, refs: [{ dialect: 'es-419', tokens: ['o'] }] };
    const out = normalizeSet({
      ...base,
      termLanguage: 'fr-FR',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak: esSpeak }],
    });
    expect('speak' in out.cards[0]).toBe(false);
    const kept = normalizeSet({
      ...base,
      termLanguage: 'es-MX',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak: esSpeak }],
    });
    expect(kept.cards[0].speak).toBe(esSpeak);
  });

  it('drops the snapshot stamp only when the term language changes', () => {
    const calls: unknown[][] = [];
    const db = { doc: (path: string) => path } as unknown as Parameters<
      typeof stageSetWrite
    >[0];
    const batch = {
      set: (...args: unknown[]) => calls.push(args),
    } as unknown as Parameters<typeof stageSetWrite>[1];
    const shared = { ...base, termLanguage: 'fr-FR', publicShareId: 'share' };
    stageSetWrite(db, batch, 'uid', shared, 'fr-CA');
    stageSetWrite(db, batch, 'uid', shared, 'es-US');
    const same = calls[1]?.[2] as { mergeFields: string[] };
    const moved = calls[3]?.[2] as { mergeFields: string[] };
    expect(same.mergeFields).not.toContain('speak');
    expect(moved.mergeFields).toContain('speak');
    expect(calls[3]?.[1]).toHaveProperty('speak');
  });

  it('keeps a session stamp for the same language and clears it otherwise', async () => {
    const updates: Array<[string, Record<string, unknown>]> = [];
    const sessions = [
      { id: 's-es', speak: { dialects: ['es-419'] } },
      { id: 's-fr', speak: { dialects: ['fr-FR'] } },
      { id: 's-none' },
    ];
    const query = {
      where: () => query,
      get: () =>
        Promise.resolve({
          empty: false,
          size: sessions.length,
          docs: sessions.map((data) => ({
            id: data.id,
            ref: data.id,
            get: (key: string) => (data as Record<string, unknown>)[key],
          })),
        }),
    };
    const db = {
      collection: () => query,
      batch: () => ({
        update: (ref: string, data: Record<string, unknown>) =>
          updates.push([ref, data]),
        set: () => undefined,
        commit: () => Promise.resolve(),
      }),
    } as unknown as Parameters<typeof rewriteOpenStudySessions>[0];
    await rewriteOpenStudySessions(db, 'uid', {
      ...base,
      termLanguage: 'es-US',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak }],
    });
    const byId = Object.fromEntries(updates);
    expect(byId['s-es']).not.toHaveProperty('speak');
    expect((byId['s-es'].cards as FlashcardSet['cards'])[0].speak).toBe(speak);
    expect(byId['s-fr']).toHaveProperty('speak');
    expect((byId['s-fr'].cards as FlashcardSet['cards'])[0]).not.toHaveProperty(
      'speak'
    );
    expect(byId['s-none']).not.toHaveProperty('speak');
    expect(
      (byId['s-none'].cards as FlashcardSet['cards'])[0]
    ).not.toHaveProperty('speak');
  });
});

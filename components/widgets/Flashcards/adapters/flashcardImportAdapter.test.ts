import { describe, expect, it, vi } from 'vitest';
import { createFlashcardImportAdapter } from './flashcardImportAdapter';

describe('createFlashcardImportAdapter cards', () => {
  it('reads a sent card set exactly and saves its languages', async () => {
    const save = vi.fn(() => Promise.resolve());
    const adapter = createFlashcardImportAdapter({
      loadSheet: () => Promise.resolve([]),
      pickSheet: () => Promise.resolve(null),
      save,
    });
    const read = await adapter.parse({
      kind: 'cards',
      set: {
        cards: [{ term: 'el perro', definition: 'the dog' }],
        termLanguage: 'es',
        definitionLanguage: 'en',
        leftOut: { audio: 2 },
      },
    });
    expect(read.note).toBe('Left out: 2 audio recordings.');
    expect(read.data).toMatchObject({
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards: [{ term: 'el perro', definition: 'the dog' }],
    });
    await adapter.save(read.data, 'Spanish', { fromInitialSource: true });
    expect(save).toHaveBeenCalledWith(read.data, 'Spanish', true);
  });
});

describe('createFlashcardImportAdapter term-only', () => {
  it('keeps term-only CSV and Sheet rows only when allowed', async () => {
    const make = (termOnly: boolean) =>
      createFlashcardImportAdapter({
        loadSheet: () => Promise.resolve([['said'], ['was']]),
        pickSheet: () => Promise.resolve(null),
        save: () => Promise.resolve(),
        termOnly,
      });
    const csv = await make(true).parse({ kind: 'csv', text: 'said\nwas' });
    expect(csv.data.cards.map((card) => card.term)).toEqual(['said', 'was']);
    const sheet = await make(true).parse({ kind: 'sheet', url: 'x' });
    expect(sheet.data.cards).toHaveLength(2);
    const strict = await make(false).parse({ kind: 'sheet', url: 'x' });
    expect(strict.data.cards).toHaveLength(0);
  });
});

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

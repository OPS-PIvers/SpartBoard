import { describe, expect, it } from 'vitest';
import { flashcardsFromCardSet } from './flashcardCardSet';
import { flashcardLanguageFor } from './flashcardLanguages';

describe('flashcardLanguageFor', () => {
  it.each([
    ['es', 'es-US'],
    ['en', 'en-US'],
    ['zh-CN', 'zh-CN'],
    ['pt', 'pt-BR'],
    ['nl', 'nl'],
    ['math', null],
    ['photo', null],
    [undefined, null],
  ])('%s', (code, tag) => {
    expect(flashcardLanguageFor(code)).toBe(tag);
  });
});

describe('flashcardsFromCardSet', () => {
  it('keeps every card, even one that reads like a header, with its languages', () => {
    const read = flashcardsFromCardSet({
      cards: [
        { term: 'Term', definition: 'Definition' },
        { term: 'el perro', definition: 'the dog' },
      ],
      termLanguage: 'es',
      definitionLanguage: 'en',
    });
    expect(read.cards.map((c) => [c.term, c.definition])).toEqual([
      ['Term', 'Definition'],
      ['el perro', 'the dog'],
    ]);
    expect(read).toMatchObject({
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      warnings: [],
    });
    expect(read).not.toHaveProperty('note');
  });

  it('skips a picture-only card and says what was left out', () => {
    const read = flashcardsFromCardSet({
      cards: [
        { term: 'mitochondria', definition: '' },
        { term: 'cell', definition: 'unit of life' },
      ],
      termLanguage: 'math',
      leftOut: { picture: 3, diagram: 1 },
    });
    expect(read.cards).toHaveLength(1);
    expect(read.warnings).toEqual(['1 incomplete row was skipped.']);
    expect(read.note).toBe('Left out: 3 pictures and 1 diagram card.');
    expect(read).not.toHaveProperty('termLanguage');
  });
});

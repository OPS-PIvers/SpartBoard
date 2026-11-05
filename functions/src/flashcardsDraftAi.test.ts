import { describe, expect, it } from 'vitest';
import {
  buildFlashcardsPrompt,
  flashcardDraftCount,
  validateFlashcardDrafts,
} from './flashcardsDraftAi';

describe('flashcardDraftCount', () => {
  it('clamps to 1..50 and defaults to 10', () => {
    expect(flashcardDraftCount(undefined)).toBe(10);
    expect(flashcardDraftCount('7')).toBe(10);
    expect(flashcardDraftCount(0)).toBe(1);
    expect(flashcardDraftCount(500)).toBe(50);
    expect(flashcardDraftCount(12.7)).toBe(12);
  });
});

describe('validateFlashcardDrafts', () => {
  it('drops half-empty cards and duplicate terms and caps the count', () => {
    const cards = validateFlashcardDrafts(
      [
        { term: 'Cell', definition: 'Unit of life' },
        { term: 'cell', definition: 'Duplicate' },
        { term: '', definition: 'No term' },
        { term: 'Atom', definition: '' },
        'junk',
        { term: '  Nucleus ', definition: ' Holds   DNA ' },
        { term: 'Extra', definition: 'Over the cap' },
      ],
      2
    );
    expect(cards).toEqual([
      { term: 'Cell', definition: 'Unit of life' },
      { term: 'Nucleus', definition: 'Holds DNA' },
    ]);
  });

  it('returns nothing for a non-array reply', () => {
    expect(validateFlashcardDrafts({ term: 'x' }, 5)).toEqual([]);
  });
});

describe('buildFlashcardsPrompt', () => {
  it('asks for the requested count', () => {
    expect(buildFlashcardsPrompt(12)).toContain('exactly 12 cards');
  });
});

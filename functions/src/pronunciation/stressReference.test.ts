import { describe, expect, it } from 'vitest';
import { deriveStress, spanishSpellingStress } from './stressReference';

describe('deriveStress (R1-R5, 0-based)', () => {
  it('stores [0] for a monosyllable and nothing for no syllables', () => {
    expect(deriveStress('en', { syllableCount: 1, primary: [] })).toEqual({
      stress: [0],
      flagged: false,
    });
    expect(deriveStress('en', { syllableCount: 0, primary: [] })).toEqual({
      stress: [],
      flagged: false,
    });
  });

  it('keeps several marks, flagged except in Spanish (R5)', () => {
    expect(deriveStress('es', { syllableCount: 5, primary: [1, 4] })).toEqual({
      stress: [0, 3],
      flagged: false,
    });
    expect(deriveStress('en', { syllableCount: 3, primary: [1, 3] })).toEqual({
      stress: [0, 2],
      flagged: true,
    });
  });

  it('asserts nothing for a polysyllable with no mark', () => {
    expect(deriveStress('de', { syllableCount: 2, primary: [] })).toEqual({
      stress: [],
      flagged: false,
    });
  });

  it('uses espeak alone without a comparable cross-check (R4)', () => {
    expect(deriveStress('de', { syllableCount: 2, primary: [2] })).toEqual({
      stress: [1],
      flagged: false,
    });
    expect(
      deriveStress(
        'en',
        { syllableCount: 2, primary: [1] },
        { syllableCount: 3, primary: [2] }
      )
    ).toEqual({ stress: [0], flagged: false });
    expect(
      deriveStress(
        'en',
        { syllableCount: 2, primary: [1] },
        { syllableCount: 2, primary: [7] }
      )
    ).toEqual({ stress: [0], flagged: false });
  });

  it('accepts the union and flags a disagreement (R1)', () => {
    expect(
      deriveStress(
        'en',
        { syllableCount: 2, primary: [1] },
        { syllableCount: 2, primary: [1] }
      )
    ).toEqual({ stress: [0], flagged: false });
    expect(
      deriveStress(
        'en',
        { syllableCount: 2, primary: [1] },
        { syllableCount: 2, primary: [2] }
      )
    ).toEqual({ stress: [0, 1], flagged: true });
  });
});

describe('spanishSpellingStress (R3)', () => {
  it.each([
    ['casa', 2, 1],
    ['ciudad', 2, 2],
    ['árbol', 2, 1],
    ['canción', 2, 2],
    ['país', 2, 2],
    ['examen', 3, 2],
    ['sol', 1, 1],
  ])('%s has %i syllables, stress on %i', (word, count, primary) => {
    expect(spanishSpellingStress(word)).toEqual({
      syllableCount: count,
      primary: [primary],
    });
  });

  it('has no opinion without a vowel', () => {
    expect(spanishSpellingStress('pst')).toBeNull();
  });
});

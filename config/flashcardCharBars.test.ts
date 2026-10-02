import { describe, expect, it } from 'vitest';
import {
  getFlashcardAnswerCharacters,
  getFlashcardCharBar,
  uppercaseFlashcardCharacter,
} from './flashcardCharBars';

describe('flashcard character bars', () => {
  it('selects the bar from a BCP-47 primary language subtag', () => {
    expect(getFlashcardCharBar('es-MX')).toContain('ñ');
    expect(getFlashcardCharBar('fr-CA')).toContain('œ');
    expect(getFlashcardCharBar('de-DE')).toContain('ß');
    expect(getFlashcardCharBar('en-US')).toEqual([]);
  });

  it('ignores language codes that match Object.prototype members', () => {
    expect(getFlashcardCharBar('constructor')).toEqual([]);
    expect(getFlashcardCharBar('toString')).toEqual([]);
    expect(getFlashcardAnswerCharacters('constructor', ['año'])).toEqual(['ñ']);
  });

  it('adds special characters found in the answers', () => {
    expect(
      getFlashcardAnswerCharacters('en-US', ['élève', 'año', 'cat'])
    ).toEqual(['é', 'è', 'ñ']);
    expect(getFlashcardAnswerCharacters('es-US', ['niño', 'garçon'])).toEqual([
      ...getFlashcardCharBar('es-US'),
      'ç',
    ]);
    expect(getFlashcardAnswerCharacters('en-US', ['dog', 'кошка'])).toEqual([]);
  });

  it('capitalizes characters except sharp s', () => {
    expect(uppercaseFlashcardCharacter('é')).toBe('É');
    expect(uppercaseFlashcardCharacter('ß')).toBe('ß');
  });
});

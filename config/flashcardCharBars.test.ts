import { describe, expect, it } from 'vitest';
import {
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

  it('capitalizes characters except sharp s', () => {
    expect(uppercaseFlashcardCharacter('é')).toBe('É');
    expect(uppercaseFlashcardCharacter('ß')).toBe('ß');
  });
});

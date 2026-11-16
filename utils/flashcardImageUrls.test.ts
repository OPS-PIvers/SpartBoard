import { describe, expect, it } from 'vitest';
import {
  flashcardImageFields,
  isFlashcardImageUrl,
} from './flashcardImageUrls';

const OK = 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp';

describe('flashcard image urls', () => {
  it('accepts only Drive file links', () => {
    expect(isFlashcardImageUrl(OK)).toBe(true);
    expect(isFlashcardImageUrl(`${OK}?x=1`)).toBe(false);
    expect(isFlashcardImageUrl(OK.replace('https', 'http'))).toBe(false);
    expect(
      isFlashcardImageUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a')
    ).toBe(false);
    expect(isFlashcardImageUrl('https://evil.example/a.png')).toBe(false);
    expect(isFlashcardImageUrl('javascript:alert(1)')).toBe(false);
    expect(isFlashcardImageUrl(undefined)).toBe(false);
  });

  it('copies only valid picture fields', () => {
    expect(
      flashcardImageFields({ termImageUrl: OK, definitionImageUrl: 'x' })
    ).toEqual({ termImageUrl: OK });
    expect(flashcardImageFields({})).toEqual({});
  });
});

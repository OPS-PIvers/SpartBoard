import { describe, expect, it } from 'vitest';
import {
  flashcardImageFields,
  isFlashcardImageUrl,
} from './flashcardImageUrls';

const OK = 'https://firebasestorage.googleapis.com/v0/b/x/o/a.webp?alt=media';

describe('flashcard image urls', () => {
  it('accepts only https links on our Storage hosts', () => {
    expect(isFlashcardImageUrl(OK)).toBe(true);
    expect(isFlashcardImageUrl('http://firebasestorage.googleapis.com/a')).toBe(
      false
    );
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

/** Prepare scope: only locales a read-aloud student actually holds are synthesized. */
import { describe, it, expect } from 'vitest';
import { readAloudTranslationLocales } from '@/config/quizReadAloud';

describe('readAloudTranslationLocales', () => {
  it('returns the voiced locales of read-aloud students only', () => {
    expect(
      readAloudTranslationLocales({
        a: { readAloud: true, language: 'es' },
        b: { language: 'es' },
        c: { readAloud: true },
      })
    ).toEqual(['es']);
    expect(readAloudTranslationLocales({ b: { language: 'es' } })).toEqual([]);
  });

  it('drops locales with no TTS voice', () => {
    expect(
      readAloudTranslationLocales({
        a: { readAloud: true, language: 'so' },
        b: { readAloud: true, language: 'hmn' },
      })
    ).toEqual([]);
  });

  it('covers every targeted locale when read-aloud is on for all', () => {
    expect(
      readAloudTranslationLocales(
        { a: { language: 'es' }, b: { language: 'so' } },
        true
      )
    ).toEqual(['es']);
  });

  it('handles a missing override map', () => {
    expect(readAloudTranslationLocales(undefined)).toEqual([]);
  });
});

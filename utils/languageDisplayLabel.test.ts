import { describe, expect, it } from 'vitest';
import { languageDisplayLabel } from './languageDisplayLabel';

describe('languageDisplayLabel', () => {
  it('names each curated language in English for an English teacher', () => {
    expect(
      ['es', 'so', 'hmn', 'ru'].map((c) => languageDisplayLabel(c, 'en'))
    ).toEqual(['Spanish', 'Somali', 'Hmong', 'Russian']);
  });

  it('names a language in the teacher’s app language, capitalized', () => {
    expect(languageDisplayLabel('ru', 'es')).toBe('Ruso');
    expect(languageDisplayLabel('ru', 'fr')).toBe('Russe');
  });

  it('falls back to the raw tag for an unknown language', () => {
    expect(languageDisplayLabel('zz', 'en')).toBe('zz');
  });

  it('returns an empty tag unchanged', () => {
    expect(languageDisplayLabel('  ', 'en')).toBe('');
  });
});

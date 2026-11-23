import { describe, expect, it } from 'vitest';
import { QUIZ_TRANSLATION_ALL_CODES } from '@/config/quizTranslation';
import { ENGLISH_PRINT_WORDS, paperPrintWords } from './paperPrintWords';

describe('paperPrintWords', () => {
  it('lists resources in English by default', () => {
    expect(ENGLISH_PRINT_WORDS.useResources(['A'])).toBe('Use Resource A.');
    expect(ENGLISH_PRINT_WORDS.useResources(['A', 'B', 'C'])).toBe(
      'Use Resources A, B and C.'
    );
    expect(ENGLISH_PRINT_WORDS.useResources([])).toBe('');
  });

  it('prints Spanish for es and its regional tags', () => {
    for (const code of ['es', 'es-MX', 'ES']) {
      const w = paperPrintWords(code);
      expect(w.useResources(['A', 'B'])).toBe('Usa los recursos A y B.');
      expect(w.continued(w.resource('A'))).toBe('Recurso A (continuación)');
    }
  });

  it('uses e before I in Spanish and singular words for one Somali resource', () => {
    expect(paperPrintWords('es').useResources(['H', 'I'])).toBe(
      'Usa los recursos H e I.'
    );
    const so = paperPrintWords('so');
    expect(so.useResources(['A'])).toBe('Isticmaal Isha A.');
    expect(so.useResources(['A', 'B'])).toBe('Isticmaal Ilaha A iyo B.');
  });

  it('has its own words for every translation language', () => {
    for (const code of QUIZ_TRANSLATION_ALL_CODES) {
      const w = paperPrintWords(code);
      expect(w.writeOnSheet).not.toBe(ENGLISH_PRINT_WORDS.writeOnSheet);
      expect(w.resource('A')).not.toBe('Resource A');
    }
  });

  it('falls back to English for a language it does not know', () => {
    expect(paperPrintWords('xx').resource('B')).toBe('Resource B');
  });
});

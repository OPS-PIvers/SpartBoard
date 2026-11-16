import { describe, expect, it } from 'vitest';
import {
  expandAnswerRows,
  hasAnswerShorthand,
  joinAnswerRows,
  splitAnswerRows,
} from './flashcardAnswerRows';
import { matchFlashcardAnswer } from './flashcardMatch';

describe('flashcard answer rows', () => {
  it('spells out slash shorthand and semicolon lists', () => {
    expect(expandAnswerRows('el/la doctor/a; el/la médico/a', 'es')).toEqual([
      'el doctor',
      'la doctora',
      'el médico',
      'la médica',
    ]);
  });

  it('turns a spaced swap into whole phrases', () => {
    expect(expandAnswerRows('to start / begin', 'en-US')).toEqual([
      'to start',
      'to begin',
    ]);
  });

  it('keeps one-letter slash words like km/h whole', () => {
    expect(hasAnswerShorthand('km/h', 'en-US')).toBe(false);
    expect(hasAnswerShorthand('el/la doctor/a', 'es')).toBe(true);
    expect(expandAnswerRows('km/h', 'en-US')).toEqual(['km/h']);
  });

  it('keeps the full phrases of a spaced swap on a shared tail', () => {
    expect(expandAnswerRows('sacar una buena / mala nota', 'es')).toEqual([
      'sacar una buena nota',
      'sacar una mala nota',
    ]);
  });

  it('round-trips rows through the stored text that grading reads', () => {
    const rows = expandAnswerRows('el/la doctor/a; el/la médico/a', 'es');
    const stored = joinAnswerRows(rows);
    expect(splitAnswerRows(stored)).toEqual(rows);
    for (const row of rows) {
      expect(
        matchFlashcardAnswer(row, stored, { language: 'es', strict: true })
          .result
      ).toBe('exact');
    }
  });
});

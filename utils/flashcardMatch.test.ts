import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  flashcardEditDistance,
  matchFlashcardAnswer,
  parseFlashcardAnswerVariants,
  type FlashcardMatchKind,
} from './flashcardMatch';

interface MatchCase {
  name: string;
  response: string;
  expected: string;
  language: string;
  strict: boolean;
  result: FlashcardMatchKind;
}

const casesPath = resolve(
  process.cwd(),
  'functions',
  'src',
  'flashcardMatch.cases.json'
);
const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as MatchCase[];

describe('flashcard answer matcher', () => {
  it.each(cases)(
    '$name',
    ({ response, expected, language, strict, result }) => {
      expect(
        matchFlashcardAnswer(response, expected, { language, strict }).result
      ).toBe(result);
    }
  );

  it('expands spaced alternates and parentheticals without splitting km/h', () => {
    expect(parseFlashcardAnswerVariants('(se) levantar / alzarse')).toEqual([
      'se levantar',
      'levantar',
      'alzarse',
    ]);
    expect(parseFlashcardAnswerVariants('km/h')).toEqual(['km/h']);
  });

  it('returns a character diff for a miss', () => {
    const match = matchFlashcardAnswer('house', 'mouse', {
      language: 'en-US',
      strict: true,
    });
    expect(match.result).toBe('wrong');
    expect(match.diff.some((segment) => segment.type !== 'equal')).toBe(true);
  });

  it('counts adjacent transpositions as one edit', () => {
    expect(flashcardEditDistance('friend', 'frined')).toBe(1);
  });
});

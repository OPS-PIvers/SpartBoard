import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'flashcardMatch.cases.json'), 'utf8')
) as MatchCase[];

describe('flashcard answer matcher (server mirror)', () => {
  it.each(cases)(
    '$name',
    ({ response, expected, language, strict, result }) => {
      expect(
        matchFlashcardAnswer(response, expected, { language, strict }).result
      ).toBe(result);
    }
  );
});

describe('parseFlashcardAnswerVariants size', () => {
  it('bounds the variants for an answer with many optional groups', () => {
    const answer = Array.from({ length: 22 }, (_, i) => `(w${i})`).join(' ');
    const start = Date.now();
    const variants = parseFlashcardAnswerVariants(answer);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(variants.length).toBeLessThanOrEqual(64);
  });
});

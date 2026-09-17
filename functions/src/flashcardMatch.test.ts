import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchFlashcardAnswer,
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

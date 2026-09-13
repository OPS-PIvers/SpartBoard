import { describe, it, expect } from 'vitest';
import type { QuizQuestion } from '@/types';
import {
  serializeQuestionForHash,
  hashQuestionForTranslation,
} from './quizTranslationHash';
import fixture from '../tests/fixtures/quizTranslationHash.fixture.json';

interface FixtureCase {
  name: string;
  question: QuizQuestion;
  serialized: string;
  hash: string;
}
const cases = fixture as unknown as FixtureCase[];

describe('quizTranslationHash (client)', () => {
  it.each(cases.map((c) => [c.name, c] as const))(
    'matches the cross-runtime fixture: %s',
    async (_name, c) => {
      expect(serializeQuestionForHash(c.question)).toBe(c.serialized);
      await expect(hashQuestionForTranslation(c.question)).resolves.toBe(
        c.hash
      );
    }
  );

  it('reads stale when the key is swapped with a distractor (§9.1)', () => {
    const [original, swapped] = cases;
    expect(original.hash).not.toBe(swapped.hash);
  });

  it('collapses absent and empty optional fields to the same serialization', () => {
    const base: QuizQuestion = {
      id: 'q',
      timeLimit: 0,
      type: 'MC',
      text: 'T',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
    };
    expect(serializeQuestionForHash({ ...base, placeholder: '' })).toBe(
      serializeQuestionForHash(base)
    );
  });

  it('drops empty entries from the filtered arrays', () => {
    const base: QuizQuestion = {
      id: 'q',
      timeLimit: 0,
      type: 'MC',
      text: 'T',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
    };
    expect(
      serializeQuestionForHash({ ...base, incorrectAnswers: ['B', '', ''] })
    ).toBe(serializeQuestionForHash(base));
  });
});

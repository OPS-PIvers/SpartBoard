import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  serializeQuestionForHash,
  hashQuestionForTranslation,
  type HashableQuestion,
} from './quizTranslationHash';

interface FixtureCase {
  name: string;
  question: HashableQuestion;
  serialized: string;
  hash: string;
}

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../tests/fixtures/quizTranslationHash.fixture.json'),
    'utf8'
  )
) as FixtureCase[];

describe('quizTranslationHash (functions)', () => {
  it.each(fixture.map((c) => [c.name, c] as const))(
    'matches the cross-runtime fixture: %s',
    (_name, c) => {
      expect(serializeQuestionForHash(c.question)).toBe(c.serialized);
      expect(hashQuestionForTranslation(c.question)).toBe(c.hash);
    }
  );

  it('reads stale when the key is swapped with a distractor (§9.1)', () => {
    const [original, swapped] = fixture;
    expect(original.hash).not.toBe(swapped.hash);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasEmbeddedAnswerKey,
  toVideoActivityPublicQuestion,
  splitVideoActivitySessionQuestions,
  studentQuestionsFromSession,
} from '@/utils/videoActivityPublicQuestions';
import type { VideoActivityQuestion } from '@/types';

const q = (over: Partial<VideoActivityQuestion>): VideoActivityQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Capital?',
  type: 'MC',
  timestamp: 10,
  correctAnswer: 'Paris',
  incorrectAnswers: ['Rome', 'Oslo'],
  ...over,
});

describe('splitVideoActivitySessionQuestions', () => {
  it('keeps the key out of the session fields', () => {
    const questions = [
      q({}),
      q({
        id: 'q2',
        type: 'FIB',
        correctAnswer: 'blue',
        acceptableVariants: ['azure'],
        incorrectAnswers: [],
      }),
      q({
        id: 'q3',
        type: 'MA',
        correctAnswer: 'a|b',
        incorrectAnswers: ['c'],
      }),
    ];
    const { sessionFields, key } =
      splitVideoActivitySessionQuestions(questions);
    const serialized = JSON.stringify(sessionFields);
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('incorrectAnswers');
    expect(serialized).not.toContain('azure');
    expect(serialized).not.toContain('blue');
    expect(sessionFields.questions).toEqual([]);
    expect(key.questions).toEqual(questions);
    const [mc, fib, ma] = sessionFields.publicQuestions ?? [];
    expect([...(mc.options ?? [])].sort()).toEqual(['Oslo', 'Paris', 'Rome']);
    expect(fib.options).toBeUndefined();
    expect([...(ma.options ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('dedupes question ids in both halves', () => {
    const { sessionFields, key } = splitVideoActivitySessionQuestions([
      q({}),
      q({ text: 'duplicate' }),
    ]);
    expect(sessionFields.publicQuestions).toHaveLength(1);
    expect(key.questions).toHaveLength(1);
  });
});

describe('studentQuestionsFromSession', () => {
  it('prefers the public projection', () => {
    const publicQuestions = [
      { id: 'p', timestamp: 1, text: 't', type: 'MC' as const, options: ['x'] },
    ];
    expect(
      studentQuestionsFromSession({ questions: [], publicQuestions })
    ).toBe(publicQuestions);
  });

  it('projects a legacy keyed doc without passing the key through', () => {
    const [only] = studentQuestionsFromSession({ questions: [q({})] });
    expect(only).not.toHaveProperty('correctAnswer');
    expect([...(only.options ?? [])].sort()).toEqual(['Oslo', 'Paris', 'Rome']);
  });
});

describe('hasEmbeddedAnswerKey', () => {
  it('is true only for keyed questions', () => {
    expect(hasEmbeddedAnswerKey([q({ correctAnswer: '' })])).toBe(true);
    expect(hasEmbeddedAnswerKey([])).toBe(false);
    expect(hasEmbeddedAnswerKey(undefined)).toBe(false);
  });
});

// Same cases the server projection (functions/src/videoActivityGrade.ts) runs.
interface PublicCase {
  name: string;
  question: VideoActivityQuestion;
  expected: Record<string, unknown> & { options?: string[] };
}

const publicCases = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      'functions',
      'src',
      'videoActivityPublic.cases.json'
    ),
    'utf8'
  )
) as PublicCase[];

describe('toVideoActivityPublicQuestion shared cases', () => {
  it.each(publicCases)('$name', ({ question, expected }) => {
    const pub = toVideoActivityPublicQuestion(question);
    expect({ ...pub, options: pub.options && [...pub.options].sort() }).toEqual(
      { ...expected, options: expected.options }
    );
  });
});

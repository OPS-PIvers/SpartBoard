/**
 * The separate answer key file (D8). A key that quietly half-applied would be
 * worse than none: the teacher would assign a test whose key is wrong on the
 * questions the match missed, and find out from a student's marked paper.
 * So every mismatch is a note on the row it belongs to.
 */
import { describe, it, expect } from 'vitest';
import {
  keyFromLines,
  applyAnswerKey,
} from '@/utils/quizDocumentImport/keyFile';
import type {
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport/types';

const mc = (
  number: number,
  over: Partial<ExtractedQuestion> = {}
): ExtractedQuestion => ({
  number,
  text: `Question ${number}`,
  type: 'MC',
  options: [
    { letter: 'A', text: 'First' },
    { letter: 'B', text: 'Second' },
    { letter: 'C', text: 'Third' },
  ],
  correctAnswer: '',
  imageIds: [],
  warnings: [],
  ...over,
});

const quiz = (questions: ExtractedQuestion[]): ExtractedQuiz => ({
  title: 'Unit 3 Test',
  questions,
  images: [],
  warnings: [],
});

describe('keyFromLines', () => {
  it('reads a key written one entry per line', () => {
    const key = keyFromLines([
      { text: '1. B' },
      { text: '2. A' },
      { text: '3. C' },
    ]);
    expect([...key]).toEqual([
      [1, 'B'],
      [2, 'A'],
      [3, 'C'],
    ]);
  });

  it('reads a key written across one line', () => {
    const key = keyFromLines([{ text: '1. B 2. A 3. C' }]);
    expect(key.size).toBe(3);
    expect(key.get(2)).toBe('A');
  });

  it('accepts the punctuation teachers actually type', () => {
    const key = keyFromLines([
      { text: '1) b' },
      { text: '2-C' },
      { text: '3: a' },
    ]);
    expect([...key.values()]).toEqual(['B', 'C', 'A']);
  });

  it('ignores a heading and anything with words in it', () => {
    const key = keyFromLines([
      { text: 'Answer Key' },
      { text: '1. B' },
      { text: '2. Because the moon orbits the earth' },
    ]);
    expect([...key]).toEqual([[1, 'B']]);
  });

  it('keeps the first answer when a number is listed twice', () => {
    // A repeated block is likelier a header than a correction, and taking
    // the later one silently would be invisible to the teacher.
    const key = keyFromLines([{ text: '1. B' }, { text: '1. C' }]);
    expect(key.get(1)).toBe('B');
  });
});

describe('applyAnswerKey', () => {
  it('sets the answer to the choice the letter names', () => {
    const result = applyAnswerKey(quiz([mc(1)]), new Map([[1, 'B']]));
    expect(result.questions[0].correctAnswer).toBe('Second');
    expect(result.questions[0].warnings).toEqual([]);
  });

  it('leaves a question the key says nothing about alone', () => {
    const result = applyAnswerKey(quiz([mc(1), mc(2)]), new Map([[1, 'A']]));
    expect(result.questions[1].correctAnswer).toBe('');
  });

  it('notes a letter the question has no choice for', () => {
    const result = applyAnswerKey(quiz([mc(1)]), new Map([[1, 'D']]));
    expect(result.questions[0].correctAnswer).toBe('');
    expect(result.questions[0].warnings[0]).toContain('no choice D');
  });

  it('notes an answer for a question that is not in the test', () => {
    const result = applyAnswerKey(
      quiz([mc(1), mc(2)]),
      new Map([
        [1, 'A'],
        [14, 'C'],
      ])
    );
    expect(result.warnings[0]).toContain('question 14');
  });

  it('lists several missing questions in one note', () => {
    const result = applyAnswerKey(
      quiz([mc(1)]),
      new Map([
        [13, 'A'],
        [14, 'C'],
      ])
    );
    expect(result.warnings[0]).toContain('questions 13, 14');
  });

  it('prefers the key file over an answer read from the test, and says so', () => {
    const result = applyAnswerKey(
      quiz([mc(1, { correctAnswer: 'First' })]),
      new Map([[1, 'B']])
    );
    expect(result.questions[0].correctAnswer).toBe('Second');
    expect(result.questions[0].warnings[0]).toContain(
      'answered this differently'
    );
  });

  it('says nothing when the key file agrees with the test', () => {
    const result = applyAnswerKey(
      quiz([mc(1, { correctAnswer: 'Second' })]),
      new Map([[1, 'B']])
    );
    expect(result.questions[0].warnings).toEqual([]);
  });

  it('will not put a letter on a question that is not multiple choice', () => {
    const written = mc(1, { type: 'free-response', options: [] });
    const result = applyAnswerKey(quiz([written]), new Map([[1, 'B']]));
    expect(result.questions[0].correctAnswer).toBe('');
    expect(result.questions[0].warnings[0]).toContain('isn’t multiple choice');
  });

  it('is a no-op when no key file was attached', () => {
    const original = quiz([mc(1)]);
    expect(applyAnswerKey(original, new Map())).toBe(original);
  });
});

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

  it('ignores a heading, and takes a written answer only under one', () => {
    const headed = keyFromLines([
      { text: 'Answer Key' },
      { text: '1. B' },
      { text: '2. photosynthesis' },
    ]);
    expect([...headed]).toEqual([
      [1, 'B'],
      [2, 'photosynthesis'],
    ]);
    const bare = keyFromLines([
      { text: '1. B' },
      { text: '2. Because the moon orbits the earth' },
    ]);
    expect([...bare]).toEqual([[1, 'B']]);
  });

  it('reads a test-bank key file', () => {
    const key = keyFromLines([
      { text: 'Unit 3 Test' },
      { text: 'Answer Section' },
      { text: 'MULTIPLE CHOICE' },
      { text: '1. ANS: B PTS: 1' },
      { text: '2. ANS: D PTS: 1 DIF: Easy' },
    ]);
    expect([...key]).toEqual([
      [1, 'B'],
      [2, 'D'],
    ]);
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
    expect(result.questions[0].warnings[0]).toContain('no option D');
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
    expect(result.questions[0].warnings[0]).toBe(
      'Test file said A, key file said B — using B.'
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
    expect(result.questions[0].warnings[0]).toContain('probably missed');
    const matching = mc(1, { type: 'Matching', options: [] });
    const other = applyAnswerKey(quiz([matching]), new Map([[1, 'B']]));
    expect(other.questions[0].warnings[0]).toContain('isn’t multiple choice');
  });

  it('matches T and F to True and False choices', () => {
    const tf = (n: number) =>
      mc(n, {
        options: [
          { letter: 'A', text: 'True' },
          { letter: 'B', text: 'False' },
        ],
      });
    const result = applyAnswerKey(
      quiz([tf(1), tf(2)]),
      new Map([
        [1, 'F'],
        [2, 'T'],
      ])
    );
    expect(result.questions.map((q) => q.correctAnswer)).toEqual([
      'False',
      'True',
    ]);
  });

  it('puts a written answer on a fill-in-the-blank question', () => {
    const fib = mc(1, { type: 'FIB', options: [] });
    const result = applyAnswerKey(quiz([fib]), new Map([[1, 'mitochondria']]));
    expect(result.questions[0].correctAnswer).toBe('mitochondria');
  });

  it('turns a short-answer question into fill in the blank, and says so', () => {
    const written = mc(1, { type: 'free-response', options: [] });
    const result = applyAnswerKey(quiz([written]), new Map([[1, 'eyes']]));
    expect(result.questions[0].type).toBe('FIB');
    expect(result.questions[0].correctAnswer).toBe('eyes');
    expect(result.questions[0].warnings[0]).toContain('fill in the blank');
  });

  it('keeps an essay or a flagged question written, with the key as a note', () => {
    const essay = mc(1, { type: 'free-response', options: [] });
    const graph = mc(2, {
      type: 'free-response',
      options: [],
      warnings: ['Graphing question requiring a hand-drawn graph.'],
    });
    const result = applyAnswerKey(
      quiz([essay, graph]),
      new Map([
        [1, 'Answers will vary but should mention energy loss.'],
        [2, 'ii'],
      ])
    );
    expect(result.questions.map((q) => q.type)).toEqual([
      'free-response',
      'free-response',
    ]);
    expect(result.questions[1].warnings[1]).toContain('“ii”');
  });

  it('is a no-op when no key file was attached', () => {
    const original = quiz([mc(1)]);
    expect(applyAnswerKey(original, new Map())).toBe(original);
  });
});

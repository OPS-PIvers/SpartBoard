import { describe, expect, it } from 'vitest';
import { gradeAnswer, normalizeAnswer } from '@/hooks/useQuizSession';
import type { QuizQuestion } from '@/types';
import {
  encodeMultiAnswer,
  multiAnswerOptions,
  scoreMultiAnswer,
} from './quizMultiAnswer';

const question = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Which are mammals?',
  type: 'MA',
  correctAnswer: 'Dog|Whale|Bat',
  incorrectAnswers: ['Shark', 'Frog'],
  points: 3,
  ...overrides,
});

describe('scoreMultiAnswer', () => {
  const score = (answer: string) =>
    scoreMultiAnswer('A|B|C', ['D', 'E'], answer, normalizeAnswer);

  it('gives nothing for choosing every option', () => {
    expect(score('A|B|C|D|E').fraction).toBe(0);
  });

  it('gives right% when nothing wrong is chosen', () => {
    expect(score('A|B').fraction).toBeCloseTo(2 / 3);
  });

  it('subtracts wrong% for wrong picks', () => {
    expect(score('A|B|C|D').fraction).toBeCloseTo(0.5);
  });

  it('never goes below zero', () => {
    expect(score('A|D|E').fraction).toBe(0);
  });

  it('marks only the exact set as exact', () => {
    expect(score('C|A|B').exact).toBe(true);
    expect(score('A|B').exact).toBe(false);
  });

  it('ignores case, spacing and duplicate picks', () => {
    expect(score(' a | b|B|c ').exact).toBe(true);
  });

  it('counts an unknown option as wrong without exceeding the range', () => {
    const r = scoreMultiAnswer('A|B', [], 'A|B|Z', normalizeAnswer);
    expect(r.exact).toBe(false);
    expect(r.fraction).toBe(0);
  });

  it('scores a question with no key as zero', () => {
    expect(scoreMultiAnswer('', ['X'], 'X', normalizeAnswer).fraction).toBe(0);
  });
});

describe('gradeAnswer for choose-all-that-apply', () => {
  it('is all or nothing without partial credit', () => {
    expect(gradeAnswer(question(), 'Dog|Bat|Whale')).toMatchObject({
      isCorrect: true,
      pointsEarned: 3,
    });
    expect(gradeAnswer(question(), 'Dog|Bat').pointsEarned).toBe(0);
  });

  it('awards partial credit when enabled', () => {
    const q = question({ allowPartialCredit: true });
    expect(gradeAnswer(q, 'Dog|Bat').pointsEarned).toBeCloseTo(2);
    expect(gradeAnswer(q, 'Dog|Bat|Whale|Shark|Frog').pointsEarned).toBe(0);
    expect(gradeAnswer(q, 'Dog|Bat|Whale|Shark')).toMatchObject({
      isCorrect: false,
      pointsEarned: 1.5,
    });
  });

  it('treats a blank answer as not attempted', () => {
    expect(gradeAnswer(question(), '').state).toBe('not-attempted');
  });
});

describe('encodeMultiAnswer', () => {
  it('orders picks by the displayed order', () => {
    const shown = multiAnswerOptions(question());
    expect(encodeMultiAnswer(new Set(['Frog', 'Dog']), shown)).toBe('Dog|Frog');
  });
});

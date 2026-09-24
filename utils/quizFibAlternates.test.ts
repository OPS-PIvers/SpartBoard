import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '@/hooks/useQuizSession';
import type { QuizQuestion } from '@/types';
import {
  fibAlternateAnswers,
  formatRevealedAnswer,
  revealValueFor,
  splitRevealedAnswer,
} from './quizFibAlternates';

const fib = (alternateAnswers?: string[]): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'The sky is ___',
  type: 'FIB',
  correctAnswer: 'color',
  incorrectAnswers: [],
  alternateAnswers,
});

describe('FIB alternate answers', () => {
  it('grades an alternate as fully correct', () => {
    expect(gradeAnswer(fib(['colour']), ' Colour ')).toMatchObject({
      isCorrect: true,
      pointsEarned: 1,
    });
    expect(gradeAnswer(fib(['colour']), 'colr').isCorrect).toBe(false);
  });

  it('never matches a blank answer against a blank alternate', () => {
    expect(gradeAnswer(fib(['']), '').isCorrect).toBe(false);
  });

  it('drops blanks and repeats of the main answer', () => {
    expect(fibAlternateAnswers(fib(['', 'Color', 'colour', 'COLOUR']))).toEqual(
      ['colour']
    );
  });

  it('reveals the plain answer when there are no alternates', () => {
    expect(revealValueFor(fib())).toBe('color');
    expect(revealValueFor(fib(['  ']))).toBe('color');
  });

  it('reveals every accepted answer and formats them for display', () => {
    const revealed = revealValueFor(fib(['colour', 'hue']));
    expect(splitRevealedAnswer(revealed)).toEqual(['color', 'colour', 'hue']);
    expect(formatRevealedAnswer(revealed)).toBe(
      'color (also accepted: colour, hue)'
    );
    expect(formatRevealedAnswer('Paris')).toBe('Paris');
  });

  it('ignores alternates on other question types', () => {
    const mc = { ...fib(['x']), type: 'MC' as const };
    expect(revealValueFor(mc)).toBe('color');
  });
});

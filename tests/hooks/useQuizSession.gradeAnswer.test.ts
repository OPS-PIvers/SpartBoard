import { describe, it, expect } from 'vitest';
import { gradeAnswer } from '@/hooks/useQuizSession';
import type { QuizQuestion, WrittenAnswerGrade } from '@/types';

const q = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  text: 'Explain photosynthesis.',
  timeLimit: 0,
  type: 'essay',
  correctAnswer: '',
  incorrectAnswers: [],
  points: 10,
  ...overrides,
});

const grade = (
  overrides: Partial<WrittenAnswerGrade> = {}
): WrittenAnswerGrade => ({
  pointsAwarded: 0,
  gradedBy: 'teacher-uid',
  gradedAt: 0,
  ...overrides,
});

describe('gradeAnswer — written types', () => {
  it('returns ungraded (0 points, isCorrect=false) when no manual grade exists for an essay', () => {
    const result = gradeAnswer(q({ type: 'essay', points: 10 }), '<p>...</p>');
    expect(result).toEqual({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 10,
    });
  });

  it('returns ungraded when no manual grade exists for a short-answer', () => {
    const result = gradeAnswer(q({ type: 'short', points: 5 }), 'my answer');
    expect(result).toEqual({ isCorrect: false, pointsEarned: 0, pointsMax: 5 });
  });

  it('returns awarded points when a manual grade is supplied', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 10 }),
      '<p>...</p>',
      grade({ pointsAwarded: 7 })
    );
    expect(result.pointsEarned).toBe(7);
    expect(result.pointsMax).toBe(10);
  });

  it('flags isCorrect when awarded points equal max', () => {
    const result = gradeAnswer(
      q({ type: 'short', points: 4 }),
      'answer',
      grade({ pointsAwarded: 4 })
    );
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(4);
  });

  it('does NOT flag isCorrect when awarded < max', () => {
    const result = gradeAnswer(
      q({ type: 'short', points: 4 }),
      'answer',
      grade({ pointsAwarded: 3 })
    );
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(3);
  });

  it('clamps awarded points to question max', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 5 }),
      '<p>...</p>',
      grade({ pointsAwarded: 99 })
    );
    expect(result.pointsEarned).toBe(5);
    expect(result.pointsMax).toBe(5);
    expect(result.isCorrect).toBe(true);
  });

  it('clamps negative awarded points to zero', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 5 }),
      '<p>...</p>',
      grade({ pointsAwarded: -3 })
    );
    expect(result.pointsEarned).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('ignores manualGrade for auto-graded MC questions', () => {
    const result = gradeAnswer(
      q({ type: 'MC', correctAnswer: 'A', points: 2 }),
      'A',
      grade({ pointsAwarded: 0 })
    );
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
  });
});

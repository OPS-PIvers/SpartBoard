/**
 * The `needsKey` contract (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D5–D7): a
 * document import may create a question without an answer, and everything
 * downstream must agree on which questions those are.
 */
import { describe, it, expect } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import {
  clearSatisfiedNeedsKey,
  countQuestionsNeedingKey,
  flagMissingKeys,
  missingKeyNumbers,
  questionNeedsKey,
} from '@/utils/quizNeedsKey';

const question = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Which planet is closest to the sun?',
  type: 'MC',
  correctAnswer: 'Mercury',
  incorrectAnswers: ['Venus', 'Mars'],
  ...overrides,
});

const quiz = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz-1',
  title: 'Chapter 5',
  questions,
  createdAt: 1,
  updatedAt: 2,
});

describe('questionNeedsKey', () => {
  it('is false for an ordinary question with an answer', () => {
    expect(questionNeedsKey(question())).toBe(false);
  });

  it('is false for a keyless question nobody flagged', () => {
    expect(questionNeedsKey(question({ correctAnswer: '' }))).toBe(false);
  });

  it('is true for a flagged question with no answer', () => {
    expect(
      questionNeedsKey(question({ correctAnswer: '', needsKey: true }))
    ).toBe(true);
  });

  it('is false once an answer is typed in, flag or no flag', () => {
    expect(
      questionNeedsKey(question({ correctAnswer: 'Mercury', needsKey: true }))
    ).toBe(false);
  });

  it('treats whitespace as no answer', () => {
    expect(
      questionNeedsKey(question({ correctAnswer: '   ', needsKey: true }))
    ).toBe(true);
  });

  it('never flags free-response, which has no key by design', () => {
    expect(
      questionNeedsKey(
        question({ type: 'free-response', correctAnswer: '', needsKey: true })
      )
    ).toBe(false);
  });
});

describe('countQuestionsNeedingKey', () => {
  it('counts only the questions still missing an answer', () => {
    expect(
      countQuestionsNeedingKey([
        question({ id: 'a', correctAnswer: '', needsKey: true }),
        question({ id: 'b', correctAnswer: '', needsKey: true }),
        question({ id: 'c' }),
        question({ id: 'd', correctAnswer: 'Filled in', needsKey: true }),
      ])
    ).toBe(2);
  });

  it('is zero for a quiz nothing imported', () => {
    expect(countQuestionsNeedingKey([question(), question({ id: 'b' })])).toBe(
      0
    );
  });
});

describe('clearSatisfiedNeedsKey', () => {
  it('drops the flag from questions that now have an answer', () => {
    const result = clearSatisfiedNeedsKey(
      quiz([
        question({ id: 'a', correctAnswer: 'Mercury', needsKey: true }),
        question({ id: 'b', correctAnswer: '', needsKey: true }),
      ])
    );
    expect(result.questions[0].needsKey).toBeUndefined();
    expect(result.questions[1].needsKey).toBe(true);
  });

  it('returns the same object when nothing changed', () => {
    const original = quiz([question()]);
    expect(clearSatisfiedNeedsKey(original)).toBe(original);
  });
});

describe('flagMissingKeys', () => {
  it('flags keyless graded questions and leaves the rest alone', () => {
    const keyed = question();
    const written = question({
      id: 'q2',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
    });
    const blankMa = question({ id: 'q3', type: 'MA', correctAnswer: '' });
    const blankMc = question({ id: 'q4', correctAnswer: ' ' });
    const result = flagMissingKeys(quiz([keyed, written, blankMa, blankMc]));
    expect(result.questions.map((q) => q.needsKey)).toEqual([
      undefined,
      undefined,
      true,
      true,
    ]);
    expect(countQuestionsNeedingKey(result.questions)).toBe(2);
  });

  it('returns the same quiz when nothing is missing', () => {
    const q = quiz([question()]);
    expect(flagMissingKeys(q)).toBe(q);
  });

  it('numbers the keyless questions from 1', () => {
    expect(
      missingKeyNumbers([question(), question({ correctAnswer: '' })])
    ).toEqual([2]);
  });
});

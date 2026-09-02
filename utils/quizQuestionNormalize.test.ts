import { describe, expect, it } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import {
  normalizeLegacyQuestionType,
  normalizeQuizData,
  normalizeQuizQuestions,
} from './quizQuestionNormalize';

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id: 'q1',
    text: 'Explain.',
    type: 'free-response',
    correctAnswer: '',
    incorrectAnswers: [],
    ...over,
  }) as QuizQuestion;

const quiz = (questions: QuizQuestion[]): QuizData =>
  ({
    id: 'quiz-1',
    title: 'Quiz',
    questions,
  }) as unknown as QuizData;

describe('normalizeLegacyQuestionType', () => {
  it('maps legacy written types onto free-response', () => {
    expect(normalizeLegacyQuestionType('short')).toBe('free-response');
    expect(normalizeLegacyQuestionType('essay')).toBe('free-response');
  });

  it('passes current types through unchanged', () => {
    for (const t of ['MC', 'FIB', 'Matching', 'Ordering', 'free-response']) {
      expect(normalizeLegacyQuestionType(t)).toBe(t);
    }
  });

  it('returns unknown values as-is rather than guessing', () => {
    expect(normalizeLegacyQuestionType('MA')).toBe('MA');
    expect(normalizeLegacyQuestionType('')).toBe('');
  });
});

describe('normalizeQuizQuestions', () => {
  it('rewrites only the legacy entries', () => {
    const input = [
      question({ id: 'a', type: 'short' as QuizQuestion['type'] }),
      question({ id: 'b', type: 'MC' }),
      question({ id: 'c', type: 'essay' as QuizQuestion['type'] }),
    ];
    const out = normalizeQuizQuestions(input);
    expect(out.map((q) => q.type)).toEqual([
      'free-response',
      'MC',
      'free-response',
    ]);
  });

  it('preserves every other field on a rewritten question', () => {
    const input = [
      question({
        id: 'a',
        type: 'essay' as QuizQuestion['type'],
        points: 7,
        placeholder: 'Cite evidence',
      }),
    ];
    const out = normalizeQuizQuestions(input);
    expect(out[0]).toEqual({ ...input[0], type: 'free-response' });
  });

  it('returns the same array reference when nothing changed', () => {
    const input = [question({ type: 'MC' }), question({ type: 'FIB' })];
    expect(normalizeQuizQuestions(input)).toBe(input);
  });

  it('keeps untouched question object references when others change', () => {
    const keep = question({ id: 'b', type: 'MC' });
    const input = [
      question({ id: 'a', type: 'short' as QuizQuestion['type'] }),
      keep,
    ];
    const out = normalizeQuizQuestions(input);
    expect(out).not.toBe(input);
    expect(out[1]).toBe(keep);
  });

  it('tolerates a missing or non-array questions list', () => {
    expect(normalizeQuizQuestions(undefined)).toBeUndefined();
    expect(normalizeQuizQuestions(null)).toBeNull();
  });
});

describe('normalizeQuizData', () => {
  it('returns the same quiz reference when no question changed', () => {
    const input = quiz([question({ type: 'MC' })]);
    expect(normalizeQuizData(input)).toBe(input);
  });

  it('returns a new quiz with normalized questions when one changed', () => {
    const input = quiz([
      question({ type: 'short' as QuizQuestion['type'] }),
      question({ id: 'q2', type: 'MC' }),
    ]);
    const out = normalizeQuizData(input);
    expect(out).not.toBe(input);
    expect(out.questions.map((q) => q.type)).toEqual(['free-response', 'MC']);
    expect(out.title).toBe(input.title);
  });

  it('passes through a quiz with no questions array', () => {
    const input = { id: 'x', title: 'x' } as unknown as QuizData;
    expect(normalizeQuizData(input)).toBe(input);
  });
});

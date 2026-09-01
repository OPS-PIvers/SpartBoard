/**
 * Pins the shared override-editor question projection now that three hosts use
 * it (the in-app QuizManager assign modal, the Schoology deep-link picker and
 * the Google Classroom add-on). The load-bearing contract is the OPTION ID
 * FORMAT: `translateHiddenOptionIdsToText` must be able to resolve every id
 * this projection emits back to option text before anything is persisted to a
 * student-readable pointer doc.
 */

import { describe, it, expect } from 'vitest';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';
import type { QuizQuestion } from '@/types';

const mcQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Capital of France?',
  correctAnswer: 'Paris',
  incorrectAnswers: ['Lyon', 'Nice'],
  points: 1,
} as unknown as QuizQuestion;

const shortQuestion = {
  id: 'q2',
  type: 'SHORT_ANSWER',
  text: '',
  points: 2,
} as unknown as QuizQuestion;

describe('toOverrideEditorQuestions', () => {
  it('returns [] for missing or malformed content', () => {
    expect(toOverrideEditorQuestions(null)).toEqual([]);
    expect(toOverrideEditorQuestions(undefined)).toEqual([]);
    expect(
      toOverrideEditorQuestions({ questions: undefined as never })
    ).toEqual([]);
  });

  it('emits per-option ids for MC and none for other types', () => {
    const [mc, short] = toOverrideEditorQuestions({
      questions: [mcQuestion, shortQuestion],
    });
    expect(mc.options?.map((o) => o.id)).toEqual([
      'q1-correct',
      'q1-incorrect-0',
      'q1-incorrect-1',
    ]);
    expect(mc.options?.[0].isCorrect).toBe(true);
    expect(short.options).toBeUndefined();
  });

  it('falls back to a positional label when the question text is empty', () => {
    const [, short] = toOverrideEditorQuestions({
      questions: [mcQuestion, shortQuestion],
    });
    expect(short.label).toBe('Question 2');
  });

  it('produces ids that translateHiddenOptionIdsToText can resolve to text', () => {
    const [mc] = toOverrideEditorQuestions({ questions: [mcQuestion] });
    const hiddenId = mc.options?.[1].id ?? '';
    const result = translateHiddenOptionIdsToText([mcQuestion], {
      'classlink:s-1': { hiddenOptionIdsByQuestion: { q1: [hiddenId] } },
    });
    expect(result.warnings).toEqual([]);
    expect(
      result.overridesByKey['classlink:s-1'].hiddenOptionIdsByQuestion
    ).toEqual({ q1: ['Lyon'] });
  });
});

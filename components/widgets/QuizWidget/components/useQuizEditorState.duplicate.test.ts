import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQuizEditorState } from './useQuizEditorState';
import type { QuizData } from '@/types';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'a',
      timeLimit: 0,
      type: 'MC',
      text: 'First',
      correctAnswer: 'Yes',
      incorrectAnswers: ['No', 'Maybe'],
      sourceLabel: '2·3',
      stimulusIds: ['s1'],
      targets: [{ id: 't1', label: 'Standard 1', kind: 'standard' }],
    },
    {
      id: 'b',
      timeLimit: 0,
      type: 'FIB',
      text: 'Second',
      correctAnswer: 'x',
      incorrectAnswers: [],
    },
  ],
};

describe('useQuizEditorState duplicateQuestion', () => {
  it('inserts a deep copy with a fresh id right after the original and selects it', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    act(() => result.current.duplicateQuestion('a'));

    const { questions, order, selectedId } = result.current;
    expect(questions.map((q) => q.text)).toEqual(['First', 'First', 'Second']);
    const [orig, copy] = questions;
    expect(copy.id).not.toBe('a');
    expect(order.map((e) => e.id)).toEqual(['a', copy.id, 'b']);
    expect(selectedId).toBe(copy.id);
    expect(copy.incorrectAnswers).toEqual(orig.incorrectAnswers);
    expect(copy.incorrectAnswers).not.toBe(orig.incorrectAnswers);
    expect(copy.stimulusIds).toEqual(['s1']);
    expect(copy.targets).not.toBe(orig.targets);
    expect(copy.sourceLabel).toBeUndefined();

    act(() => result.current.updateIncorrect(copy.id, 0, 'Changed'));
    expect(result.current.questions[0].incorrectAnswers[0]).toBe('No');
  });
});

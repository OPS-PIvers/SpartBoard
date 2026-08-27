import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { QuizData, QuizStimulus } from '@/types';
import { useQuizEditorState } from '@/components/widgets/QuizWidget/components/useQuizEditorState';

const stim = (id: string): QuizStimulus => ({
  id,
  type: 'image',
  url: `https://example.com/${id}.png`,
  label: id,
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Stimuli quiz',
  questions: [
    {
      id: 'q1',
      timeLimit: 0,
      text: 'One',
      type: 'MC',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      stimulusIds: ['s1'],
    },
    {
      id: 'q2',
      timeLimit: 0,
      text: 'Two',
      type: 'FIB',
      correctAnswer: 'x',
      incorrectAnswers: [],
    },
  ],
  stimuli: [stim('s1'), stim('s2')],
  createdAt: 1,
  updatedAt: 1,
};

describe('useQuizEditorState stimuli actions', () => {
  it('seeds stimuli from the quiz and toggles per-question attachment', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    expect(result.current.stimuli.map((s) => s.id)).toEqual(['s1', 's2']);

    act(() => result.current.toggleStimulusOnQuestion('s2', 'q2'));
    expect(result.current.questions[1].stimulusIds).toEqual(['s2']);

    act(() => result.current.toggleStimulusOnQuestion('s2', 'q2'));
    expect(result.current.questions[1].stimulusIds).toBeUndefined();
  });

  it('attaches to / detaches from all questions', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    act(() => result.current.setStimulusOnAllQuestions('s2', true));
    expect(
      result.current.questions.every((q) => q.stimulusIds?.includes('s2'))
    ).toBe(true);

    act(() => result.current.setStimulusOnAllQuestions('s2', false));
    expect(
      result.current.questions.some((q) => q.stimulusIds?.includes('s2'))
    ).toBe(false);
  });

  it('deleteStimulus removes the entry AND strips its pointers', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    act(() => result.current.deleteStimulus('s1'));
    expect(result.current.stimuli.map((s) => s.id)).toEqual(['s2']);
    expect(result.current.questions[0].stimulusIds).toBeUndefined();
  });

  it('updateStimulus edits label/playLimit in place', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    act(() =>
      result.current.updateStimulus('s1', { label: 'renamed', playLimit: 3 })
    );
    const updated = result.current.stimuli.find((s) => s.id === 's1');
    expect(updated?.label).toBe('renamed');
    expect(updated?.playLimit).toBe(3);
  });
});

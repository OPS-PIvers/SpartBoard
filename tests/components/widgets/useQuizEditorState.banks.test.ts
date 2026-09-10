import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type {
  QuizBankSlot,
  QuizData,
  QuizQuestion,
  QuizStimulus,
} from '@/types';
import { useQuizEditorState } from '@/components/widgets/QuizWidget/components/useQuizEditorState';

const question = (
  id: string,
  extra: Partial<QuizQuestion> = {}
): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: id,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  ...extra,
});

const stim = (id: string): QuizStimulus => ({
  id,
  type: 'image',
  url: `https://example.com/${id}.png`,
  label: id,
});

const slot = (id: string): QuizBankSlot => ({
  id,
  bankId: 'bank-1',
  bankTitle: 'Bank one',
  mode: 'random',
  count: 3,
  points: 2,
});

const plainQuiz: QuizData = {
  id: 'quiz-1',
  title: 'Plain',
  questions: [question('q1'), question('q2')],
  createdAt: 1,
  updatedAt: 1,
};

const slottedQuiz: QuizData = {
  ...plainQuiz,
  id: 'quiz-2',
  bankSlots: [slot('s1')],
  order: [
    { kind: 'question', id: 'q1' },
    { kind: 'slot', id: 's1' },
    { kind: 'question', id: 'q2' },
  ],
};

const rows = (r: { current: { order: { kind: string; id: string }[] } }) =>
  r.current.order.map((e) => `${e.kind}:${e.id}`);

describe('useQuizEditorState bank slots and order', () => {
  it('seeds order from quizOrder and appends new questions as question rows', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    expect(rows(result)).toEqual(['question:q1', 'slot:s1', 'question:q2']);
    expect(result.current.originalOrder).toEqual(slottedQuiz.order);
    expect(result.current.originalBankSlots).toEqual(slottedQuiz.bankSlots);

    act(() => result.current.addQuestion());
    const added = result.current.questions[2].id;
    expect(rows(result)).toEqual([
      'question:q1',
      'slot:s1',
      'question:q2',
      `question:${added}`,
    ]);
    expect(result.current.selectedId).toBe(added);
  });

  it('addBankSlot appends a slot row, selects it and exposes selectedSlot', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: plainQuiz })
    );
    expect(result.current.selectedSlot).toBeNull();

    act(() => result.current.addBankSlot(slot('new-slot')));
    expect(result.current.bankSlots).toHaveLength(1);
    expect(rows(result)).toEqual([
      'question:q1',
      'question:q2',
      'slot:new-slot',
    ]);
    expect(result.current.selectedId).toBe('new-slot');
    expect(result.current.selectedSlot?.id).toBe('new-slot');
    expect(result.current.selectedQuestion).toBeNull();
  });

  it('updateBankSlot patches fields and drops keys set to undefined', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() =>
      result.current.updateBankSlot('s1', { count: 5, targetFilter: ['t1'] })
    );
    expect(result.current.bankSlots[0]).toMatchObject({
      count: 5,
      targetFilter: ['t1'],
    });
    act(() => result.current.updateBankSlot('s1', { targetFilter: undefined }));
    expect('targetFilter' in result.current.bankSlots[0]).toBe(false);
  });

  it('removeBankSlot drops the slot and its row and advances the selection', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() => result.current.setSelectedId('s1'));
    act(() => result.current.removeBankSlot('s1'));
    expect(result.current.bankSlots).toEqual([]);
    expect(rows(result)).toEqual(['question:q1', 'question:q2']);
    expect(result.current.selectedId).toBe('q2');
  });

  it('deleteQuestion and deleteChecked keep order consistent', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() => result.current.deleteQuestion('q1'));
    expect(rows(result)).toEqual(['slot:s1', 'question:q2']);
    expect(result.current.selectedId).toBe('s1');

    act(() => result.current.toggleChecked('q2'));
    act(() => result.current.deleteChecked());
    expect(rows(result)).toEqual(['slot:s1']);
    expect(result.current.questions).toEqual([]);
  });

  it('reorderEntries moves rows and keeps questions in row order', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() =>
      result.current.reorderEntries([
        { kind: 'slot', id: 's1' },
        { kind: 'question', id: 'q2' },
        { kind: 'question', id: 'q1' },
      ])
    );
    expect(rows(result)).toEqual(['slot:s1', 'question:q2', 'question:q1']);
    expect(result.current.questions.map((q) => q.id)).toEqual(['q2', 'q1']);
  });

  it('reorderQuestions keeps slot rows in place', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() =>
      result.current.reorderQuestions([question('q2'), question('q1')])
    );
    expect(rows(result)).toEqual(['question:q2', 'slot:s1', 'question:q1']);
  });

  it('insertQuestions appends copies and merges stimuli by id', () => {
    const withStim: QuizData = {
      ...plainQuiz,
      questions: [question('q1', { stimulusIds: ['s-old'] })],
      stimuli: [stim('s-old')],
    };
    const { result } = renderHook(() => useQuizEditorState({ quiz: withStim }));
    act(() =>
      result.current.insertQuestions(
        [
          question('c1', { stimulusIds: ['s-new'] }),
          question('c2', { stimulusIds: ['s-old'] }),
        ],
        [stim('s-new'), stim('s-old')]
      )
    );
    expect(result.current.questions.map((q) => q.id)).toEqual([
      'q1',
      'c1',
      'c2',
    ]);
    expect(rows(result)).toEqual(['question:q1', 'question:c1', 'question:c2']);
    expect(result.current.stimuli.map((s) => s.id)).toEqual(['s-old', 's-new']);
    expect(result.current.selectedId).toBe('c1');
  });

  it('shift-range checking follows row order and skips slot rows', () => {
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: slottedQuiz })
    );
    act(() => result.current.toggleChecked('q1'));
    act(() => result.current.toggleChecked('q2', true));
    expect([...result.current.checkedIds].sort()).toEqual(['q1', 'q2']);
  });
});

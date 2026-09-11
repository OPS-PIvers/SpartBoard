import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { QuizQuestion } from '@/types';
import { BankPickerModal } from '@/components/widgets/QuizWidget/components/BankPickerModal';
import type { QuizEditorBankApi } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import type { BankSource } from '@/hooks/useBankSources';

const question = (
  id: string,
  targets?: QuizQuestion['targets']
): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  ...(targets ? { targets } : {}),
});

const tag = {
  id: 't1',
  kind: 'personal' as const,
  label: 'Fractions',
  code: 'F1',
};

const source: BankSource = {
  key: 'bank-1',
  kind: 'personal',
  bankId: 'bank-1',
  title: 'Fractions bank',
  questionCount: 3,
  targetIds: ['t1'],
  targetCounts: { t1: 1 },
};

const loadBankContent = vi.fn<QuizEditorBankApi['loadBankContent']>();

const makeApi = (): QuizEditorBankApi => {
  loadBankContent.mockResolvedValue({
    id: 'bank-1',
    title: 'Fractions bank',
    questions: [question('b1', [tag]), question('b2'), question('b3')],
  });
  return { sources: [source], loadBankContent, appendQuestionsToBank: vi.fn() };
};

describe('BankPickerModal random mode', () => {
  it('blocks Add when the draw exceeds the eligible count and emits a slot otherwise', async () => {
    const api = makeApi();
    const onAddSlot = vi.fn();
    render(
      <BankPickerModal
        bankApi={api}
        onClose={vi.fn()}
        onInsertQuestions={vi.fn()}
        onAddSlot={onAddSlot}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /fractions bank/i }));
    await waitFor(() => expect(loadBankContent).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /random draw/i }));

    const count = await screen.findByLabelText('Questions per attempt');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Draws 3 of 3 eligible'
    );
    const add = screen.getByRole('button', { name: /add random draw/i });
    expect(add).toBeEnabled();

    fireEvent.change(count, { target: { value: '4' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Draws 4 of 3 eligible'
    );
    expect(add).toBeDisabled();

    // Narrow by target: only one question carries t1.
    fireEvent.change(count, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /F1/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Draws 1 of 1 eligible'
    );

    fireEvent.click(add);
    expect(onAddSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        bankId: 'bank-1',
        bankTitle: 'Fractions bank',
        mode: 'random',
        count: 1,
        targetFilter: ['t1'],
        points: 1,
      })
    );
  });

  it('pick mode copies the checked questions with fresh ids', async () => {
    const api = makeApi();
    const onInsert = vi.fn<(q: QuizQuestion[]) => void>();
    render(
      <BankPickerModal
        bankApi={api}
        onClose={vi.fn()}
        onInsertQuestions={onInsert}
        onAddSlot={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /fractions bank/i }));
    const boxes = await screen.findAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /add 1 question/i }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    const copies = onInsert.mock.calls[0][0];
    expect(copies).toHaveLength(1);
    expect(copies[0].text).toBe('Question b2');
    expect(copies[0].id).not.toBe('b2');
  });
});

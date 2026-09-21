import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperPrintModal } from '@/components/widgets/QuizWidget/components/PaperPrintModal';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import type { PaperTestJob } from '@/utils/paperTestPrint';

const mc = (id: string, distractors = 3): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: Array.from({ length: distractors }, (_, i) => `d${i}`),
});

const quiz = (over: Partial<QuizData> = {}): QuizData => ({
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions: [mc('q1'), mc('q2')],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: 'file-1',
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Sam', lastName: 'Alvarez', pin: '01' },
    { id: 's2', firstName: 'Jo', lastName: 'Baker', pin: '02' },
  ],
};

const setup = (
  over: Partial<React.ComponentProps<typeof PaperPrintModal>> = {}
) => {
  const onSaveBatch = vi
    .fn<(batch: PaperBatch) => Promise<void>>()
    .mockResolvedValue(undefined);
  const print = vi.fn();
  const onClose = vi.fn();
  const onError = vi.fn();
  render(
    <PaperPrintModal
      quiz={quiz()}
      rosters={[roster]}
      onSaveBatch={onSaveBatch}
      onClose={onClose}
      onError={onError}
      print={print as never}
      {...over}
    />
  );
  return { onSaveBatch, print, onClose, onError };
};

const selectWholeClass = () =>
  fireEvent.click(screen.getByLabelText('Period 1', { selector: 'input' }));

describe('PaperPrintModal', () => {
  it('cannot print until somebody is getting a sheet', () => {
    setup({ quiz: quiz(), rosters: [{ ...roster, students: [] }] });
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    expect(screen.getByText(/Pick at least one student/i)).toBeInTheDocument();
  });

  it('counts sheets and pages for the chosen students plus spares', () => {
    setup();
    selectWholeClass();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '3' },
    });
    expect(screen.getByText(/5 sheets · 5 pages/)).toBeInTheDocument();
  });

  it('saves the batch before printing, so no sheet exists without its record', async () => {
    const order: string[] = [];
    const onSaveBatch = vi.fn(() => {
      order.push('save');
      return Promise.resolve();
    });
    const print = vi.fn(() => {
      order.push('print');
    });
    setup({ onSaveBatch, print: print as never });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(order).toEqual(['save', 'print']);
  });

  it('never prints when the batch could not be saved', async () => {
    const onSaveBatch = vi.fn().mockRejectedValue(new Error('offline'));
    const { print, onError, onClose } = setup({ onSaveBatch });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    expect(print).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('records each printed seat against its roster', async () => {
    const { onSaveBatch, print } = setup();
    selectWholeClass();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.quizId).toBe('quiz-1');
    expect(batch.questionCount).toBe(2);
    expect(Object.values(batch.seats)).toEqual([
      { rosterId: 'r1', studentId: 's1' },
      { rosterId: 'r1', studentId: 's2' },
    ]);
  });

  it('records the printed choice order and offers the matching test paper next', async () => {
    const printTest = vi.fn<(job: PaperTestJob) => void>();
    const { onSaveBatch, print, onClose } = setup({ printTest });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect([...(batch.choiceOrder?.q1 ?? [])].sort()).toEqual([
      'a',
      'd0',
      'd1',
      'd2',
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Response sheets sent to print/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Print test paper/ }));
    expect(printTest).toHaveBeenCalledOnce();
    const job = printTest.mock.calls[0][0];
    expect(job.quizTitle).toBe('Unit 3 Test');
    expect(job.questions.map((q) => q.row)).toEqual([1, 2]);
    expect(job.questions[0].choices).toEqual(batch.choiceOrder?.q1);
    expect(job.questions[1].choices).toEqual(batch.choiceOrder?.q2);

    fireEvent.click(screen.getByRole('button', { name: /^Done$/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('surfaces a blocked pop-up on the test paper without losing the batch', async () => {
    const printTest = vi.fn(() => {
      throw new Error('Printing blocked: please allow pop-ups for this site.');
    });
    const { print, onError } = setup({ printTest });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Print test paper/ }));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/pop-ups/));
    expect(
      screen.getByRole('button', { name: /Print test paper/ })
    ).toBeInTheDocument();
  });

  it('warns about questions that cannot be bubbled', () => {
    setup({
      quiz: quiz({
        questions: [
          mc('q1'),
          { ...mc('q2'), type: 'free-response', text: 'Explain' },
        ],
      }),
    });
    expect(
      screen.getByText(/1 question will not be on the sheet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Free response: Explain/)).toBeInTheDocument();
  });

  it('locks an authored quiz to the bubble count its questions need', () => {
    setup({ quiz: quiz({ questions: [mc('q1', 1), mc('q2', 4)] }) });
    expect(screen.getByText('5 (A–E)')).toBeInTheDocument();
    expect(
      screen.getByText(/Question 1 has fewer choices/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lets a new paper test choose its own length and creates the stub on print', async () => {
    const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
    const { print, onSaveBatch } = setup({
      quiz: quiz({ title: '', questions: [] }),
      onCreateQuiz,
    });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Pop quiz' },
    });
    fireEvent.change(screen.getByLabelText('Questions'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText(/Choices per question/i), {
      target: { value: '2' },
    });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));

    await waitFor(() => expect(print).toHaveBeenCalled());
    const created = onCreateQuiz.mock.calls[0][0] as QuizData;
    expect(created.title).toBe('Pop quiz');
    expect(created.questions).toHaveLength(30);
    expect(created.questions[0].incorrectAnswers).toEqual(['B']);
    expect(onSaveBatch.mock.calls[0][0].choiceCount).toBe(2);
    // The stub must exist before the batch that points at it.
    expect(onCreateQuiz).toHaveBeenCalledBefore(onSaveBatch);
  });

  it('defaults the answer key sheet on for a new paper test and off otherwise', () => {
    const { unmount } = render(
      <PaperPrintModal
        quiz={quiz({ questions: [] })}
        rosters={[roster]}
        onSaveBatch={vi.fn()}
        onClose={vi.fn()}
        onError={vi.fn()}
        print={vi.fn() as never}
      />
    );
    expect(screen.getByLabelText('Include an answer key sheet')).toBeChecked();
    unmount();

    setup();
    expect(
      screen.getByLabelText('Include an answer key sheet')
    ).not.toBeChecked();
  });
});

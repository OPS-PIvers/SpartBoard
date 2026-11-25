import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
}));
vi.mock('@/hooks/usePaperSheetStimulusImages', () => ({
  usePaperSheetStimulusImages: () => ({ src: {}, failed: [], loading: false }),
}));

import { PaperReprintModal } from '@/components/widgets/QuizWidget/components/PaperReprintModal';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import type { PaperPrintJob } from '@/utils/paperSheetPrint';

const mc = (id: string): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b', 'c', 'd'],
});

const QUIZ: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions: [mc('q1'), mc('q2')],
  createdAt: 0,
  updatedAt: 0,
};

const ROSTER: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Sam', lastName: 'Alvarez', pin: '01' },
    { id: 's2', firstName: 'Jo', lastName: 'Baker', pin: '02' },
  ],
};

const BATCH: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: 2,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [3],
  choiceOrder: { q1: ['a', 'b', 'c', 'd'], q2: ['d', 'c', 'b', 'a'] },
  pagesPerSheet: 1,
  createdAt: 0,
};

const setup = (quiz = QUIZ, batch = BATCH) => {
  const print = vi.fn<(job: PaperPrintJob) => void>();
  const onClose = vi.fn();
  render(
    <PaperReprintModal
      quiz={quiz}
      batch={batch}
      rosters={[ROSTER]}
      onClose={onClose}
      onError={vi.fn()}
      print={print}
    />
  );
  return { print, onClose };
};

describe('PaperReprintModal', () => {
  it('prints only the picked students, on their original seats', () => {
    const { print, onClose } = setup();
    const button = screen.getByRole('button', { name: /^Print$/ });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    fireEvent.click(button);
    const job = print.mock.calls[0][0];
    expect(job.batchId).toBe('batch-1');
    expect(job.sheets.map((s) => [s.seat, s.displayName])).toEqual([
      [2, 'Baker, Jo'],
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open until the print window has its images', () => {
    const { print, onClose } = setup({
      ...QUIZ,
      paperSheetStimuli: [
        {
          id: 'st1',
          label: 'Map',
          source: 'image',
          driveFileId: 'file-1',
          widthPx: 100,
          heightPx: 100,
        },
      ],
    });
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    expect(onClose).not.toHaveBeenCalled();
    print.mock.calls[0][0].onImagesReady?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('reprints a question-text sheet with its stimuli', async () => {
    const { print } = setup(
      {
        ...QUIZ,
        questions: [{ ...mc('q1'), stimulusIds: ['x'] }, mc('q2')],
        stimuli: [
          {
            id: 'x',
            type: 'text',
            url: '',
            label: '',
            text: 'The cell is small.',
          },
        ],
      },
      { ...BATCH, sheetLayout: 'questions' }
    );
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    const button = screen.getByRole('button', { name: /^Print$/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const texts = print.mock.calls[0][0].questionTexts ?? [];
    expect(texts[0]?.stimulus?.html).toContain('The cell is small.');
    expect(texts[1]?.stimulus).toBeUndefined();
  });

  it('refuses when the quiz changed since the sheets printed', () => {
    const { print } = setup({ ...QUIZ, questions: [mc('q1'), mc('q3')] });
    expect(
      screen.getByText(/changed after these sheets printed/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Baker, Jo')).toBeNull();
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    expect(print).not.toHaveBeenCalled();
  });
});

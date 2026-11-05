import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

const setup = (quiz = QUIZ) => {
  const print = vi.fn<(job: PaperPrintJob) => void>();
  const onClose = vi.fn();
  render(
    <PaperReprintModal
      quiz={quiz}
      batch={BATCH}
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

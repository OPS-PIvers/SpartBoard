import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type { QuizData, QuizResponse } from '@/types';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
    },
  ],
};

const responseWith = (dictated?: string[]): QuizResponse => ({
  studentUid: 'uid-a',
  _responseKey: 'uid-a',
  pin: '1234',
  answers: [
    { questionId: 'q1', answer: '<p>one two three</p>', answeredAt: 0 },
  ],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
  ...(dictated ? { dictated } : {}),
});

const renderGrader = (response: QuizResponse) =>
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={[response]}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />
  );

describe('FreeResponseGrader: dictated answers', () => {
  it('marks an answer the student dictated, in a neutral colour', () => {
    renderGrader(responseWith(['q1']));
    const chip = screen.getByText('Dictated');
    expect(chip.className).toContain('slate');
    expect(chip.className).not.toMatch(/amber|red|rose/);
  });

  it('shows no chip on a typed answer or another question', () => {
    const { unmount } = renderGrader(responseWith());
    expect(screen.queryByText('Dictated')).toBeNull();
    unmount();
    renderGrader(responseWith(['q9']));
    expect(screen.queryByText('Dictated')).toBeNull();
  });
});

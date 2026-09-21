import React from 'react';
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

const question = (id: string, text: string) => ({
  id,
  type: 'free-response' as const,
  text,
  timeLimit: 0,
  correctAnswer: '',
  incorrectAnswers: [],
  points: 10,
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    question('q1', 'First prompt.'),
    question('q2', 'Second prompt.'),
  ],
};

const responseFor = (studentUid: string): QuizResponse => ({
  studentUid,
  _responseKey: studentUid,
  answers: [
    { questionId: 'q1', answer: '<p>one</p>', answeredAt: 0 },
    { questionId: 'q2', answer: '<p>two</p>', answeredAt: 1 },
  ],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
});

const names = new Map([
  ['a', 'Ada'],
  ['b', 'Grace'],
  ['c', 'Katherine'],
]);

const renderGrader = (
  extra: Partial<React.ComponentProps<typeof FreeResponseGrader>>
) =>
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={[responseFor('a'), responseFor('b'), responseFor('c')]}
      displayNameByResponseKey={names}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      autoAdvance={false}
      {...extra}
    />
  );

describe('FreeResponseGrader — initial target', () => {
  it.each(['question', 'student'] as const)(
    'opens on the requested student and question in %s mode',
    (graderMode) => {
      renderGrader({
        graderMode,
        initialTarget: { questionId: 'q2', responseKey: 'b' },
      });
      expect(screen.getByText('Question 2 of 2')).toBeTruthy();
      expect(screen.getByText('Grace', { selector: 'h3' })).toBeTruthy();
    }
  );

  it('falls back to the first target when the student is not in the queue', () => {
    renderGrader({
      graderMode: 'question',
      initialTarget: { questionId: 'q2', responseKey: 'nobody' },
    });
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('Ada', { selector: 'h3' })).toBeTruthy();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type { QuizData, QuizResponse, WrittenAnswerGrade } from '@/types';

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

const responseFor = (
  studentUid: string,
  grading?: Record<string, WrittenAnswerGrade>
): QuizResponse => ({
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
  ...(grading ? { grading } : {}),
});

const names = new Map([
  ['a', 'Ada'],
  ['b', 'Grace'],
]);

const renderGrader = (
  extra: Partial<React.ComponentProps<typeof FreeResponseGrader>> = {},
  responses = [responseFor('a'), responseFor('b')]
) => {
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={responses}
      displayNameByResponseKey={names}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      autoAdvance={false}
      {...extra}
    />
  );
};

const rail = () =>
  screen.getByRole('navigation', { name: /students on this question/i });

describe('FreeResponseGrader — By-Student mode', () => {
  it('walks every question for one student before the next student', () => {
    renderGrader({ graderMode: 'student' });
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('Ada', { selector: 'h3' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
    expect(screen.getByText('Grace', { selector: 'h3' })).toBeTruthy();
  });

  it('keeps the student rail and adds a question stepper', () => {
    renderGrader({ graderMode: 'student' });
    const rail = screen.getByRole('navigation', {
      name: /students on this question/i,
    });
    expect(within(rail).getByText('Ada')).toBeTruthy();
    expect(within(rail).getByText('Grace')).toBeTruthy();
    const stepper = screen.getByRole('group', { name: /^Question$/ });
    expect(within(stepper).getByText('Q1 of 2')).toBeTruthy();
    fireEvent.click(
      within(stepper).getByRole('button', { name: /next question/i })
    );
    expect(within(stepper).getByText('Q2 of 2')).toBeTruthy();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
  });

  it('steps students from the rail without leaving the question', () => {
    renderGrader({ graderMode: 'student' });
    fireEvent.click(
      within(rail()).getByRole('button', { name: /next student/i })
    );
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
  });

  it('follows the mode for the j / k keys', () => {
    renderGrader({ graderMode: 'student' });
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
  });

  it('switches mode from the header and reports the preference', () => {
    const onGraderModeChange = vi.fn();
    renderGrader({ onGraderModeChange });
    const group = screen.getByRole('group', { name: /Grade by/i });
    fireEvent.click(within(group).getByRole('button', { name: /^Student$/ }));
    expect(onGraderModeChange).toHaveBeenCalledWith('student');
    expect(screen.getByRole('group', { name: /^Question$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
  });

  it('skips graded targets on Next but still reaches them from the rail', () => {
    const done: WrittenAnswerGrade = {
      pointsAwarded: 8,
      gradedBy: 'teacher-1',
      gradedAt: 1,
    };
    renderGrader({ graderMode: 'question' }, [
      responseFor('a'),
      responseFor('b', { q1: done }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    // Grace's q1 is graded, so Next lands on Ada's q2.
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('Ada', { selector: 'h3' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /previous question/i }));
    fireEvent.click(within(rail()).getByText('Grace'));
    expect(screen.getByText('Grace', { selector: 'h3' })).toBeTruthy();
    expect(screen.getByLabelText(/Points awarded/i)).toHaveValue(8);
  });
});

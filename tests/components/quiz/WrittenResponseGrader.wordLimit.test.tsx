import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { WrittenResponseGrader } from '@/components/widgets/QuizWidget/components/WrittenResponseGrader';
import type { QuizData, QuizResponse, QuizQuestion } from '@/types';

const quizWith = (limits: Partial<QuizQuestion>): QuizData => ({
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'essay',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
      ...limits,
    },
  ],
});

const responseWith = (
  answer: string,
  timedOutUnderMinimum?: true
): QuizResponse => ({
  studentUid: 'uid-a',
  _responseKey: 'uid-a',
  pin: '1234',
  answers: [
    {
      questionId: 'q1',
      answer,
      answeredAt: 0,
      ...(timedOutUnderMinimum ? { timedOutUnderMinimum } : {}),
    },
  ],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
});

const renderGrader = (quiz: QuizData, response: QuizResponse) =>
  render(
    <WrittenResponseGrader
      quiz={quiz}
      responses={[response]}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />
  );

describe('WrittenResponseGrader — word count', () => {
  it('shows a bare word count when the question has no bounds', () => {
    renderGrader(quizWith({}), responseWith('<p>one two three</p>'));
    expect(screen.getByText('3 words')).toBeInTheDocument();
  });

  it('shows the range and marks it amber below the minimum', () => {
    renderGrader(
      quizWith({ minWords: 100, maxWords: 200 }),
      responseWith('<p>one two three</p>')
    );
    const el = screen.getByText('3 / 100–200 words');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('amber');
  });

  it('leaves the count neutral inside the range', () => {
    renderGrader(
      quizWith({ minWords: 1, maxWords: 200 }),
      responseWith('<p>one two three</p>')
    );
    expect(screen.getByText('3 / 1–200 words').className).not.toContain(
      'amber'
    );
  });

  it('renders the timed-out chip only when the answer carries the flag', () => {
    const { unmount } = renderGrader(
      quizWith({ minWords: 100, enforceWordLimit: true }),
      responseWith('<p>one two three</p>', true)
    );
    expect(screen.getByText('Timed out under minimum')).toBeInTheDocument();
    unmount();

    renderGrader(
      quizWith({ minWords: 100, enforceWordLimit: true }),
      responseWith('<p>one two three</p>')
    );
    expect(screen.queryByText('Timed out under minimum')).toBeNull();
  });
});

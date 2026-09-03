import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type { QuizData, QuizResponse, QuizStimulus } from '@/types';

const IMAGE: QuizStimulus = {
  id: 'stim-1',
  type: 'image',
  url: 'https://example.com/diagram.png',
  label: 'Diagram',
};

const quizWith = (stimulusIds?: string[]): QuizData => ({
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  stimuli: [IMAGE],
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Describe the diagram.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
      ...(stimulusIds ? { stimulusIds } : {}),
    },
  ],
});

const response: QuizResponse = {
  studentUid: 'uid-a',
  _responseKey: 'uid-a',
  pin: '1234',
  answers: [
    { questionId: 'q1', answer: '<p>It shows a cell.</p>', answeredAt: 0 },
  ],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
};

const renderGrader = (quiz: QuizData) =>
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={[response]}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />
  );

describe('FreeResponseGrader — attached stimuli', () => {
  it('renders a collapsed attachments toggle when the question has stimuli', () => {
    renderGrader(quizWith(['stim-1']));
    const toggle = screen.getByRole('button', { name: /1 attachment/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Question stimulus')).toBeNull();
  });

  it('renders no stimuli UI when the question has none', () => {
    renderGrader(quizWith());
    expect(screen.queryByRole('button', { name: /attachment/ })).toBeNull();
    expect(screen.queryByAltText('Question stimulus')).toBeNull();
  });

  it('expands on click and shows the stimulus', () => {
    renderGrader(quizWith(['stim-1']));
    fireEvent.click(screen.getByRole('button', { name: /1 attachment/ }));
    const img = screen.getByAltText('Question stimulus');
    expect(img).toHaveAttribute('src', IMAGE.url);
  });
});

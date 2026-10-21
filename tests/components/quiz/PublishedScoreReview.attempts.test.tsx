import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizResponse, QuizSession } from '@/types';

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: { currentUser: null },
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

import { PublishedScoreReview } from '@/components/quiz/QuizStudentApp';
import {
  MyQuizAttemptsLoaderContext,
  type MyQuizAttemptsLoader,
} from '@/hooks/useQuizResponseAttempts';

const session = {
  id: 'session-1',
  quizTitle: 'Fractions',
  teacherUid: 't1',
  status: 'ended',
  sessionMode: 'student',
  publicQuestions: [
    { id: 'q1', type: 'MC', text: 'Pick A', choices: ['A', 'B'], timeLimit: 0 },
  ],
} as unknown as QuizSession;

const live = (completedAttempts: number) =>
  ({
    _responseKey: 'student-1',
    studentUid: 'student-1',
    status: 'completed',
    completedAttempts,
    score: 100,
    answers: [
      { questionId: 'q1', answer: 'A', answeredAt: 0, isCorrect: true },
    ],
  }) as unknown as QuizResponse & { _responseKey: string };

const renderReview = (loader: MyQuizAttemptsLoader, attempts: number) =>
  render(
    <MyQuizAttemptsLoaderContext.Provider value={loader}>
      <PublishedScoreReview
        session={session}
        myResponse={live(attempts)}
        visibility="score-and-responses"
        pin=""
      />
    </MyQuizAttemptsLoaderContext.Provider>
  );

describe('PublishedScoreReview attempt picker', () => {
  it('switches to an earlier attempt', async () => {
    const loader = vi.fn<MyQuizAttemptsLoader>(() =>
      Promise.resolve({
        attempts: [
          {
            n: 1,
            submittedAt: 1,
            score: 0,
            answers: [{ questionId: 'q1', answer: 'B', isCorrect: false }],
          },
        ],
      })
    );
    renderReview(loader, 2);
    const first = await screen.findByRole('button', { name: '1 · 0%' });
    expect(screen.getByRole('button', { name: '2 · 100%' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith({
      sessionId: 'session-1',
      responseKey: 'student-1',
    });
  });

  it('does not ask for attempts after a single attempt', () => {
    const loader = vi.fn<MyQuizAttemptsLoader>();
    renderReview(loader, 1);
    expect(loader).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Attempt' })).toBeNull();
  });
});

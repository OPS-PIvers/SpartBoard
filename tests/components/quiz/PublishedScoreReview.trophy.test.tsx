import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

const makeSession = (extra: Partial<QuizSession>) =>
  ({
    id: 'session-1',
    quizTitle: 'Fractions',
    teacherUid: 't1',
    status: 'ended',
    sessionMode: 'student',
    publicQuestions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Pick A',
        choices: ['A', 'B'],
        timeLimit: 0,
      },
    ],
    ...extra,
  }) as unknown as QuizSession;

const response = {
  _responseKey: 'student-1',
  studentUid: 'student-1',
  status: 'completed',
  completedAttempts: 1,
  score: 100,
  answers: [{ questionId: 'q1', answer: 'A', answeredAt: 0, isCorrect: true }],
} as unknown as QuizResponse & { _responseKey: string };

const renderFor = (session: QuizSession) =>
  render(
    <PublishedScoreReview
      session={session}
      myResponse={response}
      visibility="score-only"
      pin=""
    />
  );

describe('PublishedScoreReview header icon', () => {
  it('shows no trophy on a Quiz assessment', () => {
    const { container } = renderFor(makeSession({ widgetKind: 'quiz' }));
    expect(container.querySelector('.lucide-trophy')).toBeNull();
  });

  it('keeps the trophy on a Review game', () => {
    const { container } = renderFor(makeSession({ widgetKind: 'review' }));
    expect(container.querySelector('.lucide-trophy')).not.toBeNull();
  });

  it('treats an untagged teacher-paced session as a Review game', () => {
    const { container } = renderFor(makeSession({ sessionMode: 'teacher' }));
    expect(container.querySelector('.lucide-trophy')).not.toBeNull();
  });
});

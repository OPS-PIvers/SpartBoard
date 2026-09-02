import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    ensureGoogleScope: vi.fn(),
    user: { uid: 'user-1' },
    orgId: null,
    isExternalUser: false,
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

// An auto-graded MC whose recording block only ever holds an addendum.
const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Mixed quiz',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Pick the right one, then say why.',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 2,
      recording: RECORDING,
    },
  ],
} as unknown as QuizData;

const response = (grading?: QuizResponse['grading']): QuizResponse =>
  ({
    studentUid: 'uid-1',
    _responseKey: 'uid-1',
    pin: '1111',
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
    answers: [
      {
        questionId: 'q1',
        answer: 'a',
        answeredAt: 100,
        artifacts: [
          {
            id: 'art-1',
            slot: 'addendum',
            kind: 'audio',
            uploadState: 'uploaded',
            durationMs: 8000,
          },
        ],
      },
    ],
    ...(grading ? { grading } : {}),
  }) as unknown as QuizResponse;

const openQuestions = (responses: QuizResponse[]) => {
  render(
    <QuizResults
      quiz={quiz}
      responses={responses}
      config={{ view: 'results' } as unknown as QuizConfig}
      onBack={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText('Question results'));
};

describe('QuizResults — per-slot question stats', () => {
  it('keeps the auto-graded percentage visible while the addendum awaits grading', () => {
    openQuestions([response()]);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText(/^1 Correct$/)).toBeTruthy();
    expect(screen.getByText(/^0 Graded$/)).toBeTruthy();
    expect(screen.getByText(/^1 Ungraded$/)).toBeTruthy();
  });

  it('counts the addendum as graded once its slot carries a grade', () => {
    openQuestions([
      response({
        'q1::addendum': { pointsAwarded: 1, gradedBy: 't1', gradedAt: 1 },
      }),
    ]);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText(/^1 Graded$/)).toBeTruthy();
    expect(screen.getByText(/^0 Ungraded$/)).toBeTruthy();
  });
});

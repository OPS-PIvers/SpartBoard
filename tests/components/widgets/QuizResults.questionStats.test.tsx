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

// A legacy MC quiz (no `recording` block) with a race-duplicated answer.
const legacyQuiz: QuizData = {
  id: 'quiz-2',
  title: 'Legacy quiz',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Pick one.',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
  ],
} as unknown as QuizData;

const legacyResponse: QuizResponse = {
  studentUid: 'uid-2',
  _responseKey: 'uid-2',
  pin: '2222',
  status: 'completed',
  submittedAt: 200,
  tabSwitchWarnings: 0,
  answers: [
    { questionId: 'q1', answer: 'b', answeredAt: 50 },
    { questionId: 'q1', answer: 'a', answeredAt: 100 },
  ],
} as unknown as QuizResponse;

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

  // Canonical rule (selectRepresentativeAnswers, tie on absent takeIndex):
  // earliest answeredAt wins, so the representative is the 'b' entry — the
  // wrong choice for this quiz's correctAnswer 'a'. Stats must show that
  // same result, matching whatever getEarnedPoints scores for this response.
  it('picks the earliest-answeredAt entry as representative on a tie, matching getEarnedPoints (0 Correct / 1 Missed)', () => {
    render(
      <QuizResults
        quiz={legacyQuiz}
        responses={[legacyResponse]}
        config={{ view: 'results' } as unknown as QuizConfig}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Question results'));
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText(/^0 Correct$/)).toBeTruthy();
    expect(screen.getByText(/^1 Missed$/)).toBeTruthy();
  });
});

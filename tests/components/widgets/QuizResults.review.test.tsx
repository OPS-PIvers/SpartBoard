import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    user: { uid: 'teacher-1', email: 'teacher@orono.k12.mn.us' },
    orgId: null,
    // The grade-push button is additionally gated on the admin-managed
    // `google-classroom` feature doc; default-allow in this suite.
    canAccessFeature: () => true,
  }),
}));
// Auto-confirm the "Push grades?" dialog so the handler proceeds.
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
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
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = vi.fn();
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return { ...actual, QuizDriveService: MockQuizDriveService };
});

// The two seams under test: the GIS token popup and the CF callable wrapper.
const mockToken = vi.fn();
vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  requestClassroomTeacherToken: (...args: unknown[]): Promise<string> =>
    mockToken(...args) as Promise<string>,
}));
const mockPush = vi.fn();
vi.mock('@/utils/classroomGradePush', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/classroomGradePush')>();
  return {
    ...actual,
    pushClassroomGradesForAssignment: (...args: unknown[]): Promise<unknown> =>
      mockPush(...args) as Promise<unknown>,
  };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Cells review',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Q1',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'q2',
      type: 'MC',
      text: 'Q2',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const gameState = (points: number, firstTry: Record<string, boolean>) => ({
  points,
  streak: 0,
  answered: 5,
  correct: 3,
  firstTry,
  lastCorrect: firstTry,
  last: null,
});

// Still in progress: the game clock ran out without the teacher pressing End.
const responses = [
  {
    studentUid: 'uid-a',
    pin: '1111',
    answers: [
      { questionId: 'q1', answer: 'b', answeredAt: 1, isCorrect: false },
      { questionId: 'q2', answer: 'b', answeredAt: 2, isCorrect: false },
    ],
    status: 'in-progress',
    game: gameState(7.5, { q1: false, q2: false }),
  },
  {
    studentUid: 'uid-b',
    pin: '2222',
    answers: [
      { questionId: 'q1', answer: 'a', answeredAt: 1, isCorrect: true },
      { questionId: 'q2', answer: 'a', answeredAt: 2, isCorrect: true },
    ],
    status: 'completed',
    game: gameState(12.25, { q1: true, q2: true }),
  },
] as unknown as QuizResponse[];

const gameSession = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  sessionMode: 'game',
  widgetKind: 'review',
  classIds: [],
  classroomAttachment: {
    courseId: 'C1',
    itemId: 'I1',
    attachmentId: 'ATT1',
    maxPoints: 2,
  },
} as unknown as QuizSession;

const config = { view: 'results' } as unknown as QuizConfig;

describe('QuizResults, Review variant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows first-try accuracy and the final ranking by game points', () => {
    render(
      <QuizResults
        quiz={quiz}
        responses={responses}
        config={config}
        onBack={vi.fn()}
        session={gameSession}
        variant="review"
      />
    );
    expect(screen.getByText('First-try accuracy')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('2 students played')).toBeInTheDocument();
    const rows = within(
      screen.getByRole('list', { name: 'Final ranking' })
    ).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      '1PIN 22221,225 pts',
      '2PIN 1111750 pts',
    ]);
    expect(screen.getByText('First-try results')).toBeInTheDocument();
  });

  it('hides grade push, grading and the score distribution', () => {
    render(
      <QuizResults
        quiz={quiz}
        responses={responses}
        config={config}
        onBack={vi.fn()}
        session={gameSession}
        variant="review"
      />
    );
    expect(screen.queryByRole('button', { name: /push grades/i })).toBeNull();
    expect(screen.queryByText(/score distribution/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /print results/i })).toBeNull();
  });

  it('lists students with points and their first-try tally', () => {
    render(
      <QuizResults
        quiz={quiz}
        responses={responses}
        config={config}
        onBack={vi.fn()}
        session={gameSession}
        variant="review"
      />
    );
    fireEvent.click(screen.getByText('Students'));
    expect(screen.getByText('2/2 first try')).toBeInTheDocument();
    expect(screen.getByText(/0\/2 first try/)).toBeInTheDocument();
  });

  it('keeps the Quiz variant unchanged', () => {
    render(
      <QuizResults
        quiz={quiz}
        responses={responses}
        config={config}
        onBack={vi.fn()}
        session={{ ...gameSession, sessionMode: 'student' } as QuizSession}
      />
    );
    expect(screen.getByText('Class average')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /push grades/i })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Final ranking' })).toBeNull();
  });
});

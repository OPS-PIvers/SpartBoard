/**
 * Mid-attempt window close (M17 §3a-D): when `session.closeAt` passes while
 * a student has an attempt open, the client auto-submits what's answered
 * with a brief non-blocking notice — never a silent rules rejection.
 * Comparisons use the server-offset clock (`utils/serverTime.getServerNow`),
 * mocked here so the test controls "now" directly.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const {
  mockAuth,
  mockJoinQuizSession,
  mockLookupSession,
  mockSubmitAnswer,
  mockCompleteQuiz,
  hookState,
  mockGetServerNow,
} = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  const state: {
    session: import('@/types').QuizSession | null;
    myResponse: import('@/types').QuizResponse | null;
  } = {
    session: null,
    myResponse: null,
  };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    mockLookupSession: vi.fn(),
    mockSubmitAnswer: vi.fn(),
    mockCompleteQuiz: vi.fn(),
    hookState: state,
    mockGetServerNow: vi.fn(() => Date.now()),
  };
});

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: mockAuth,
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => mockGetServerNow(),
  syncServerTime: vi.fn(),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: mockLookupSession,
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: mockSubmitAnswer,
    completeQuiz: mockCompleteQuiz,
    reportTabSwitch: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

function mintUser(): {
  uid: string;
  isAnonymous: boolean;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
} {
  return {
    uid: 'sso-uid-1',
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/quiz${search}`);
}

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 0,
    choices: ['3', '4'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    choices: ['Paris', 'London'],
  },
];

function buildSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 'session-1',
    assignmentId: 'asn-1',
    quizId: 'quiz-1',
    quizTitle: 'Test quiz',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: Date.now(),
    endedAt: null,
    code: 'ABC123',
    totalQuestions: QUESTIONS.length,
    publicQuestions: QUESTIONS,
    ...overrides,
  };
}

function buildResponse(overrides: Partial<QuizResponse> = {}): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  mockAuth.currentUser = mintUser();
  mockJoinQuizSession.mockResolvedValue('session-1');
  mockGetServerNow.mockImplementation(() => Date.now());
  mockCompleteQuiz.mockResolvedValue(undefined);
  setSearch('?code=ABC123');
});

describe('QuizStudentApp — mid-attempt window close', () => {
  it('auto-submits and shows a non-blocking notice once closeAt passes', async () => {
    hookState.session = buildSession({ closeAt: Date.now() - 5_000 });
    mockGetServerNow.mockImplementation(() => Date.now());

    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockCompleteQuiz).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(/window closed.*submitted automatically/i)
    ).toBeInTheDocument();
  });

  it('does not auto-submit while closeAt is in the future', async () => {
    hookState.session = buildSession({ closeAt: Date.now() + 60_000 });

    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/window closed.*submitted automatically/i)
    ).not.toBeInTheDocument();
  });

  it('does not re-trigger once the response is already completed', async () => {
    hookState.session = buildSession({ closeAt: Date.now() - 5_000 });
    hookState.myResponse = buildResponse({ status: 'completed' });

    render(<QuizStudentApp />);

    // Completed status short-circuits ActiveQuiz to a different screen, but
    // regardless of which screen renders, completeQuiz must not be called
    // again for an already-completed response.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });
});

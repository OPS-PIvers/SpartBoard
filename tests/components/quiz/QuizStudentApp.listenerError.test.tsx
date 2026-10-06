// A response listener that fails after join must show its error, not spin on "Loading your quiz…".
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse } from '@/types';

const { mockAuth, hookState, mockJoin } = vi.hoisted(() => ({
  mockJoin: vi.fn(),
  mockAuth: {
    onAuthStateChanged: vi.fn(),
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: null as unknown,
  },
  hookState: {
    session: null as QuizSession | null,
    myResponse: null as QuizResponse | null,
    error: null as string | null,
  },
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));

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

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn().mockResolvedValue({}),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('@/hooks/useQuizSession', () => {
  class MockSessionEndedError extends Error {}
  class MockAttemptLimitReachedError extends Error {}
  return {
    useQuizSessionStudent: () => ({
      session: hookState.session,
      myResponse: hookState.myResponse,
      loading: false,
      error: hookState.error,
      sessionIdRef: { current: 'session-1' },
      lookupSession: vi.fn().mockResolvedValue(null),
      joinQuizSession: mockJoin,
      subscribeForReview: vi.fn(),
      submitAnswer: vi.fn(),
      completeQuiz: vi.fn(),
      reportTabSwitch: vi.fn(),
      setServedQuestionIds: vi.fn(),
      warningCount: 0,
      periodKeys: [],
      contentPending: false,
    }),
    normalizeAnswer: (s: string) => s,
    SessionEndedError: MockSessionEndedError,
    AttemptLimitReachedError: MockAttemptLimitReachedError,
  };
});

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

function buildSession(): QuizSession {
  return {
    id: 'session-1',
    assignmentId: 'asn-1',
    quizId: 'quiz-1',
    quizTitle: 'Vocab quiz',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: Date.now(),
    endedAt: null,
    code: 'ABC123',
    totalQuestions: 1,
    publicQuestions: [
      { id: 'q1', type: 'MC', text: 'Pick one', timeLimit: 0, choices: ['a'] },
    ],
  } as QuizSession;
}

describe('QuizStudentApp — listener error after join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoin.mockResolvedValue('session-1');
    hookState.session = buildSession();
    hookState.myResponse = null;
    hookState.error = null;
    mockAuth.currentUser = {
      uid: 'sso-uid',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { studentRole: true } }),
    };
    window.history.replaceState({}, '', '/quiz?code=ABC123');
  });

  it('shows the listener error instead of the loader', async () => {
    hookState.error = 'Lost permission to read your answers. Ask your teacher.';
    render(<QuizStudentApp />);
    await waitFor(() => expect(mockJoin).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(
      screen.getByText(/Lost permission to read your answers/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Loading your quiz/)).not.toBeInTheDocument();
  });

  it('keeps the loader while the response is still arriving', async () => {
    render(<QuizStudentApp />);
    expect(await screen.findByText(/Loading your quiz/)).toBeInTheDocument();
  });
});

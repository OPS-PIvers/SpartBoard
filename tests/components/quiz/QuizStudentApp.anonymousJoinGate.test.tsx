/** PIN joiners see a sign-in message instead of the code/PIN form when the session is stamped closed. */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockJoinQuizSession, mockLookupSession, mockSsoGate } =
  vi.hoisted(() => ({
    mockSsoGate: { value: false },
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: { uid: 'anon-uid', isAnonymous: true } as unknown,
    },
    mockJoinQuizSession: vi.fn(),
    mockLookupSession: vi.fn(),
  }));

vi.mock('@/utils/studentJoinRouting', () => ({
  shouldGateToSso: () => mockSsoGate.value,
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

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 0),
  getDoc: vi.fn(),
}));

vi.mock('@/hooks/useQuizSession', () => {
  class MockSessionEndedError extends Error {}
  class MockAttemptLimitReachedError extends Error {}
  return {
    useQuizSessionStudent: () => ({
      session: null,
      myResponse: null,
      loading: false,
      error: null,
      sessionIdRef: { current: null },
      lookupSession: mockLookupSession,
      joinQuizSession: mockJoinQuizSession,
      subscribeForReview: vi.fn(),
      submitAnswer: vi.fn(),
      completeQuiz: vi.fn(),
      reportTabSwitch: vi.fn(),
      setServedQuestionIds: vi.fn(),
      warningCount: 0,
    }),
    normalizeAnswer: (s: string) => s,
    SessionEndedError: MockSessionEndedError,
    AttemptLimitReachedError: MockAttemptLimitReachedError,
  };
});

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const lookup = (anonymousJoinBlocked: boolean) => ({
  periodNames: [],
  classIds: [],
  sessionId: 'assign-1',
  anonymousJoinBlocked,
});

describe('QuizStudentApp — anonymous join gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSsoGate.value = false;
  });

  it('keeps sign-in available on a rostered session closed to PIN joins', async () => {
    window.history.replaceState({}, '', '/quiz?code=ABC123');
    mockSsoGate.value = true;
    mockLookupSession.mockResolvedValue(lookup(true));
    render(<QuizStudentApp />);
    expect(
      (await screen.findAllByRole('button', { name: /sign in/i })).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Sign in to join this activity.')).toBeNull();
  });

  it('hides the PIN form for a URL code whose session is closed to PIN joins', async () => {
    window.history.replaceState({}, '', '/quiz?code=ABC123');
    mockLookupSession.mockResolvedValue(lookup(true));
    render(<QuizStudentApp />);
    expect(
      await screen.findByText('Sign in to join this activity.')
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your PIN')).toBeNull();
  });

  it('shows the PIN form for an open session', async () => {
    window.history.replaceState({}, '', '/quiz?code=ABC123');
    mockLookupSession.mockResolvedValue(lookup(false));
    render(<QuizStudentApp />);
    expect(await screen.findByPlaceholderText('Your PIN')).toBeInTheDocument();
  });

  it('blocks a typed code without joining', async () => {
    window.history.replaceState({}, '', '/join');
    mockLookupSession.mockResolvedValue(lookup(true));
    render(<QuizStudentApp />);
    fireEvent.change(await screen.findByPlaceholderText('Quiz Code (XXXXXX)'), {
      target: { value: 'ABC123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your PIN'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(
      await screen.findByText('Sign in to join this activity.')
    ).toBeInTheDocument();
    expect(mockJoinQuizSession).not.toHaveBeenCalled();
  });
});

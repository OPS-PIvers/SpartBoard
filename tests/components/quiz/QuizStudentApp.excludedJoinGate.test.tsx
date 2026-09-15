/**
 * An SSO student the teacher skipped must never reach `joinQuizSession` —
 * a response doc created before the pointer resolves is a skipped student
 * enrolled in the assignment anyway.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockJoinQuizSession, mockLookupSession, mockGetDoc } =
  vi.hoisted(() => ({
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as unknown,
    },
    mockJoinQuizSession: vi.fn(),
    mockLookupSession: vi.fn(),
    mockGetDoc: vi.fn(),
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
  getDoc: mockGetDoc,
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

function mintUser(uid: string) {
  return {
    uid,
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
}

describe('QuizStudentApp — excluded student join gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoinQuizSession.mockResolvedValue('session-1');
    mockLookupSession.mockResolvedValue({
      periodNames: [],
      classIds: [],
      sessionId: 'assign-1',
    });
    mockAuth.currentUser = mintUser('sso-uid');
    window.history.replaceState({}, '', '/quiz?code=ABC123');
  });

  it('never joins when the pointer marks the student excluded', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ excluded: true }),
    });

    render(<QuizStudentApp />);

    expect(await screen.findByText(/not for you/i)).toBeInTheDocument();
    expect(mockJoinQuizSession).not.toHaveBeenCalled();
  });

  it('joins normally when no exclusion marker exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    render(<QuizStudentApp />);

    await waitFor(() => {
      expect(mockJoinQuizSession).toHaveBeenCalledWith(
        'ABC123',
        undefined,
        undefined
      );
    });
  });
});

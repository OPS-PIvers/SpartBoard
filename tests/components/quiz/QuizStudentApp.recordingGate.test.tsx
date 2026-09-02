/**
 * The media gate reaches `/quiz` — a route with no AuthProvider — only as
 * `session.mediaResponseEnabled`. A question that still carries a `recording`
 * block on a session without the marker must fall back to its ordinary
 * answer UI rather than mounting capture.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const { mockAuth, hookState } = vi.hoisted(() => ({
  mockAuth: {
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: {
      uid: 'sso-uid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { studentRole: true } }),
    } as unknown,
  },
  hookState: {
    session: null as QuizSession | null,
    myResponse: null as QuizResponse | null,
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

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: vi.fn(),
    joinQuizSession: vi.fn().mockResolvedValue('session-1'),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    commitRecordingTake: vi.fn().mockResolvedValue(1),
    setArtifactUploadState: vi.fn().mockResolvedValue(undefined),
    markUnresponded: vi.fn().mockResolvedValue(undefined),
    acknowledgeRecordingNotice: vi.fn().mockResolvedValue(undefined),
    completeQuiz: vi.fn().mockResolvedValue(undefined),
    reportTabSwitch: vi.fn(),
    setHandRaised: vi.fn(),
    recordStimulusPlay: vi.fn(),
    reportStimulusError: vi.fn(),
    setServedQuestionIds: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const RECORDING_QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Say it out loud',
  timeLimit: 0,
  choices: ['Alpha', 'Bravo'],
  recording: {
    prepSeconds: 30,
    limitSeconds: 60,
    prepExpiry: 'armed',
    takeLimit: null,
  },
};

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
    totalQuestions: 1,
    publicQuestions: [RECORDING_QUESTION],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.myResponse = {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
  };
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

describe('QuizStudentApp — recording gate', () => {
  it('renders the ordinary answer UI when the session carries no marker', async () => {
    hookState.session = buildSession();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Say it out loud/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByText(/Before you record/i)).not.toBeInTheDocument();
  });

  it('mounts capture when the session carries the marker', async () => {
    hookState.session = buildSession({ mediaResponseEnabled: true });
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Before you record/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Alpha' })
    ).not.toBeInTheDocument();
  });
});

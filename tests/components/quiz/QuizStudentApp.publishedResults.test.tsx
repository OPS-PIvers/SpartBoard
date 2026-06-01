/**
 * Coverage for the "published results on a still-active session" gate in
 * QuizStudentApp (QuizJoinFlow). A Google Classroom attachment runs self-paced,
 * so the session never transitions to 'ended' — without this gate a completed
 * student is stranded on the "waiting for the teacher to end the quiz" screen
 * and can never see a score the teacher already published.
 *
 * The gate (paraphrased): when status==='active' && myResponse is completed (or
 * at the attempt cap), render PublishedScoreReview iff the teacher has published
 * (scoreVisibility !== 'none') AND the response is actually completed; otherwise
 * fall back to QuizSubmittedWaitScreen.
 *
 * Discriminators: PublishedScoreReview renders <h1>Your Results</h1>;
 * QuizSubmittedWaitScreen renders <h1>Quiz Submitted!</h1>.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const { mockAuth, mockJoinQuizSession, hookState } = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    displayName: string | null;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    hookState: {
      session: null as QuizSession | null,
      myResponse: null as QuizResponse | null,
    },
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

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    lookupSession: vi.fn(),
    joinQuizSession: mockJoinQuizSession,
    subscribeForReview: vi.fn(),
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const QUESTIONS: QuizPublicQuestion[] = [
  { id: 'q1', type: 'MC', text: '2 + 2?', timeLimit: 0, choices: ['3', '4'] },
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
    startedAt: 1,
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
    joinedAt: 1,
    status: 'completed',
    answers: [],
    score: 80,
    submittedAt: 2,
    completedAttempts: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = {
    uid: 'sso-uid-1',
    isAnonymous: false,
    displayName: 'Test Student',
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
  mockJoinQuizSession.mockResolvedValue('session-1');
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

describe('QuizStudentApp — published results on an active (self-paced) session', () => {
  it('shows the results review to a completed student once scores are published', async () => {
    hookState.session = buildSession({ scoreVisibility: 'score-only' });
    hookState.myResponse = buildResponse({ status: 'completed' });

    render(<QuizStudentApp />);

    expect(await screen.findByText('Your Results')).toBeInTheDocument();
    expect(screen.queryByText('Quiz Submitted!')).not.toBeInTheDocument();
  });

  it('keeps a completed student on the submitted-wait screen until scores are published', async () => {
    // scoreVisibility absent (defaults to 'none') → not yet published.
    hookState.session = buildSession();
    hookState.myResponse = buildResponse({ status: 'completed' });

    render(<QuizStudentApp />);

    expect(await screen.findByText('Quiz Submitted!')).toBeInTheDocument();
    expect(screen.queryByText('Your Results')).not.toBeInTheDocument();
  });

  it('does NOT show results for an at-cap response that is not actually completed (even if published)', async () => {
    // atCap (1/1 attempts) but the response status is still 'joined' — the gate
    // must require status==='completed' to reveal the published review.
    hookState.session = buildSession({
      scoreVisibility: 'score-only',
      attemptLimit: 1,
    });
    hookState.myResponse = buildResponse({
      status: 'joined',
      completedAttempts: 1,
    });

    render(<QuizStudentApp />);

    expect(await screen.findByText('Quiz Submitted!')).toBeInTheDocument();
    expect(screen.queryByText('Your Results')).not.toBeInTheDocument();
  });
});

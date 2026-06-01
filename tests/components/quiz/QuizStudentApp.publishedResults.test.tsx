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

const {
  mockAuth,
  mockJoinQuizSession,
  mockSubscribeForReview,
  hookState,
  SessionEndedError,
  AttemptLimitReachedError,
} = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    displayName: string | null;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  // Real-ish sentinel classes so QuizStudentApp's `err instanceof …` branch
  // in the SSO auto-join catch can discriminate (the mock module below would
  // otherwise leave these `undefined`, throwing on `instanceof`).
  class SessionEndedError extends Error {
    constructor() {
      super('This quiz session has already ended.');
      this.name = 'SessionEndedError';
    }
  }
  class AttemptLimitReachedError extends Error {
    constructor() {
      super('Attempt limit reached.');
      this.name = 'AttemptLimitReachedError';
    }
  }
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    mockSubscribeForReview: vi.fn(),
    hookState: {
      session: null as QuizSession | null,
      myResponse: null as QuizResponse | null,
    },
    SessionEndedError,
    AttemptLimitReachedError,
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
    subscribeForReview: mockSubscribeForReview,
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
  SessionEndedError,
  AttemptLimitReachedError,
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
  mockSubscribeForReview.mockResolvedValue(undefined);
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

  it('shows published results when SSO auto-join hits the attempt cap on a still-active session', async () => {
    // The Classroom case: the student already completed (attemptLimit 1, at
    // cap) and the teacher published while the session is still 'active'.
    // joinQuizSession rejects with AttemptLimitReachedError; the auto-join must
    // fall back to read-only review so the student reaches PublishedScoreReview
    // — NOT the generic "attempt limit reached" error screen.
    hookState.session = buildSession({
      scoreVisibility: 'score-only',
      attemptLimit: 1,
    });
    hookState.myResponse = buildResponse({
      status: 'completed',
      completedAttempts: 1,
    });
    mockJoinQuizSession.mockRejectedValue(new AttemptLimitReachedError());

    render(<QuizStudentApp />);

    expect(await screen.findByText('Your Results')).toBeInTheDocument();
    expect(mockSubscribeForReview).toHaveBeenCalledWith('ABC123');
  });

  it('labels the results watermark with watermarkNameOverride (nameless Classroom SSO session)', async () => {
    // The Classroom studentRole session has no displayName, so the add-on
    // passes the roster/userinfo name down. The override must win over the
    // auth displayName ("Test Student" from beforeEach) so the watermark
    // identifies the actual student.
    hookState.session = buildSession({
      scoreVisibility: 'score-only',
      scorePublishedAt: 1717200000000,
      protection: {
        watermarkEnabled: true,
        tabWarningEnabled: false,
        tabWarningThreshold: 3,
      },
    });
    hookState.myResponse = buildResponse({ status: 'completed' });

    render(<QuizStudentApp embedded watermarkNameOverride="Ada Lovelace" />);

    expect(await screen.findByText('Your Results')).toBeInTheDocument();
    // Watermark label is `${name} • ${timestamp}` in an SVG <text> node.
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByText(/Test Student/)).not.toBeInTheDocument();
  });

  it('shows an in-iframe lockout screen (no /my-assignments redirect) when embedded', async () => {
    // A locked-out student inside the Classroom iframe must see an in-iframe
    // "Results locked" message — NOT a redirect to the standalone
    // /my-assignments page, which the partitioned iframe can't host.
    hookState.session = buildSession({
      scoreVisibility: 'score-only',
      protection: {
        watermarkEnabled: false,
        tabWarningEnabled: true,
        tabWarningThreshold: 3,
      },
    });
    hookState.myResponse = buildResponse({
      status: 'completed',
      resultsLockedOut: true,
      resultsTabWarnings: 3,
      _responseKey: 'sso-uid-1',
    });

    render(<QuizStudentApp embedded />);

    expect(await screen.findByText('Results locked')).toBeInTheDocument();
    expect(screen.queryByText('Your Results')).not.toBeInTheDocument();
  });
});

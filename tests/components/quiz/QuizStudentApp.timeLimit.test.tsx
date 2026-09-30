/**
 * Overall quiz time limit: the clock counts from the server-stamped
 * `attemptStartedAt`, scales by the student's extended time, and submits the
 * attempt when it runs out. "Now" is the mocked server-offset clock.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  QuizSession,
  QuizResponse,
  QuizPublicQuestion,
  StudentAssignmentPointer,
} from '@/types';

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
    pointer: import('@/types').StudentAssignmentPointer | null;
  } = {
    session: null,
    myResponse: null,
    pointer: null,
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

// M17 C3/F2 — the student's own pointer doc; null for an untargeted assignment.
vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => hookState.pointer,
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
    setServedQuestionIds: vi.fn(),
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
  hookState.pointer = null;
  mockAuth.currentUser = mintUser();
  mockJoinQuizSession.mockResolvedValue('session-1');
  mockGetServerNow.mockImplementation(() => Date.now());
  mockCompleteQuiz.mockResolvedValue(undefined);
  setSearch('?code=ABC123');
});

const startedAt = (msAgo: number) =>
  ({
    toMillis: () => Date.now() - msAgo,
  }) as unknown as QuizResponse['attemptStartedAt'];

const pointerWith = (
  timeMultiplier: 1.5 | 2 | 'unlimited'
): StudentAssignmentPointer => ({
  kind: 'quiz',
  sessionId: 'session-1',
  teacherUid: 'teacher-1',
  classId: 'class-1',
  createdAt: 0,
  updatedAt: 0,
  override: { timeMultiplier },
});

describe('QuizStudentApp — overall time limit', () => {
  it('shows the time left while the clock runs', async () => {
    hookState.session = buildSession({ timeLimitMinutes: 30 });
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(10 * 60_000),
    });

    render(<QuizStudentApp />);

    expect(await screen.findByRole('timer')).toHaveTextContent('20:00');
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });

  it('submits with timeUp once the limit passes', async () => {
    hookState.session = buildSession({ timeLimitMinutes: 30 });
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(31 * 60_000),
    });

    render(<QuizStudentApp />);

    await waitFor(() => {
      expect(mockCompleteQuiz).toHaveBeenCalledWith({ timeUp: true });
    });
    expect(
      await screen.findByText(/Time's up\. Your answers were submitted/i)
    ).toBeInTheDocument();
  });

  it('stretches the limit for extended time', async () => {
    hookState.session = buildSession({ timeLimitMinutes: 30 });
    hookState.pointer = pointerWith(2);
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(31 * 60_000),
    });

    render(<QuizStudentApp />);

    expect(await screen.findByRole('timer')).toHaveTextContent('29:00');
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });

  it('shows no clock for unlimited time', async () => {
    hookState.session = buildSession({ timeLimitMinutes: 30 });
    hookState.pointer = pointerWith('unlimited');
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(40 * 60_000),
    });

    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });

  it('ignores the limit on a teacher-paced session', async () => {
    hookState.session = buildSession({
      timeLimitMinutes: 30,
      sessionMode: 'teacher',
    });
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(40 * 60_000),
    });

    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });
});

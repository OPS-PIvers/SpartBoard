import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
  callOrder,
  trackerArgs,
  mockReportTabSwitch,
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
    callOrder: [] as string[],
    trackerArgs: {
      current: null as null | {
        onLeave: () => Promise<boolean>;
        onAwayTooLong: () => void;
      },
    },
    mockReportTabSwitch: vi.fn(),
  };
});

vi.mock('@/components/quiz/recording/activeTake', () => ({
  commitActiveTake: vi.fn(() => {
    callOrder.push('commit');
    return Promise.resolve();
  }),
}));

vi.mock('@/hooks/useTabAwayTracker', () => ({
  useTabAwayTracker: (args: {
    onLeave: () => Promise<boolean>;
    onAwayTooLong: () => void;
  }) => {
    trackerArgs.current = args;
    return { away: null, release: () => undefined };
  },
}));

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
    reportTabSwitch: mockReportTabSwitch,
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
  mockCompleteQuiz.mockImplementation(() => {
    callOrder.push('complete');
    return Promise.resolve();
  });
  callOrder.length = 0;
  trackerArgs.current = null;
  setSearch('?code=ABC123');
});

const startedAt = (msAgo: number) =>
  ({
    toMillis: () => Date.now() - msAgo,
  }) as unknown as QuizResponse['attemptStartedAt'];

describe('QuizStudentApp — cutoffs commit the active take first (D16)', () => {
  it('commits before the time-limit submit', async () => {
    hookState.session = buildSession({ timeLimitMinutes: 30 });
    hookState.myResponse = buildResponse({
      attemptStartedAt: startedAt(31 * 60_000),
    });

    render(<QuizStudentApp />);

    await waitFor(() => {
      expect(mockCompleteQuiz).toHaveBeenCalledWith({ timeUp: true });
    });
    expect(callOrder).toEqual(['commit', 'complete']);
  });

  it('commits before the away-too-long submit', async () => {
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    act(() => trackerArgs.current?.onAwayTooLong());

    await waitFor(() => expect(mockCompleteQuiz).toHaveBeenCalled());
    expect(callOrder).toEqual(['commit', 'complete']);
  });

  it('commits before the tab-warning threshold submit', async () => {
    hookState.session = buildSession({ tabWarningThreshold: 1 });
    mockReportTabSwitch.mockResolvedValue(1);
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    await act(async () => {
      await trackerArgs.current?.onLeave();
    });

    await waitFor(() => expect(mockCompleteQuiz).toHaveBeenCalled());
    expect(callOrder).toEqual(['commit', 'complete']);
  });
});

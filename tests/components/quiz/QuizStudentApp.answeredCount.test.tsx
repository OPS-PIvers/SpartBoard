/**
 * Brief 2.2 — the student's "N of M questions answered" summary counts
 * completeness, not raw `answers[]` presence. An `unresponded` entry (written
 * by the idle-finalize sweep, and later by the client's prep-expiry branches)
 * occupies a slot but must not be counted as answered.
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

const { mockAuth, mockJoinQuizSession, hookState } = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  const state: {
    session: import('@/types').QuizSession | null;
    myResponse: import('@/types').QuizResponse | null;
    pointer: import('@/types').StudentAssignmentPointer | null;
  } = { session: null, myResponse: null, pointer: null };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    hookState: state,
  };
});

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

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: vi.fn(),
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    setServedQuestionIds: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const QUESTIONS: QuizPublicQuestion[] = [
  { id: 'q1', type: 'MC', text: 'Q one?', timeLimit: 0, choices: ['a', 'b'] },
  { id: 'q2', type: 'MC', text: 'Q two?', timeLimit: 0, choices: ['a', 'b'] },
  { id: 'q3', type: 'MC', text: 'Q three?', timeLimit: 0, choices: ['a', 'b'] },
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
    status: 'completed',
    answers: [],
    score: null,
    submittedAt: Date.now(),
    completedAttempts: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  hookState.pointer = null;
  mockAuth.currentUser = {
    uid: 'sso-uid-1',
    isAnonymous: false,
    getIdTokenResult: () =>
      Promise.resolve({
        claims: { studentRole: true } as Record<string, unknown>,
      }),
  };
  mockJoinQuizSession.mockResolvedValue('session-1');
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

describe('QuizStudentApp — submitted summary answered count', () => {
  it('counts every entry on a legacy response with no unresponded field', async () => {
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: Date.now() },
        { questionId: 'q2', answer: 'b', answeredAt: Date.now() },
      ],
    });

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('of 3 questions answered')).toBeInTheDocument()
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('excludes an idle-swept abandoned entry from the count', async () => {
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: Date.now() },
        {
          questionId: 'q2',
          answer: '',
          answeredAt: Date.now(),
          status: 'submitted',
          unresponded: 'abandoned',
        },
        {
          questionId: 'q3',
          answer: '',
          answeredAt: Date.now(),
          status: 'submitted',
          unresponded: 'abandoned',
        },
      ],
    });

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('of 3 questions answered')).toBeInTheDocument()
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('scopes both the numerator and denominator to the M17 served-question subset, excluding an answer for a question outside it', async () => {
    // Legacy response with two answers, but the per-student override (M17
    // served-subset) only serves q1 — the answer for q2 falls outside the
    // subset and must not inflate either the numerator or the denominator.
    hookState.pointer = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: { questionIds: ['q1'] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as StudentAssignmentPointer;
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: Date.now() },
        { questionId: 'q2', answer: 'b', answeredAt: Date.now() },
      ],
    });

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('of 1 questions answered')).toBeInTheDocument()
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('scopes the answered count to the served subset on the post-session results screen too', async () => {
    hookState.session = buildSession({ status: 'ended', endedAt: Date.now() });
    hookState.pointer = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: { questionIds: ['q1'] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as StudentAssignmentPointer;
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: Date.now() },
        { questionId: 'q2', answer: 'b', answeredAt: Date.now() },
      ],
    });

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('of 1 questions answered')).toBeInTheDocument()
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

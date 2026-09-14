// The raise-hand button mounts only when the session doc opted in at assign time.
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

const { mockAuth, hookState, pointerState } = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  const state: {
    session: import('@/types').QuizSession | null;
    myResponse: import('@/types').QuizResponse | null;
  } = { session: null, myResponse: null };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    hookState: state,
    pointerState: {
      current: null as StudentAssignmentPointer | null | undefined,
    },
  };
});

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => pointerState.current,
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

// View-only sessions log a pageview; stub the write so the stub `db` is fine.
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn().mockResolvedValue({}),
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
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 0,
    choices: ['3', '4', '5', '22'],
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
    shuffleAnswerOptions: false,
    ...overrides,
  };
}

function buildResponse(): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
  } as unknown as QuizResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  pointerState.current = {
    kind: 'quiz',
    sessionId: 'session-1',
    teacherUid: 'teacher-1',
    classId: 'class-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as StudentAssignmentPointer;
  mockAuth.currentUser = {
    uid: 'sso-uid-1',
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

const waitForQuestion = () =>
  waitFor(
    () => expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument(),
    { timeout: 4000 }
  );

describe('QuizStudentApp — raise hand gate', () => {
  it('hides the button when the session omits handRaiseEnabled', async () => {
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
  });

  it('hides the button when handRaiseEnabled is false', async () => {
    hookState.session = buildSession({ handRaiseEnabled: false });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
  });

  it('shows the button when handRaiseEnabled is true', async () => {
    hookState.session = buildSession({ handRaiseEnabled: true });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(
      screen.getByRole('button', { name: 'Raise hand' })
    ).toBeInTheDocument();
  });

  it('hides the button on a view-only share even when handRaiseEnabled is true', async () => {
    hookState.session = buildSession({
      handRaiseEnabled: true,
      mode: 'view-only',
    });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
  });
});

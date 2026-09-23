// Per-period sessions: a closed period shows a locked card before the student starts, the
// stopped screen after, and the questions once the period is open or the student is let in.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  PeriodAccess,
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
    contentPending: boolean;
  } = { session: null, myResponse: null, contentPending: false };
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
    periodKeys: ['class-1'],
    contentPending: hookState.contentPending,
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
  hookState.contentPending = false;
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

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

const perPeriod = (
  p: Partial<PeriodAccess>,
  extra: Partial<QuizSession> = {}
): QuizSession =>
  buildSession({
    accessMode: 'assessment',
    questionsInContent: true,
    periodAccess: { 'class-1': period(p), 'class-2': period() },
    ...extra,
  });

describe('QuizStudentApp — per-period access', () => {
  it('shows a locked card with no questions before the period starts', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    hookState.myResponse = { ...buildResponse(), status: 'joined' };
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(
        screen.getByText('Opens when your teacher starts it.')
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('What is 2 + 2?')).toBeNull();
  });

  it('names the scheduled open time', async () => {
    hookState.session = perPeriod({ openAt: Date.now() + 3_600_000 });
    hookState.myResponse = { ...buildResponse(), status: 'joined' };
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText(/^Opens /)).toBeInTheDocument()
    );
    expect(screen.queryByText('What is 2 + 2?')).toBeNull();
  });

  it('freezes a started attempt when the period closes', async () => {
    hookState.session = perPeriod({ state: 'paused' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Stopped for now')).toBeInTheDocument()
    );
    expect(screen.queryByText('What is 2 + 2?')).toBeNull();
  });

  it('shows the questions once the period is open', async () => {
    hookState.session = perPeriod({});
    render(<QuizStudentApp />);
    await waitForQuestion();
  });

  it('shows the questions to a student let in past a closed period', async () => {
    hookState.session = perPeriod(
      { state: 'closed' },
      { studentAccess: { 'sso-uid-1': Date.now() + 600_000 } }
    );
    render(<QuizStudentApp />);
    await waitForQuestion();
  });

  it('sends a completed student to their submitted screen after the period closes', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    hookState.contentPending = true;
    hookState.myResponse = {
      ...buildResponse(),
      status: 'completed',
      submittedAt: Date.now(),
      completedAttempts: 1,
    } as unknown as QuizResponse;
    render(<QuizStudentApp />);
    expect(await screen.findByText('Quiz Submitted!')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading questions')).toBeNull();
  });

  it('waits for the hidden questions to load', async () => {
    hookState.session = perPeriod({});
    hookState.contentPending = true;
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByLabelText('Loading questions')).toBeInTheDocument()
    );
  });
});

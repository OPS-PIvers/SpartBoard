/** Sections in the student player: intro, breadcrumb and the choose-N lock (QUIZ_EXAMVIEW_IMPORT.md E12, E13). */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const {
  mockAuth,
  mockJoinQuizSession,
  mockLookupSession,
  mockSubmitAnswer,
  mockCompleteQuiz,
  hookState,
  registerRefresher,
} = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  type Refresher = () => void;
  const refreshers = new Set<Refresher>();
  const state: {
    session: import('@/types').QuizSession | null;
    myResponse: import('@/types').QuizResponse | null;
    raceMode: boolean;
  } = {
    session: null,
    myResponse: null,
    raceMode: false,
  };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      // QuizStudentApp awaits this before checking `currentUser` to avoid
      // racing Firebase Auth's IndexedDB hydration. Tests control
      // `currentUser` synchronously, so resolving immediately is correct.
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    mockLookupSession: vi.fn(),
    mockSubmitAnswer: vi.fn(),
    mockCompleteQuiz: vi.fn(),
    hookState: state,
    registerRefresher: (fn: Refresher) => {
      refreshers.add(fn);
      return () => {
        refreshers.delete(fn);
      };
    },
  };
});

// M17 C3 — no per-student pointer in these tests (untargeted assignment).
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

// Stateful hook mock. Each call subscribes via `registerRefresher` so tests
// can force a re-render after mutating `hookState.myResponse` — that's how we
// simulate the SSO listener firing synchronously inside `submitAnswer`.
vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const unsub = registerRefresher(() => setTick((n) => n + 1));
      return unsub;
    }, []);
    return {
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
    };
  },
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

function mintUser(opts: {
  uid: string;
  isAnonymous: boolean;
  studentRole: boolean;
}): {
  uid: string;
  isAnonymous: boolean;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
} {
  return {
    uid: opts.uid,
    isAnonymous: opts.isAnonymous,
    getIdTokenResult: () =>
      Promise.resolve({ claims: { studentRole: opts.studentRole } }),
  };
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/quiz${search}`);
}

const written = (id: string): QuizPublicQuestion => ({
  id,
  type: 'free-response',
  text: `Explain ${id}.`,
  timeLimit: 0,
});

function buildSession(): QuizSession {
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
    totalQuestions: 3,
    publicQuestions: [written('q17'), written('q18'), written('q19')],
    shuffleAnswerOptions: false,
    sections: [
      {
        id: 's1',
        title: 'Short Answer',
        directions: 'Pick two questions to answer.',
        chooseCount: 2,
        questionIds: ['q17', 'q18', 'q19'],
      },
    ],
  };
}

function buildResponse(answered: string[]): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: answered.map((questionId) => ({
      questionId,
      answer: 'An answer.',
      answeredAt: Date.now(),
      status: 'submitted' as const,
    })),
    score: null,
    submittedAt: null,
    completedAttempts: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.raceMode = false;
  mockAuth.currentUser = mintUser({
    uid: 'sso-uid-1',
    isAnonymous: false,
    studentRole: true,
  });
  mockJoinQuizSession.mockResolvedValue('session-1');
  mockSubmitAnswer.mockResolvedValue(undefined);
  mockCompleteQuiz.mockResolvedValue(undefined);
  setSearch('?code=ABC123');
});

describe('QuizStudentApp — sections', () => {
  it('opens the section with its directions and the count, then shows a breadcrumb', async () => {
    hookState.session = buildSession();
    hookState.myResponse = buildResponse([]);
    render(<QuizStudentApp />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Short Answer');
    expect(dialog).toHaveTextContent('Pick two questions to answer.');
    expect(dialog).toHaveTextContent('Answer any 2 of these 3 questions.');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: /Short Answer/ })
    ).toHaveTextContent('0 of 2 answered');
  });

  it('locks a third question once two are answered', async () => {
    hookState.session = buildSession();
    hookState.myResponse = buildResponse(['q18', 'q19']);
    render(<QuizStudentApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(
      await screen.findByText(
        'You’ve answered 2 of 2. Clear one to answer this instead.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('clears an answered question to free its place', async () => {
    hookState.session = buildSession();
    hookState.myResponse = buildResponse(['q17', 'q18']);
    render(<QuizStudentApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Clear my answer' })
    );
    await waitFor(() =>
      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        'q17',
        '',
        undefined,
        undefined
      )
    );
  });
});

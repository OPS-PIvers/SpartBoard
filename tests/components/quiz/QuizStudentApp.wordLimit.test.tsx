/**
 * Submit gating for enforced word limits on written questions. The button
 * reads `wordLimitStatus` off the live draft, so these render tests pin the
 * wiring; the range arithmetic itself is covered in `utils/wordLimit.test.ts`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const essayQuestion = (
  extra: Partial<QuizPublicQuestion> = {}
): QuizPublicQuestion => ({
  id: 'q1',
  type: 'essay',
  text: 'Explain your reasoning.',
  timeLimit: 0,
  ...extra,
});

function buildSession(question: QuizPublicQuestion): QuizSession {
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
    publicQuestions: [question],
  };
}

function buildResponse(answer: string): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [
      { questionId: 'q1', answer, answeredAt: Date.now(), status: 'draft' },
    ],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
  };
}

const setUp = (question: QuizPublicQuestion, answer: string) => {
  hookState.session = buildSession(question);
  hookState.myResponse = buildResponse(answer);
};

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

describe('QuizStudentApp — enforced word limits', () => {
  it('disables the written submit and explains the shortfall under an enforced minimum', async () => {
    setUp(
      essayQuestion({ minWords: 100, enforceWordLimit: true }),
      '<p>far too short</p>'
    );
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Explain your reasoning/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /SUBMIT/i })).toBeDisabled();
    });
    expect(
      screen.getByText('Write at least 100 words to submit. 97 to go.')
    ).toBeInTheDocument();
  });

  it('disables the written submit and explains the overage over an enforced maximum', async () => {
    setUp(
      essayQuestion({ maxWords: 2, enforceWordLimit: true }),
      '<p>one two three four five</p>'
    );
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Explain your reasoning/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /SUBMIT/i })).toBeDisabled();
    });
    expect(
      screen.getByText(
        'Your answer is 3 words over the 2-word limit. Trim it to submit.'
      )
    ).toBeInTheDocument();
  });

  it('leaves the written submit enabled and silent when the limit is advisory', async () => {
    setUp(essayQuestion({ minWords: 100 }), '<p>far too short</p>');
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Explain your reasoning/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /SUBMIT/i })).toBeEnabled();
    });
    expect(screen.queryByText(/to go\./)).toBeNull();
  });

  it('leaves the written submit enabled inside an enforced range', async () => {
    setUp(
      essayQuestion({ minWords: 1, maxWords: 100, enforceWordLimit: true }),
      '<p>one two three</p>'
    );
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Explain your reasoning/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /SUBMIT/i })).toBeEnabled();
    });
  });
});

/** MA rendering: checkbox semantics, multi-select encoding and restore. */
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

const maQuestion: QuizPublicQuestion = {
  id: 'q1',
  type: 'MA',
  text: 'Which are prime?',
  timeLimit: 0,
  choices: ['2', '4', '3', '9'],
};

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
    shuffleAnswerOptions: false,
  };
}

function buildResponse(answer: string | null): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers:
      answer === null
        ? []
        : [
            {
              questionId: 'q1',
              answer,
              answeredAt: Date.now(),
              status: 'draft',
            },
          ],
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

const box = (name: string) => screen.getByRole('checkbox', { name });

describe('QuizStudentApp — choose all that apply', () => {
  it('renders every option as a checkbox under a hint, restoring a saved selection', async () => {
    hookState.session = buildSession(maQuestion);
    hookState.myResponse = buildResponse('3|2');
    render(<QuizStudentApp />);

    expect(
      await screen.findByText('Choose all that apply')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    await waitFor(() => {
      expect(box('2')).toHaveAttribute('aria-checked', 'true');
    });
    expect(box('3')).toHaveAttribute('aria-checked', 'true');
    expect(box('4')).toHaveAttribute('aria-checked', 'false');
    expect(box('9')).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles several options and submits them joined in display order', async () => {
    hookState.session = buildSession(maQuestion);
    hookState.myResponse = buildResponse(null);
    render(<QuizStudentApp />);

    await screen.findByText('Choose all that apply');
    const submit = screen.getByRole('button', { name: /SUBMIT/i });
    expect(submit).toBeDisabled();

    fireEvent.click(box('3'));
    fireEvent.click(box('9'));
    fireEvent.click(box('2'));
    fireEvent.click(box('9'));
    expect(box('2')).toHaveAttribute('aria-checked', 'true');
    expect(box('9')).toHaveAttribute('aria-checked', 'false');

    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => {
      expect(
        mockSubmitAnswer.mock.calls.some(
          (c: unknown[]) => c[0] === 'q1' && c[1] === '2|3'
        )
      ).toBe(true);
    });
  });

  it('disables submit again when every option is unchecked', async () => {
    hookState.session = buildSession(maQuestion);
    hookState.myResponse = buildResponse(null);
    render(<QuizStudentApp />);

    await screen.findByText('Choose all that apply');
    fireEvent.click(box('4'));
    const submit = screen.getByRole('button', { name: /SUBMIT/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(box('4'));
    await waitFor(() => expect(submit).toBeDisabled());
  });
});

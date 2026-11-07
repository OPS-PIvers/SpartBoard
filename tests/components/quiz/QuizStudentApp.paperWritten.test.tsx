/** paper-written-hybrid: a written question answered on the printed sheet shows a note instead of the editor. */
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

const essayQuestion = (
  extra: Partial<QuizPublicQuestion> = {}
): QuizPublicQuestion => ({
  id: 'q1',
  type: 'free-response',
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

const mcQuestion = {
  id: 'q2',
  type: 'MC',
  text: 'Second question',
  timeLimit: 0,
  options: ['A', 'B'],
} as QuizPublicQuestion;

const paperSession = (
  questions: QuizPublicQuestion[],
  extra: Partial<QuizSession> = {}
): QuizSession => ({
  ...buildSession(questions[0]),
  totalQuestions: questions.length,
  publicQuestions: questions,
  paperWrittenQuestionIds: ['q1'],
  ...extra,
});

const emptyResponse = (): QuizResponse => ({
  ...buildResponse(''),
  answers: [],
});

describe('QuizStudentApp — written answers on paper', () => {
  it('shows the paper note in place of the editor and advances without writing', async () => {
    hookState.session = paperSession([
      essayQuestion({ minWords: 50, enforceWordLimit: true }),
      mcQuestion,
    ]);
    hookState.myResponse = emptyResponse();
    render(<QuizStudentApp />);

    expect(
      await screen.findByText('Write your answer on your paper answer sheet.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/to go\./)).toBeNull();
    const next = screen.getByRole('button', { name: /NEXT/i });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(await screen.findByText(/Second question/i)).toBeInTheDocument();
    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it('submits the quiz from a paper question on the last page', async () => {
    hookState.session = paperSession([
      essayQuestion({ minWords: 50, enforceWordLimit: true }),
    ]);
    hookState.myResponse = emptyResponse();
    render(<QuizStudentApp />);

    await screen.findByText('Write your answer on your paper answer sheet.');
    const submit = screen.getByRole('button', { name: /SUBMIT/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mockCompleteQuiz).toHaveBeenCalled());
    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it('keeps the editor for a written question that is not on paper', async () => {
    hookState.session = paperSession([essayQuestion()], {
      paperWrittenQuestionIds: ['other'],
    });
    hookState.myResponse = buildResponse('<p>typed</p>');
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Explain your reasoning/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Write your answer on your paper answer sheet.')
    ).toBeNull();
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });
});

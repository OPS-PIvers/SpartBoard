/** A failed live-quiz Submit must not freeze the student; they can retry. */
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
vi.mock('@/hooks/useQuizRecordingNoticeSettings', () => ({
  useQuizRecordingNoticeSettings: () => ({
    settings: { enabled: true },
    loaded: true,
  }),
}));

// The pre-quiz mic check has its own suite; these tests start past it.
vi.mock('@/components/quiz/recording/MicrophoneGate', async () => {
  const { useEffect } = await import('react');
  return {
    MicrophoneGate: ({ onReady }: { onReady: () => void }) => {
      useEffect(onReady, [onReady]);
      return null;
    },
  };
});

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

function buildSession(question: QuizPublicQuestion): QuizSession {
  return {
    id: 'session-1',
    assignmentId: 'asn-1',
    quizId: 'quiz-1',
    quizTitle: 'Test quiz',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'teacher',
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

const mcQuestion: QuizPublicQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Pick one',
  timeLimit: 0,
  choices: ['Alpha', 'Beta'],
};

describe('QuizStudentApp — live submit fails', () => {
  it('shows a retry message and lets the student submit again', async () => {
    mockSubmitAnswer.mockImplementation(
      (_q: string, _a: string, _b?: number, opts?: { isDraft?: boolean }) =>
        opts?.isDraft ? Promise.resolve() : Promise.reject(new Error('offline'))
    );
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    hookState.session = {
      ...buildSession(mcQuestion),
      currentQuestionIndex: 0,
    };
    hookState.myResponse = { ...buildResponse(''), answers: [] };
    render(<QuizStudentApp />);
    await screen.findByText(/Pick one/i);
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    const submit = await screen.findByRole('button', {
      name: /Submit Answer|Submit/i,
    });
    fireEvent.click(submit);

    expect(
      await screen.findByText(/Couldn't save your answer/i)
    ).toBeInTheDocument();
    mockSubmitAnswer.mockReset();
    mockSubmitAnswer.mockResolvedValue(undefined);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Submit/i })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    await waitFor(() =>
      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        'q1',
        'Beta',
        undefined,
        undefined
      )
    );
    expect(
      screen.queryByText(/Couldn't save your answer/i)
    ).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});

/** Stop checkpoints in the self-paced player (QUIZ_IMPORT_VERSIONS.md V20). */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const {
  mockAuth,
  mockJoinQuizSession,
  mockLookupSession,
  mockSubmitAnswer,
  mockCompleteQuiz,
  mockSubmitPart,
  mockResumePart,
  hookState,
  registerRefresher,
  triggerRefresh,
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
    mockSubmitPart: vi.fn(),
    mockResumePart: vi.fn(),
    hookState: state,
    registerRefresher: (fn: Refresher) => {
      refreshers.add(fn);
      return () => {
        refreshers.delete(fn);
      };
    },
    triggerRefresh: () => {
      refreshers.forEach((fn) => fn());
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
      submitPart: mockSubmitPart,
      resumePart: mockResumePart,
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

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 0,
    choices: ['3', '4', '5', '22'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    choices: ['London', 'Paris', 'Berlin', 'Madrid'],
  },
  {
    id: 'q3',
    type: 'MC',
    text: 'Color of the sky?',
    timeLimit: 0,
    choices: ['Green', 'Red', 'Blue', 'Yellow'],
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

/** Synchronously append/overwrite an answer in `hookState.myResponse`. */
function appendAnswer(questionId: string, answer: string): void {
  const prev = hookState.myResponse?.answers ?? [];
  hookState.myResponse = {
    ...(hookState.myResponse ?? buildResponse()),
    answers: [
      ...prev.filter((a) => a.questionId !== questionId),
      { questionId, answer, answeredAt: Date.now() },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  hookState.raceMode = false;
  mockAuth.currentUser = mintUser({
    uid: 'sso-uid-1',
    isAnonymous: false,
    studentRole: true,
  });
  mockJoinQuizSession.mockResolvedValue('session-1');

  // Default submit: write the answer into `hookState.myResponse` and force a
  // re-render. When `raceMode=true` we trigger the re-render *before*
  // resolving — that's the SSO listener-fast race.
  mockSubmitAnswer.mockImplementation(
    async (questionId: string, answer: string) => {
      if (hookState.raceMode) {
        appendAnswer(questionId, answer);
        triggerRefresh();
        // Yield to the event loop so React commits the re-render before our
        // caller's continuation (which calls setLocalIndex) runs.
        await new Promise((resolve) => setTimeout(resolve, 0));
      } else {
        appendAnswer(questionId, answer);
        triggerRefresh();
      }
    }
  );
  mockCompleteQuiz.mockImplementation(() => {
    if (hookState.myResponse) {
      hookState.myResponse = {
        ...hookState.myResponse,
        status: 'completed',
        submittedAt: Date.now(),
      };
      triggerRefresh();
    }
    return Promise.resolve();
  });

  setSearch('?code=ABC123');
});

const SECTIONS = [
  { id: 's1', title: 'Part one', questionIds: ['q1', 'q2'], stopAfter: true },
  { id: 's2', title: 'Part two', questionIds: ['q3'] },
];

function stopSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return buildSession({ sections: SECTIONS, ...overrides });
}

beforeEach(() => {
  hookState.session = stopSession();
  mockSubmitPart.mockImplementation((part: number, held: boolean) => {
    hookState.myResponse = {
      ...(hookState.myResponse ?? buildResponse()),
      partsDone: part,
      partHeld: held ? true : null,
    };
    triggerRefresh();
    return Promise.resolve();
  });
  mockResumePart.mockImplementation(() => {
    hookState.myResponse = {
      ...(hookState.myResponse ?? buildResponse()),
      partHeld: null,
    };
    triggerRefresh();
    return Promise.resolve();
  });
});

async function answerThrough(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '4' }));
  await user.click(screen.getByRole('button', { name: /^NEXT/i }));
  expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Paris' }));
  await user.click(screen.getByRole('button', { name: /^NEXT/i }));
}

describe('QuizStudentApp — Stop checkpoint', () => {
  it('holds the student at the Stop after the last question of Part 1', async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);
    await answerThrough(user);

    await waitFor(() => expect(mockSubmitPart).toHaveBeenCalledWith(1, true));
    expect(await screen.findByText('Stop.')).toBeInTheDocument();
    expect(
      screen.getByText('Wait for your teacher to start Part 2.')
    ).toBeInTheDocument();
    expect(mockCompleteQuiz).not.toHaveBeenCalled();
  });

  it('starts Part 2 once the teacher opens it, with Part 1 locked', async () => {
    const user = userEvent.setup();
    hookState.myResponse = buildResponse({ partsDone: 1, partHeld: true });
    hookState.session = stopSession({ partsOpen: { all: 2 } });
    render(<QuizStudentApp />);

    await user.click(
      await screen.findByRole('button', { name: 'Start Part 2' })
    );
    expect(mockResumePart).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Color of the sky/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Previous question/i })
    ).not.toBeInTheDocument();
  });

  it('goes straight on when Part 2 is already open for the period', async () => {
    const user = userEvent.setup();
    hookState.myResponse = buildResponse({ classPeriod: 'Hour 2' });
    hookState.session = stopSession({
      partsOpen: { periods: { 'Hour 2': 2 } },
    });
    render(<QuizStudentApp />);
    await answerThrough(user);

    await waitFor(() => expect(mockSubmitPart).toHaveBeenCalledWith(1, false));
    expect(await screen.findByText(/Color of the sky/i)).toBeInTheDocument();
    expect(screen.queryByText('Stop.')).not.toBeInTheDocument();
  });

  it('ignores the Stop in a teacher-paced session', async () => {
    hookState.session = stopSession({ sessionMode: 'teacher' });
    hookState.myResponse = buildResponse({ partsDone: 1, partHeld: true });
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    expect(screen.queryByText('Stop.')).not.toBeInTheDocument();
  });
});

/**
 * Component-level coverage for the self-paced (student-paced) quiz flow in
 * QuizStudentApp. Covers the unified NEXT/SUBMIT button (post-04b4c8de),
 * back-navigation, and the SSO listener-fast race that previously forced
 * students to click NEXT twice.
 *
 * The race we pin down: SSO students' response doc is keyed by `auth.uid`,
 * so the Firestore `onSnapshot` listener fires from the local optimistic
 * write *before* `setLocalIndex` advances inside `handleSubmitAndAdvance`.
 * A naive state-reset block would briefly set `submitted=true` on the still-
 * current question, swapping the button to the "NEXT QUESTION" timeout
 * fallback (which only bumps the index — no save) and forcing a second tap.
 * The fix: skip the `submitted` reset while a submit is in flight.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    triggerRefresh: () => {
      refreshers.forEach((fn) => fn());
    },
  };
});

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

describe('QuizStudentApp — self-paced flow', () => {
  it('advances to the next question on a single NEXT click (SSO listener-fast race)', async () => {
    const user = userEvent.setup();
    hookState.raceMode = true;

    render(<QuizStudentApp />);

    // Wait until Q1 is on screen (auto-join + ActiveQuiz mount).
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Pick an answer, then click NEXT exactly once.
    await user.click(screen.getByRole('button', { name: '4' }));
    const nextBtn = screen.getByRole('button', { name: /^NEXT/i });
    await user.click(nextBtn);

    // Single click must land us on Q2 — no intermediate "NEXT QUESTION" button
    // requiring a second tap.
    await waitFor(() => {
      expect(screen.getByText(/Capital of France/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/What is 2 \+ 2/i)).not.toBeInTheDocument();

    // submitAnswer was invoked once with the chosen answer for Q1.
    expect(mockSubmitAnswer).toHaveBeenCalledTimes(1);
    expect(mockSubmitAnswer).toHaveBeenCalledWith('q1', '4', undefined);
  });

  it('shows a back button when self-paced and not on the first question', async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    // No back button on Q1.
    expect(
      screen.queryByRole('button', { name: /Previous question/i })
    ).not.toBeInTheDocument();

    // Advance to Q2.
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();

    // Back button now visible.
    expect(
      screen.getByRole('button', { name: /Previous question/i })
    ).toBeInTheDocument();
  });

  it('hydrates the saved MC answer when the student navigates back', async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Answer Q1, advance.
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();

    // Navigate back to Q1.
    await user.click(
      screen.getByRole('button', { name: /Previous question/i })
    );
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // The previously-chosen "4" should be highlighted in the draft style
    // (border-violet-500), not the locked emerald style.
    const choice = screen.getByRole('button', { name: '4' });
    expect(choice.className).toContain('border-violet-500');
    expect(choice.className).not.toContain('border-emerald-500');
  });

  it('overwrites the saved answer when re-submitting from a revisit', async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Answer Q1 = "4", advance, then come back.
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Previous question/i })
    );
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Pick a different option and click NEXT — this should re-submit with
    // the new answer, not bail out due to `submitted=true`.
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));

    // submitAnswer fired twice total: q1='4', then q1='5'.
    expect(mockSubmitAnswer).toHaveBeenCalledTimes(2);
    expect(mockSubmitAnswer).toHaveBeenLastCalledWith('q1', '5', undefined);
  });

  it('shows the timeout fallback "NEXT QUESTION" button when the timer expires without an answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      hookState.session = buildSession({
        publicQuestions: [
          { ...QUESTIONS[0], timeLimit: 5 },
          QUESTIONS[1],
          QUESTIONS[2],
        ],
      });

      render(<QuizStudentApp />);
      expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

      // Advance past the time limit without picking an answer. The countdown
      // effect ticks once per second; flush 6 seconds to be safe.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      // The auto-submit fallback is now the visible action button.
      expect(
        screen.getByRole('button', { name: /NEXT QUESTION/i })
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

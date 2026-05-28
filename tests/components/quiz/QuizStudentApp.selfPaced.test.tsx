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
    expect(mockSubmitAnswer).toHaveBeenCalledWith(
      'q1',
      '4',
      undefined,
      undefined
    );
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
    expect(mockSubmitAnswer).toHaveBeenLastCalledWith(
      'q1',
      '5',
      undefined,
      undefined
    );
  });

  it('hydrates the saved answer when myResponse arrives after the initial mount (page refresh mid-quiz)', async () => {
    // Simulate a refresh: ActiveQuiz mounts before `myResponse` has loaded
    // (so `alreadyAnswered=false` on first render and `prevQuestionId` is
    // initialized to the current question id). Then the listener fires and
    // populates a saved answer for the question we're sitting on. The
    // alreadyAnswered branch must hydrate the local controls — otherwise
    // the student sees the question with no option highlighted and NEXT
    // disabled, stuck until they reselect.
    hookState.myResponse = buildResponse({ answers: [] });
    render(<QuizStudentApp />);

    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    // No option highlighted yet — myResponse hasn't arrived.
    expect(screen.getByRole('button', { name: '4' }).className).not.toContain(
      'border-violet-500'
    );

    // Listener fires with a prior answer for q1.
    act(() => {
      appendAnswer('q1', '4');
      triggerRefresh();
    });

    // Saved answer is now highlighted in the editable draft style.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '4' }).className).toContain(
        'border-violet-500'
      );
    });

    // And NEXT is enabled (a single click advances — no reselect required).
    const nextBtn = screen.getByRole('button', { name: /^NEXT/i });
    expect(nextBtn).not.toBeDisabled();
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

  it('preserves partial Matching placements when the timer auto-submits', async () => {
    // Regression: before the structuredAnswerRef wiring, the timer-expiry
    // auto-submit path read selectedAnswerRef ?? draftMcAnswerRef ??
    // fibAnswerRef ?? '' — none of which capture the live wire string from
    // the matching/ordering child component, so timeouts always submitted
    // ''. This test holds that path: place one chip, let the clock run
    // out, and assert the partial placement reaches submitAnswer.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      const matching: QuizPublicQuestion = {
        id: 'qm-timer',
        type: 'Matching',
        text: 'Match the capitals',
        timeLimit: 5,
        matchingLeft: ['France', 'Germany'],
        matchingRight: ['Paris', 'Berlin'],
      };
      hookState.session = buildSession({
        publicQuestions: [matching, QUESTIONS[1]],
        totalQuestions: 2,
      });

      render(<QuizStudentApp />);
      expect(
        await screen.findByText(/Match the capitals/i)
      ).toBeInTheDocument();

      // Tap-to-place: select Paris from the bank, then drop into France.
      await user.click(
        screen.getByRole('button', { name: /Paris, in word bank/ })
      );
      await user.click(
        screen.getByRole('button', { name: /Drop zone for France/ })
      );

      // Run out the clock. The countdown effect ticks once per second, so
      // 6s is enough to trigger auto-submit.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      // The auto-submit must have called submitAnswer with the partial
      // placement, not the empty string.
      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        'qm-timer',
        'France:Paris|Germany:',
        0,
        undefined
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves partial Ordering placements when the timer auto-submits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      const ordering: QuizPublicQuestion = {
        id: 'qo-timer',
        type: 'Ordering',
        text: 'Put these in order',
        timeLimit: 5,
        orderingItems: ['First', 'Second', 'Third'],
      };
      hookState.session = buildSession({
        publicQuestions: [ordering, QUESTIONS[1]],
        totalQuestions: 2,
      });

      render(<QuizStudentApp />);
      expect(
        await screen.findByText(/Put these in order/i)
      ).toBeInTheDocument();

      // Place First and Second; leave Third in the bank.
      await user.click(
        screen.getByRole('button', { name: /First, in word bank/ })
      );
      await user.click(
        screen.getByRole('button', { name: /Empty drop zone, position 1/ })
      );
      await user.click(
        screen.getByRole('button', { name: /Second, in word bank/ })
      );
      await user.click(
        screen.getByRole('button', { name: /Empty drop zone, position 2/ })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        'qo-timer',
        'First|Second|',
        0,
        undefined
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders MC choices in a per-student order so neighbours diverge', async () => {
    // Use 6 choices so the chance of two random orders matching by accident
    // is small enough that this test won't flake (1/6! ≈ 0.14%).
    const six = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    const sixChoiceQ: QuizPublicQuestion = {
      id: 'q1',
      type: 'MC',
      text: 'What is 2 + 2?',
      timeLimit: 0,
      choices: six,
    };
    hookState.session = buildSession({ publicQuestions: [sixChoiceQ] });

    // Student A.
    hookState.myResponse = buildResponse({ studentUid: 'student-aaa' });
    const { unmount } = render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    const orderA = six.map((label) =>
      screen.getAllByRole('button').findIndex((b) => b.textContent === label)
    );
    unmount();

    // Student B — same session, different uid.
    hookState.myResponse = buildResponse({ studentUid: 'student-bbb' });
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();
    const orderB = six.map((label) =>
      screen.getAllByRole('button').findIndex((b) => b.textContent === label)
    );

    expect(orderA).not.toEqual(orderB);
    // And the choice set is identical — we shuffled, not dropped.
    expect(orderA.slice().sort()).toEqual(orderB.slice().sort());
  });

  it('keeps a single student on the same MC order across back-navigation', async () => {
    const user = userEvent.setup();
    const six: QuizPublicQuestion[] = [
      {
        id: 'q1',
        type: 'MC',
        text: 'What is 2 + 2?',
        timeLimit: 0,
        choices: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'],
      },
      QUESTIONS[1],
    ];
    hookState.session = buildSession({
      publicQuestions: six,
      totalQuestions: 2,
    });

    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    const beforeOrder = screen
      .getAllByRole('button')
      .filter((b) =>
        ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].includes(
          b.textContent ?? ''
        )
      )
      .map((b) => b.textContent);

    await user.click(screen.getByRole('button', { name: 'alpha' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Previous question/i })
    );
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    const afterOrder = screen
      .getAllByRole('button')
      .filter((b) =>
        ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].includes(
          b.textContent ?? ''
        )
      )
      .map((b) => b.textContent);

    expect(afterOrder).toEqual(beforeOrder);
  });

  it('hydrates Matching placements from a saved answer on revisit', async () => {
    const user = userEvent.setup();
    const matching: QuizPublicQuestion = {
      id: 'qm',
      type: 'Matching',
      text: 'Match the capitals',
      timeLimit: 0,
      matchingLeft: ['France', 'Germany', 'Spain'],
      matchingRight: ['Paris', 'Berlin', 'Madrid'],
    };
    hookState.session = buildSession({
      publicQuestions: [matching, QUESTIONS[1]],
      totalQuestions: 2,
    });

    // Seed a saved answer so the placements hydrate from Firestore on mount.
    appendAnswer('qm', 'France:Paris|Germany:Berlin|Spain:Madrid');

    render(<QuizStudentApp />);
    expect(await screen.findByText(/Match the capitals/i)).toBeInTheDocument();

    // Each term has its definition placed (chips render with aria-pressed,
    // bank items in remaining bank). NEXT submits the hydrated answer
    // directly without further interaction.
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(mockSubmitAnswer).toHaveBeenLastCalledWith(
      'qm',
      'France:Paris|Germany:Berlin|Spain:Madrid',
      undefined,
      undefined
    );
  });

  it('hydrates Ordering arrangement from a saved answer on revisit', async () => {
    const user = userEvent.setup();
    const ordering: QuizPublicQuestion = {
      id: 'qo',
      type: 'Ordering',
      text: 'Put these in order',
      timeLimit: 0,
      orderingItems: ['First', 'Second', 'Third', 'Fourth'],
    };
    hookState.session = buildSession({
      publicQuestions: [ordering, QUESTIONS[1]],
      totalQuestions: 2,
    });

    // Seed a saved answer with a non-default order so the test can detect
    // hydration vs. fall-through to the per-student shuffle.
    appendAnswer('qo', 'Fourth|Third|Second|First');

    render(<QuizStudentApp />);
    expect(await screen.findByText(/Put these in order/i)).toBeInTheDocument();

    // The four slot chips should appear in the saved order. We scope the
    // search to button elements since the bank shows chips too — but with
    // all items hydrated into slots, the bank is empty.
    const slotChips = screen
      .getAllByRole('button')
      .filter((b) =>
        ['First', 'Second', 'Third', 'Fourth'].includes(b.textContent ?? '')
      )
      .map((b) => b.textContent);
    expect(slotChips).toEqual(['Fourth', 'Third', 'Second', 'First']);

    // NEXT submits the existing arrangement on a single tap.
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(mockSubmitAnswer).toHaveBeenLastCalledWith(
      'qo',
      'Fourth|Third|Second|First',
      undefined,
      undefined
    );
  });
});

// ─── In-memory answer cache (#2 fix) ──────────────────────────────────────────
//
// The cache makes question navigation read from local state instead of
// re-fetching from the Firestore snapshot. These tests cover the two
// scenarios where the prior hydration-on-every-question-change design
// could (and did) lose student work in production:
//   - Next → Back when the response listener hadn't echoed the just-
//     submitted answer back yet.
//   - A late-arriving snapshot for the current question (teacher resume,
//     SSO listener-fast race) seeding a blank that overwrites local edits.

describe('QuizStudentApp — in-memory answer cache', () => {
  it('preserves the locally-selected MC option across Next → Back even when Firestore never echoes the submit', async () => {
    // Drop the default `appendAnswer` side-effect so the answer is never
    // visible via `myResponse`. The cache is then the ONLY thing
    // remembering which option the student picked — exactly the pre-fix
    // race scenario where the snapshot listener fell behind.
    mockSubmitAnswer.mockImplementation(async () => {
      // No-op: don't update hookState, don't trigger refresh.
    });
    const user = userEvent.setup();

    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Pick "4", advance to Q2.
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();

    // Back to Q1.
    await user.click(
      screen.getByRole('button', { name: /Previous question/i })
    );
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // "4" must still be highlighted in the editable draft style. Before
    // the cache fix this would have come back blank because
    // savedAnswerForCurrent was null and hydrate seeded the editor with
    // an empty value.
    const choice = screen.getByRole('button', { name: '4' });
    expect(choice.className).toContain('border-violet-500');
  });

  it('does not clobber a locally-selected option when a snapshot with empty answers fires after the click', async () => {
    // Simulates the "teacher resume" / late-snapshot race: the student
    // clicks an option, then a Firestore snapshot arrives for the SAME
    // question with no saved answer. Pre-fix the editor was reset to
    // the saved value via hydrateAnswerControls and the student saw
    // their selection vanish. Post-fix the cache wins because it
    // already has a value for this question.
    const user = userEvent.setup();

    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByRole('button', { name: '4' }).className).toContain(
      'border-violet-500'
    );

    // Fire a snapshot for an empty response — the kind of state the
    // listener briefly returns after a teacher unlock or a slow round
    // trip.
    act(() => {
      hookState.myResponse = buildResponse({ answers: [] });
      triggerRefresh();
    });

    // Selection must still be intact.
    expect(screen.getByRole('button', { name: '4' }).className).toContain(
      'border-violet-500'
    );
  });
});

// ─── Narrowed current-answer ref + submit gating (#1741 follow-up) ────────────
//
// Issue #2: `currentAnswerRef` mirrors ONLY the active question's cached value
// (not the whole cache). The two imperative readers — the timer auto-submit
// effect and the visibility/unmount flush handler — must still see the current
// question's live draft through it. These pin both read paths for a
// non-structured type (the Matching/Ordering timer tests above cover the
// structured auto-submit path).
//
// Issue #1: the Submit/NEXT affordances gate on the cache-backed value
// (`submittableAnswer`), not on `liveAnswer` (which folds in the Firestore
// fallback). The transient pre-seed render the fix guards against is coalesced
// away by React (the cache-miss-fill is a render-phase update), so it isn't
// observable here; the test below pins the end-state contract — the gate tracks
// the cache, going from disabled → enabled as the option lands in it.

describe('QuizStudentApp — current-answer ref + submit gating', () => {
  it('auto-submits the cached MC selection on timeout (reads currentAnswerRef)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      hookState.session = buildSession({
        publicQuestions: [
          { ...QUESTIONS[0], timeLimit: 5 },
          QUESTIONS[1],
          QUESTIONS[2],
        ],
      });

      render(<QuizStudentApp />);
      expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

      // Pick "4" but never submit — the value lives only in the cache,
      // mirrored into the narrowed currentAnswerRef.
      await user.click(screen.getByRole('button', { name: '4' }));

      // Run the clock out. The auto-submit effect must read the cached "4"
      // back out of the ref, not submit an empty answer.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(mockSubmitAnswer).toHaveBeenCalledWith('q1', '4', 0, undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes the current question's cached draft on visibilitychange→hidden (reads currentAnswerRef)", async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Cache "4". The 500 ms autosave debounce hasn't fired yet.
    await user.click(screen.getByRole('button', { name: '4' }));

    // Tab-switch away. The flush handler reads the active question's value out
    // of the narrowed ref and writes it as a draft immediately (best-effort,
    // before the debounce would have).
    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await waitFor(() => {
        expect(mockSubmitAnswer).toHaveBeenCalledWith('q1', '4', undefined, {
          isDraft: true,
        });
      });
    } finally {
      // Drop the instance override so the jsdom prototype getter (default
      // 'visible') is restored for other tests.
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('keeps NEXT disabled until an option is cached, then enables it (gates on the cache, not the saved fallback)', async () => {
    const user = userEvent.setup();
    render(<QuizStudentApp />);
    expect(await screen.findByText(/What is 2 \+ 2/i)).toBeInTheDocument();

    // Fresh question, nothing selected → no cache entry → the submit
    // affordance is disabled. It gates on `submittableAnswer` (cache-backed),
    // never on a Firestore fallback showing through `liveAnswer`.
    expect(screen.getByRole('button', { name: /^NEXT/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByRole('button', { name: /^NEXT/i })).not.toBeDisabled();
  });
});

// ─── Written blank-overwrite guard (#1741 follow-up) ──────────────────────────
//
// The written editor's submit affordance is the one explicit-submit path that
// can fire with an empty value (MC/FIB/structured all gate on content). An
// explicit submit bypasses the autosave `isUnsafeBlankDraft` guard, so a fast
// tap on a blank-but-unseeded essay — never typed, OR the saved answer hasn't
// echoed into myResponse yet — would clobber the saved essay with ''. The fix:
// when the cache has no entry (`submittableAnswer === null`), self-paced
// advances WITHOUT writing and teacher-paced disables Submit; a deliberate
// clear (cache holds '') still writes through.

describe('QuizStudentApp — written blank-overwrite guard', () => {
  const ESSAY: QuizPublicQuestion = {
    id: 'qe',
    type: 'essay',
    text: 'Describe your summer',
    timeLimit: 0,
  };

  it('advances a blank, unseeded essay WITHOUT writing a blank (self-paced)', async () => {
    const user = userEvent.setup();
    hookState.session = buildSession({
      publicQuestions: [ESSAY, QUESTIONS[1]],
      totalQuestions: 2,
    });

    render(<QuizStudentApp />);
    expect(
      await screen.findByText(/Describe your summer/i)
    ).toBeInTheDocument();
    // Let the lazy editor settle so NEXT isn't tapped mid-Suspense.
    await screen.findByRole('textbox', { name: /Your response/i });

    // Tap NEXT without typing. The cache has no entry for this question, so we
    // must advance without writing — a blank explicit submit here would
    // clobber a saved essay that simply hasn't echoed back yet.
    await user.click(screen.getByRole('button', { name: /^NEXT/i }));

    // Advanced to Q2…
    expect(await screen.findByText(/Capital of France/i)).toBeInTheDocument();
    // …and nothing was written for the blank essay.
    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it('disables teacher-paced essay Submit while the editor is unseeded', async () => {
    hookState.session = buildSession({
      sessionMode: 'teacher',
      publicQuestions: [ESSAY, QUESTIONS[1]],
      totalQuestions: 2,
    });

    render(<QuizStudentApp />);
    expect(
      await screen.findByText(/Describe your summer/i)
    ).toBeInTheDocument();
    await screen.findByRole('textbox', { name: /Your response/i });

    // No saved answer + nothing typed → cache unseeded → Submit is disabled so
    // a fast tap can't write a blank over a not-yet-loaded saved essay.
    expect(
      screen.getByRole('button', { name: /Submit Response/i })
    ).toBeDisabled();
  });
});

/**
 * Smoke-level coverage for QuizLiveMonitor — focuses on the privacy
 * gate around score reveal, the chip-style class-period filter, and
 * the leaderboard-broadcast invariant that filtering must NOT touch
 * the student-facing leaderboard.
 *
 * Heavy mocking style mirrors `QuizResults.regenerate.test.tsx`: every
 * hook the component reaches into is stubbed at module-scope so the
 * test stays self-contained.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type {
  ClassRoster,
  QuizConfig,
  QuizData,
  QuizResponse,
  QuizSession,
} from '@/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
const updateAccountPreferences = vi.fn();
const addToast = vi.fn();
const showConfirm = vi.fn().mockResolvedValue(false);

// Mutable auth-state container so individual tests can flip Colors / score
// preference without remounting the module. The `useAuth` mock reads from
// this on every call, and `rerender(...)` forces the component to re-read.
const authState: {
  quizMonitorColorsEnabled: boolean;
  quizMonitorScoreDisplay: 'percent' | 'count' | 'hidden';
} = {
  quizMonitorColorsEnabled: true,
  quizMonitorScoreDisplay: 'percent',
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: 'test-org',
    get quizMonitorColorsEnabled() {
      return authState.quizMonitorColorsEnabled;
    },
    get quizMonitorScoreDisplay() {
      return authState.quizMonitorScoreDisplay;
    },
    updateAccountPreferences,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast,
  }),
}));

// `useDialog` is globally stubbed in tests/setup.ts but its showConfirm
// resolves true by default, which would fire the END handler on first render.
// Override locally with a resolve-false stub so the END button is inert.
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  // QuizLiveMonitor reaches into resolveResponseDisplayName which calls
  // formatStudentName — exporting a no-op keeps the resolver happy.
  formatStudentName: () => '',
}));

vi.mock('@/utils/quizAudio', () => ({
  playPodiumFanfare: vi.fn(),
  playQuizCompleteCelebration: vi.fn(),
}));

// firebase/firestore is real in this repo but db/auth from `@/config/firebase`
// are globally stubbed to `{}` in tests/setup.ts. We mock the firestore
// primitives QuizLiveMonitor calls so the broadcast effect is observable
// without a real backend.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __doc: _args.slice(1) })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(() => '__DELETE__'),
}));

import * as firestore from 'firebase/firestore';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';

// ─── Fixture helpers ────────────────────────────────────────────────────────
function makeQuizData(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1?',
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
        points: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 'sess-1',
    assignmentId: 'a-1',
    quizId: 'quiz-1',
    quizTitle: 'Sample Quiz',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'teacher',
    currentQuestionIndex: 0,
    startedAt: 1,
    endedAt: null,
    code: 'ABC123',
    totalQuestions: 1,
    publicQuestions: [],
    periodNames: ['Period 1'],
    questionPhase: 'answering',
    tabWarningsEnabled: true,
    ...overrides,
  } as unknown as QuizSession;
}

function makeResponse(
  overrides: Partial<QuizResponse> & { pin: string; classPeriod: string }
): QuizResponse {
  return {
    studentUid: `uid-${overrides.pin}`,
    joinedAt: 1,
    status: 'completed',
    answers: [{ questionId: 'q1', answer: 'a', answeredAt: 100 }],
    score: null,
    submittedAt: 200,
    tabSwitchWarnings: 0,
    ...overrides,
  } as unknown as QuizResponse;
}

function makeConfig(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    view: 'monitor',
    selectedQuizId: 'quiz-1',
    selectedQuizTitle: 'Sample Quiz',
    activeAssignmentId: 'a-1',
    activeLiveSessionCode: 'ABC123',
    resultsSessionId: null,
    periodNames: ['Period 1'],
    ...overrides,
  } as unknown as QuizConfig;
}

const noopAsync = () => Promise.resolve();

interface RenderOpts {
  session?: Partial<QuizSession>;
  config?: Partial<QuizConfig>;
  responses?: QuizResponse[];
  rosters?: ClassRoster[];
}

function makeRoster(name: string): ClassRoster {
  return {
    id: `roster-${name}`,
    name,
    driveFileId: null,
    studentCount: 0,
    createdAt: 1,
    students: [],
  } as unknown as ClassRoster;
}

function buildTree(opts: RenderOpts) {
  const session = makeSession(opts.session);
  const config = makeConfig({
    periodNames: session.periodNames,
    ...opts.config,
  });
  const rosters: ClassRoster[] =
    opts.rosters ?? (session.periodNames ?? []).map(makeRoster);
  return (
    <QuizLiveMonitor
      session={session}
      responses={opts.responses ?? []}
      quizData={makeQuizData()}
      onAdvance={noopAsync}
      onEnd={noopAsync}
      config={config}
      rosters={rosters}
      onUpdateConfig={vi.fn()}
    />
  );
}

function renderMonitor(opts: RenderOpts = {}) {
  const result = render(buildTree(opts));
  // Helper to force a re-render. Passes a freshly constructed JSX element
  // so React's element-identity bail-out doesn't skip the update — needed
  // by tests that mutate `authState` between clicks and want the next
  // render to observe the new value.
  const rerenderSame = () => result.rerender(buildTree(opts));
  return Object.assign(result, { rerenderSame });
}

// Approve the privacy gate that hides scores/colors by default. After
// approval, the persisted account preference takes effect. Helpers below
// click a toggle once with the confirm dialog auto-resolving true, then
// reset mocks so the test only sees calls from the action under test.
async function approveScoreReveal() {
  showConfirm.mockResolvedValueOnce(true);
  // Click the Colors button: turning ON triggers the confirm. With stored
  // colors=true, no preference write happens — the click only flips the
  // session-local approval flag.
  fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  vi.clearAllMocks();
  // Restore the default-deny showConfirm so subsequent prompts (e.g. END)
  // don't accidentally fire in tests that don't expect a dialog.
  showConfirm.mockResolvedValue(false);
}

describe('QuizLiveMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(false);
    authState.quizMonitorColorsEnabled = true;
    authState.quizMonitorScoreDisplay = 'percent';
    // Each call to updateAccountPreferences should mirror the requested
    // change into authState so the next render observes the new value
    // (matches the real Firestore-backed implementation).
    updateAccountPreferences.mockImplementation(
      (
        updates: Partial<{
          quizMonitorColorsEnabled: boolean;
          quizMonitorScoreDisplay: 'percent' | 'count' | 'hidden';
        }>
      ): Promise<void> => {
        if (typeof updates.quizMonitorColorsEnabled === 'boolean') {
          authState.quizMonitorColorsEnabled = updates.quizMonitorColorsEnabled;
        }
        if (updates.quizMonitorScoreDisplay !== undefined) {
          authState.quizMonitorScoreDisplay = updates.quizMonitorScoreDisplay;
        }
        return Promise.resolve();
      }
    );
  });

  it('hides the period chip filter when the assignment targets a single period', () => {
    renderMonitor({
      session: { periodNames: ['Period 1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    expect(
      screen.queryByRole('group', { name: /Filter monitor by class period/i })
    ).not.toBeInTheDocument();
  });

  it('renders one chip per period plus an "All" chip when 2+ periods are targeted, defaulting to the first period', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2', 'P3'] },
      responses: [
        makeResponse({ pin: '1111', classPeriod: 'P1' }),
        makeResponse({ pin: '2222', classPeriod: 'P2' }),
        makeResponse({ pin: '3333', classPeriod: 'P3' }),
      ],
    });
    expect(
      screen.getByRole('group', { name: /Filter monitor by class period/i })
    ).toBeInTheDocument();
    const p1 = screen.getByRole('button', { name: 'P1' });
    const p2 = screen.getByRole('button', { name: 'P2' });
    const p3 = screen.getByRole('button', { name: 'P3' });
    const all = screen.getByRole('button', { name: 'All' });
    // Default selection narrows to the first targeted period.
    expect(p1).toHaveAttribute('aria-pressed', 'true');
    expect(p2).toHaveAttribute('aria-pressed', 'false');
    expect(p3).toHaveAttribute('aria-pressed', 'false');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    // KPI roster reflects the narrowed default — only P1's response shows.
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');
  });

  it('clicking a period chip narrows the KPI counts and roster exclusively to that period', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2'] },
      responses: [
        makeResponse({ pin: '1111', classPeriod: 'P1', status: 'completed' }),
        makeResponse({ pin: '2222', classPeriod: 'P2', status: 'completed' }),
      ],
    });
    // Default narrows to P1 only.
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');
    // Switch to P2 — exclusive selection.
    fireEvent.click(screen.getByRole('button', { name: 'P2' }));
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');
    expect(screen.getByRole('button', { name: 'P2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'P1' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // All widens back out.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 2');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('resolves SSO joiners through session.classPeriodByClassId so they are not filtered out when only classId is set', () => {
    // SSO student: response has `classId` but no `classPeriod` (multi-class
    // claim, claim-resolution race, or legacy doc). The chip filter must
    // resolve via the session map before deciding to drop the row.
    renderMonitor({
      session: {
        periodNames: ['P1', 'P2'],
        classPeriodByClassId: { 'class-A': 'P1', 'class-B': 'P2' },
      },
      responses: [
        makeResponse({ pin: '1111', classPeriod: 'P1', status: 'completed' }),
        // SSO row: classId only, no classPeriod
        {
          studentUid: 'uid-sso-A',
          joinedAt: 1,
          status: 'completed',
          answers: [{ questionId: 'q1', answer: 'a', answeredAt: 100 }],
          score: null,
          submittedAt: 200,
          tabSwitchWarnings: 0,
          classId: 'class-A',
        } as unknown as QuizResponse,
        // SSO row that belongs to P2 — must NOT show under default P1.
        {
          studentUid: 'uid-sso-B',
          joinedAt: 1,
          status: 'completed',
          answers: [{ questionId: 'q1', answer: 'a', answeredAt: 100 }],
          score: null,
          submittedAt: 200,
          tabSwitchWarnings: 0,
          classId: 'class-B',
        } as unknown as QuizResponse,
      ],
    });
    // Default narrows to P1: PIN row (P1) + SSO row resolved via class-A → P1.
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 2');
    fireEvent.click(screen.getByRole('button', { name: 'P2' }));
    // P2: only the class-B SSO row qualifies.
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');
  });

  it('cycles the score-display preference percent → count → hidden → percent after the privacy gate is approved', async () => {
    const { rerenderSame } = renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    await approveScoreReveal();
    const cycleBtn = () =>
      screen.getByRole('button', { name: /Cycle score display/i });

    // Click 1: percent → count
    fireEvent.click(cycleBtn());
    await act(async () => {
      await Promise.resolve();
    });
    rerenderSame();
    // Click 2: count → hidden
    fireEvent.click(cycleBtn());
    await act(async () => {
      await Promise.resolve();
    });
    rerenderSame();
    // Click 3: hidden → percent (back through the gate, which is already
    // approved for this session so no second confirm dialog appears)
    fireEvent.click(cycleBtn());
    await act(async () => {
      await Promise.resolve();
    });

    expect(updateAccountPreferences).toHaveBeenCalledTimes(3);
    expect(updateAccountPreferences).toHaveBeenNthCalledWith(1, {
      quizMonitorScoreDisplay: 'count',
    });
    expect(updateAccountPreferences).toHaveBeenNthCalledWith(2, {
      quizMonitorScoreDisplay: 'hidden',
    });
    expect(updateAccountPreferences).toHaveBeenNthCalledWith(3, {
      quizMonitorScoreDisplay: 'percent',
    });
  });

  it('Colors toggle requires the privacy gate before persisting a flip', async () => {
    // Start with stored colors OFF so a click after approval produces a
    // visible "turn ON → persist true" call.
    authState.quizMonitorColorsEnabled = false;
    renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });

    // First click: triggers the privacy confirm. With showConfirm → true,
    // approval is granted and the stored preference flips on.
    showConfirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(updateAccountPreferences).toHaveBeenCalledWith({
      quizMonitorColorsEnabled: true,
    });
  });

  it('cancelling the privacy gate keeps scores hidden and writes nothing', async () => {
    renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    showConfirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(updateAccountPreferences).not.toHaveBeenCalled();
  });

  it('resets the score-reveal approval when the session id changes so a new quiz starts with scores hidden', async () => {
    const result = render(
      buildTree({
        session: { id: 'sess-A', periodNames: ['P1'] },
        responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
      })
    );
    // Approve the privacy gate in the first session.
    showConfirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Sanity: subsequent toggles in the same session no longer prompt.
    showConfirm.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showConfirm).not.toHaveBeenCalled();

    // Now swap to a fresh session id on the same component instance — the
    // approval should reset, so the next reveal click prompts again.
    const session2 = makeSession({ id: 'sess-B', periodNames: ['P1'] });
    const config2 = makeConfig({ periodNames: session2.periodNames });
    result.rerender(
      <QuizLiveMonitor
        session={session2}
        responses={[makeResponse({ pin: '1111', classPeriod: 'P1' })]}
        quizData={makeQuizData()}
        onAdvance={noopAsync}
        onEnd={noopAsync}
        config={config2}
        rosters={[makeRoster('P1')]}
        onUpdateConfig={vi.fn()}
      />
    );
    showConfirm.mockClear();
    showConfirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not apply approval to a fresh session if session.id changes while the confirm dialog is awaiting', async () => {
    // Hold the confirm promise open so we can swap session.id under it.
    let resolveConfirm: (value: boolean) => void = () => undefined;
    showConfirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    const result = render(
      buildTree({
        session: { id: 'sess-A', periodNames: ['P1'] },
        responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));

    // Swap the active session before the dialog resolves. The session-id
    // change block clears any prior approval — but the in-flight confirm
    // must NOT race ahead and re-set scoreRevealApproved on the new session.
    const session2 = makeSession({ id: 'sess-B', periodNames: ['P1'] });
    const config2 = makeConfig({ periodNames: session2.periodNames });
    result.rerender(
      <QuizLiveMonitor
        session={session2}
        responses={[makeResponse({ pin: '1111', classPeriod: 'P1' })]}
        quizData={makeQuizData()}
        onAdvance={noopAsync}
        onEnd={noopAsync}
        config={config2}
        rosters={[makeRoster('P1')]}
        onUpdateConfig={vi.fn()}
      />
    );

    // Now resolve the original confirm with `true` — the new session must
    // stay un-approved, so the next reveal click on session B prompts again.
    await act(async () => {
      resolveConfirm(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    showConfirm.mockClear();
    showConfirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-state and Clear filter button when the active filter narrows to zero rows', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    // Default selects P1; switching to P2 (which has no responses) yields
    // the empty state. The Clear filter button widens back out.
    fireEvent.click(screen.getByRole('button', { name: 'P2' }));
    expect(
      screen.getByText(/No students match the active class-period filter\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Clear filter/i })
    ).toBeInTheDocument();
  });

  it('keeps the live leaderboard broadcast on the unfiltered response set even while the period filter is narrowed', () => {
    vi.useFakeTimers();
    try {
      const updateDocMock = firestore.updateDoc as unknown as ReturnType<
        typeof vi.fn
      >;
      updateDocMock.mockClear();

      renderMonitor({
        session: {
          periodNames: ['P1', 'P2'],
          // Gamification flag — required for `isGamificationActive` to fire
          // the broadcast effect. Without it, the effect early-returns.
          speedBonusEnabled: true,
        },
        responses: [
          makeResponse({
            pin: '1111',
            classPeriod: 'P1',
            status: 'completed',
          }),
          makeResponse({
            pin: '2222',
            classPeriod: 'P2',
            status: 'completed',
          }),
        ],
      });

      // Initial broadcast — debounced 300ms. The chip filter defaults to
      // P1 only on the monitor side; the leaderboard MUST still see both
      // responses.
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(updateDocMock).toHaveBeenCalled();
      const initialCall = updateDocMock.mock.calls.find(
        (c) =>
          typeof c[1] === 'object' &&
          c[1] !== null &&
          'liveLeaderboard' in (c[1] as Record<string, unknown>)
      );
      if (!initialCall) throw new Error('initial leaderboard call missing');
      const initialEntries = (initialCall[1] as { liveLeaderboard: unknown[] })
        .liveLeaderboard;
      expect(Array.isArray(initialEntries)).toBe(true);
      expect(initialEntries).toHaveLength(2);

      // Sanity: the visible roster on the monitor is narrowed to 1 row by
      // the chip-filter default while the leaderboard above stayed at 2.
      vi.useRealTimers();
      expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');

      // Switch the chip to P2 and re-arm the broadcast — same invariant.
      fireEvent.click(screen.getByRole('button', { name: 'P2' }));
      expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      const leaderboardCalls = updateDocMock.mock.calls.filter(
        (c) =>
          typeof c[1] === 'object' &&
          c[1] !== null &&
          'liveLeaderboard' in (c[1] as Record<string, unknown>) &&
          Array.isArray((c[1] as { liveLeaderboard: unknown }).liveLeaderboard)
      );
      for (const call of leaderboardCalls) {
        const entries = (call[1] as { liveLeaderboard: unknown[] })
          .liveLeaderboard;
        expect(entries).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a toast when updateAccountPreferences rejects on the Colors toggle', async () => {
    // Start with stored colors OFF so the post-approval branch will issue
    // an updateAccountPreferences write that we can reject.
    authState.quizMonitorColorsEnabled = false;
    // The handler logs the error before toasting; silence it here so the
    // expected rejection doesn't pollute test output.
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    updateAccountPreferences.mockRejectedValueOnce(new Error('write failed'));
    renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });

    showConfirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));

    // The catch handler is async — flush microtasks so the rejection
    // settles before we assert.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast.mock.calls[0][0]).toMatch(
      /Could not save the Colors preference/i
    );
    expect(addToast.mock.calls[0][1]).toBe('error');
    errorSpy.mockRestore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

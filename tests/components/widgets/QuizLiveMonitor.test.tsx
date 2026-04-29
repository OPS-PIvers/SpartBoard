/**
 * Smoke-level coverage for QuizLiveMonitor — the file is ~2400 lines after
 * PR #1449 and previously had zero tests. Focus is the structural pieces
 * the diff introduces: the `RosterToolbar` cluster (period filter / Colors /
 * score-display cycle), the `filteredResponses` narrowing that drives the
 * roster + KPIs, and the leaderboard-broadcast invariant that the filter
 * must NOT touch the student-facing leaderboard.
 *
 * Heavy mocking style mirrors `QuizResults.regenerate.test.tsx`: every hook
 * the component reaches into is stubbed at module-scope so the test stays
 * self-contained.
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
  // PeriodSelector inside the toolbar filters its checkbox list to rosters
  // whose `name` matches one of the session's targeted periods. Default to
  // a roster per period so the selector is exercisable in tests that open
  // it.
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

// Open the roster (so the toolbar with the period filter / Colors / score
// buttons is mounted) and return the matching toolbar buttons.
function openRoster() {
  const rosterToggle = screen.getByText(/^Roster · /).closest('button');
  if (!rosterToggle) throw new Error('Roster toggle not found');
  fireEvent.click(rosterToggle);
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

  it('hides the period-filter button when the assignment targets a single period', () => {
    renderMonitor({
      session: { periodNames: ['Period 1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    openRoster();
    expect(
      screen.queryByRole('button', { name: /Filter by class period/i })
    ).not.toBeInTheDocument();
  });

  it('renders the period-filter button labeled "All Periods" when 2+ periods are targeted', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2', 'P3'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    openRoster();
    const filterBtn = screen.getByRole('button', {
      name: /Filter by class period/i,
    });
    expect(filterBtn).toBeInTheDocument();
    expect(filterBtn).toHaveTextContent('All Periods');
  });

  it('toggling a period off narrows the KPI counts and roster, and updates the filter label', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2'] },
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
    openRoster();
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 2');

    fireEvent.click(
      screen.getByRole('button', { name: /Filter by class period/i })
    );
    // Selector dialog renders one checkbox per period. Untick P2 (it starts
    // selected because the default mirrors the session's targeted periods).
    const checkboxes = screen.getAllByRole('checkbox');
    const p2Box = checkboxes.find((b) =>
      (b as HTMLInputElement).parentElement?.textContent?.includes('P2')
    );
    if (!p2Box) throw new Error('P2 checkbox not found');
    fireEvent.click(p2Box);

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    // Roster row count drops to 1.
    expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');
    // Filter button label flips to "selected/total".
    expect(
      screen.getByRole('button', { name: /Filter by class period/i })
    ).toHaveTextContent('1/2');
  });

  it('cycles the score-display preference percent → count → hidden → percent', async () => {
    const { rerenderSame } = renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    openRoster();
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
    // Click 3: hidden → percent
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

  it('Colors toggle persists the inverted value via updateAccountPreferences', () => {
    renderMonitor({
      session: { periodNames: ['P1'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    openRoster();

    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));

    expect(updateAccountPreferences).toHaveBeenCalledTimes(1);
    expect(updateAccountPreferences).toHaveBeenCalledWith({
      quizMonitorColorsEnabled: false,
    });
  });

  it('shows the empty-state and Clear filter button when the active filter narrows to zero rows', () => {
    renderMonitor({
      session: { periodNames: ['P1', 'P2'] },
      responses: [makeResponse({ pin: '1111', classPeriod: 'P1' })],
    });
    openRoster();

    fireEvent.click(
      screen.getByRole('button', { name: /Filter by class period/i })
    );
    // The selector starts with both ['P1','P2'] selected. Untick P1 so only
    // P2 remains — the lone response is in P1, so filteredResponses → [].
    const checkboxes = screen.getAllByRole('checkbox');
    const p1Box = checkboxes.find((b) =>
      (b as HTMLInputElement).parentElement?.textContent?.includes('P1')
    );
    if (!p1Box) throw new Error('P1 checkbox not found');
    fireEvent.click(p1Box);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

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

      // Initial broadcast — debounced 300ms.
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

      // Now narrow the filter via the UI. Switch to real timers briefly so
      // jsdom event handlers can fire the way fireEvent expects.
      vi.useRealTimers();
      openRoster();
      fireEvent.click(
        screen.getByRole('button', { name: /Filter by class period/i })
      );
      const checkboxes = screen.getAllByRole('checkbox');
      const p2Box = checkboxes.find((b) =>
        (b as HTMLInputElement).parentElement?.textContent?.includes('P2')
      );
      if (!p2Box) throw new Error('P2 checkbox not found');
      fireEvent.click(p2Box);
      fireEvent.click(screen.getByRole('button', { name: /Save/i }));

      // Sanity: the visible roster narrowed to 1 row.
      expect(screen.getByText(/^Roster · /)).toHaveTextContent('Roster · 1');

      // Re-arm fake timers to drive the (potentially) re-fired broadcast.
      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Every leaderboard payload — initial OR post-filter — must contain
      // BOTH responses. The diff explicitly comments on this invariant
      // (filter narrows roster/KPIs only; the student-facing leaderboard
      // stays on the unfiltered `responses`).
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
    openRoster();

    fireEvent.click(screen.getByRole('button', { name: /Colors/i }));

    // The catch handler is async — flush microtasks so the rejection
    // settles before we assert.
    await act(async () => {
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

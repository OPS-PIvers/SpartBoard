/**
 * Smoke-level coverage for the rebuilt QuizLiveMonitor (calm default face):
 * projector safety (scores off by default, on-demand join code), status
 * buckets with inline roster expansion, needs-help pinning (raised hand +
 * stuck heuristic), toolbar toggle/sort/filter persistence via widget
 * config, the period-filter vs leaderboard-broadcast invariant, the live
 * correct-answer lock, and the class-safe Present mode.
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
const addToast = vi.fn();
const showConfirm = vi.fn().mockResolvedValue(false);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: 'test-org' }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

// `useDialog` is globally stubbed in tests/setup.ts but its showConfirm
// resolves true by default, which would fire the END handler on first click.
// Override locally with a resolve-false stub so END is inert unless armed.
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
  formatStudentName: () => '',
}));

vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));

vi.mock('@/utils/quizAudio', () => ({
  playPodiumFanfare: vi.fn(),
  playQuizCompleteCelebration: vi.fn(),
}));

// firebase/firestore is real in this repo but db/auth from `@/config/firebase`
// are globally stubbed in tests/setup.ts. Mock the primitives the monitor
// calls so the leaderboard broadcast effect is observable without a backend.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __doc: _args.slice(1) })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(() => '__DELETE__'),
}));

import * as firestore from 'firebase/firestore';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';
import { PresentMode } from '@/components/widgets/QuizWidget/components/monitor/PresentMode';
import { QuestionDetail } from '@/components/widgets/QuizWidget/components/monitor/QuestionResults';

// ─── Fixture helpers ────────────────────────────────────────────────────────
function fakeTimestamp(ms: number): import('firebase/firestore').Timestamp {
  return {
    toMillis: () => ms,
  } as import('firebase/firestore').Timestamp;
}

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
    _responseKey: `pin-${overrides.classPeriod}-${overrides.pin}`,
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

const noopAsync = () => Promise.resolve();

interface RenderOpts {
  session?: Partial<QuizSession>;
  config?: Partial<QuizConfig>;
  responses?: QuizResponse[];
  rosters?: ClassRoster[];
  onUpdateConfig?: (updates: Partial<QuizConfig>) => void;
  onEnd?: () => Promise<void>;
  onClearHand?: (key: string) => Promise<void>;
}

function renderMonitor(opts: RenderOpts = {}) {
  const session = makeSession(opts.session);
  const config = makeConfig({
    periodNames: session.periodNames,
    ...opts.config,
  });
  const rosters: ClassRoster[] =
    opts.rosters ?? (session.periodNames ?? []).map(makeRoster);
  return render(
    <QuizLiveMonitor
      session={session}
      responses={opts.responses ?? []}
      quizData={makeQuizData()}
      onAdvance={noopAsync}
      onEnd={opts.onEnd ?? noopAsync}
      config={config}
      rosters={rosters}
      onUpdateConfig={opts.onUpdateConfig ?? vi.fn()}
      onClearHand={opts.onClearHand}
    />
  );
}

const openBucket = (label: RegExp) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

describe('QuizLiveMonitor (rebuilt)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the calm default face: buckets with counts, no roster, no join code, no score pills', () => {
    renderMonitor({
      responses: [
        makeResponse({ pin: '1111', classPeriod: 'Period 1' }),
        makeResponse({
          pin: '2222',
          classPeriod: 'Period 1',
          status: 'in-progress',
        }),
        makeResponse({
          pin: '3333',
          classPeriod: 'Period 1',
          status: 'joined',
          answers: [],
        }),
      ],
    });
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    // Roster stays collapsed and the join code is on-demand only.
    expect(screen.queryByText(/PIN 1111/)).not.toBeInTheDocument();
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('expands the tapped bucket inline and collapses it on the second tap', () => {
    renderMonitor({
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    openBucket(/Done/);
    expect(screen.getByText(/PIN 1111/)).toBeInTheDocument();
    openBucket(/Done/);
    expect(screen.queryByText(/PIN 1111/)).not.toBeInTheDocument();
  });

  it('pins needs-help students (raised hand + stuck) above the rest with a Clear action for hands', async () => {
    const onClearHand = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();
    renderMonitor({
      onClearHand,
      responses: [
        makeResponse({
          pin: '1111',
          classPeriod: 'Period 1',
          status: 'in-progress',
          handRaisedAt: fakeTimestamp(now - 60_000),
        }),
        makeResponse({
          pin: '2222',
          classPeriod: 'Period 1',
          status: 'in-progress',
          lastWriteAt: fakeTimestamp(now - 300_000),
        }),
        makeResponse({
          pin: '3333',
          classPeriod: 'Period 1',
          status: 'in-progress',
        }),
      ],
    });
    expect(screen.getByText(/2 need help/)).toBeInTheDocument();
    openBucket(/In progress/);
    expect(screen.getByText(/Raised hand/)).toBeInTheDocument();
    expect(screen.getByText(/No activity/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onClearHand).toHaveBeenCalledWith('pin-Period 1-1111');
  });

  it('keeps scores hidden by default and persists the Scores toggle to widget config', () => {
    const onUpdateConfig = vi.fn();
    renderMonitor({
      onUpdateConfig,
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    openBucket(/Done/);
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scores' }));
    expect(onUpdateConfig).toHaveBeenCalledWith({ monitorShowScores: true });
  });

  it('shows score pills and proficiency tints when the persisted toggles are on', () => {
    renderMonitor({
      config: { monitorShowScores: true, monitorShowProficiency: true },
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    openBucket(/Done/);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('persists sort and filter choices and applies the score filter to the visible list', () => {
    const onUpdateConfig = vi.fn();
    renderMonitor({
      onUpdateConfig,
      config: { monitorFilterBy: 'low' },
      responses: [
        // 100% — filtered out by 'low'.
        makeResponse({ pin: '1111', classPeriod: 'Period 1' }),
        // 0% — wrong answer, passes 'low'.
        makeResponse({
          pin: '2222',
          classPeriod: 'Period 1',
          answers: [{ questionId: 'q1', answer: 'b', answeredAt: 100 }],
        }),
      ],
    });
    openBucket(/Done/);
    expect(screen.queryByText(/PIN 1111/)).not.toBeInTheDocument();
    expect(screen.getByText(/PIN 2222/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: /Sort students/i }), {
      target: { value: 'score' },
    });
    expect(onUpdateConfig).toHaveBeenCalledWith({ monitorSortBy: 'score' });
    fireEvent.change(
      screen.getByRole('combobox', { name: /Filter students/i }),
      { target: { value: 'tabs' } }
    );
    expect(onUpdateConfig).toHaveBeenCalledWith({ monitorFilterBy: 'tabs' });
  });

  it('hides the Tab warnings toggle when the session has tab warnings disabled', () => {
    renderMonitor({
      session: { tabWarningsEnabled: false },
      responses: [makeResponse({ pin: '1111', classPeriod: 'Period 1' })],
    });
    openBucket(/Done/);
    expect(
      screen.queryByRole('button', { name: 'Tab warnings' })
    ).not.toBeInTheDocument();
  });

  it('narrows buckets by period chips but keeps the leaderboard broadcast on the unfiltered set', () => {
    vi.useFakeTimers();
    try {
      const updateDocMock = firestore.updateDoc as unknown as ReturnType<
        typeof vi.fn
      >;
      updateDocMock.mockClear();
      renderMonitor({
        session: { periodNames: ['P1', 'P2'], speedBonusEnabled: true },
        responses: [
          makeResponse({ pin: '1111', classPeriod: 'P1' }),
          makeResponse({ pin: '2222', classPeriod: 'P2' }),
        ],
      });
      // Multi-period default narrows to the first period.
      const doneCounts = screen.getAllByText('1');
      expect(doneCounts.length).toBeGreaterThan(0);

      act(() => {
        vi.advanceTimersByTime(400);
      });
      const leaderboardCall = updateDocMock.mock.calls.find(
        (c) =>
          typeof c[1] === 'object' &&
          c[1] !== null &&
          Array.isArray((c[1] as { liveLeaderboard?: unknown }).liveLeaderboard)
      );
      if (!leaderboardCall) throw new Error('leaderboard broadcast missing');
      expect(
        (leaderboardCall[1] as { liveLeaderboard: unknown[] }).liveLeaderboard
      ).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call onEnd when the Make Inactive confirm is declined', async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    renderMonitor({ onEnd });
    showConfirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /End/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('QuestionDetail correct-answer lock', () => {
  const question = makeQuizData().questions[0];
  const responses = [
    makeResponse({ pin: '1111', classPeriod: 'Period 1' }),
    makeResponse({
      pin: '2222',
      classPeriod: 'Period 1',
      answers: [{ questionId: 'q1', answer: 'b', answeredAt: 100 }],
    }),
  ];

  it('never marks the correct answer while the session is live', () => {
    render(
      <QuestionDetail
        session={makeSession({ status: 'active' })}
        question={question}
        index={0}
        responses={responses}
      />
    );
    expect(
      screen.getByText(
        /Correct answers appear in results after the session ends/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();
  });

  it('marks the correct answer once the session has ended', () => {
    render(
      <QuestionDetail
        session={makeSession({ status: 'ended' })}
        question={question}
        index={0}
        responses={responses}
      />
    );
    expect(
      screen.queryByText(/appear in results after the session ends/i)
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });
});

describe('PresentMode projector safety', () => {
  it('shows code and counts but never student identifiers', () => {
    render(
      <PresentMode
        session={makeSession()}
        currentQ={makeQuizData().questions[0]}
        answered={3}
        doneCount={2}
        total={5}
        onExit={vi.fn()}
      />
    );
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText(/3 of 5 answered/)).toBeInTheDocument();
    expect(screen.queryByText(/PIN /)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

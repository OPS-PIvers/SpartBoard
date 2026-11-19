/** Assigned tab slice 3: the monitor acts on the picked class; Close all leaves the footer. */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ClassRoster,
  PeriodAccess,
  QuizAssignment,
  QuizConfig,
  QuizData,
  QuizSession,
} from '@/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
const addToast = vi.fn();
const setAbsentStudents = vi.fn().mockResolvedValue(undefined);
const showConfirm = vi.fn().mockResolvedValue(false);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: 'test-org' }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast, setAbsentStudents }),
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
    targetRefKeyByStudentUid: new Map(),
    loading: false,
    error: null,
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
const leaderboardBatch = vi.hoisted(() => {
  const batch = {
    update: vi.fn((..._args: unknown[]) => batch),
    set: vi.fn((..._args: unknown[]) => batch),
    delete: vi.fn(() => batch),
    commit: vi.fn(() => Promise.resolve()),
  };
  return batch;
});
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __doc: _args.slice(1) })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(() => '__DELETE__'),
  writeBatch: vi.fn(() => leaderboardBatch),
}));

const classActions = vi.hoisted(() => ({
  openClass: vi.fn(() => Promise.resolve([] as string[])),
  pauseClass: vi.fn(() => Promise.resolve()),
  closeClass: vi.fn(() => Promise.resolve()),
  reopenClass: vi.fn(() => Promise.resolve([] as string[])),
  closeAll: vi.fn(() => Promise.resolve()),
  moveToDone: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useQuizClassActions', () => ({
  useQuizClassActions: () => classActions,
}));

import { MonitorShell } from '@/components/widgets/QuizWidget/components/monitor/MonitorShell';

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

const row = (
  label: string,
  extra: Partial<PeriodAccess> = {}
): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  ...extra,
});

const lifecycle = {
  pauseAssignment: vi.fn(() => Promise.resolve()),
  resumeAssignment: vi.fn(() => Promise.resolve()),
  deactivateAssignment: vi.fn(() => Promise.resolve()),
  reopenAssignment: vi.fn(() => Promise.resolve()),
};

function renderAssigned(opts: {
  periodAccess?: Record<string, PeriodAccess>;
  periodNames: string[];
  status?: QuizSession['status'];
  assignedTab?: boolean;
}) {
  const session = makeSession({
    sessionMode: 'student',
    status: opts.status ?? 'active',
    periodNames: opts.periodNames,
    ...(opts.periodAccess ? { periodAccess: opts.periodAccess } : {}),
  });
  const assignment = {
    id: 'a-1',
    quizId: 'quiz-1',
    quizTitle: 'Sample Quiz',
    teacherUid: 'teacher-1',
    status: opts.status === 'ended' ? 'inactive' : (opts.status ?? 'active'),
    createdAt: 1,
    periodNames: opts.periodNames,
    ...(opts.periodAccess ? { periodAccess: opts.periodAccess } : {}),
  } as unknown as QuizAssignment;
  const rosters: ClassRoster[] = opts.periodNames.map((name) => ({
    id: `roster-${name}`,
    name,
    driveFileId: null,
    studentCount: 0,
    createdAt: 1,
    students: [],
  }));
  return render(
    <MonitorShell
      session={session}
      responses={[]}
      quizData={makeQuizData()}
      onAdvance={() => Promise.resolve()}
      onEnd={() => Promise.resolve()}
      onPause={() => Promise.resolve()}
      onResume={() => Promise.resolve()}
      config={makeConfig({ periodNames: opts.periodNames })}
      rosters={rosters}
      onUpdateConfig={vi.fn()}
      onBack={vi.fn()}
      assessmentOnly
      rosterTargets={{}}
      assignedTab={
        opts.assignedTab === false ? null : { assignment, lifecycle }
      }
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  showConfirm.mockResolvedValue(false);
});

describe('Quiz monitor on the Assigned tab', () => {
  const twoClasses = () => ({
    p1: row('P1', { state: 'open' }),
    p2: row('P2'),
  });

  it('opens on the open class with its own Pause and Close, and drops Close all', () => {
    renderAssigned({ periodAccess: twoClasses(), periodNames: ['P1', 'P2'] });
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('p1');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close P1' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close all/ })).toBeNull();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'P2 · Ready' })
    ).toBeInTheDocument();
  });

  it('opens the class picked in the menu', async () => {
    renderAssigned({ periodAccess: twoClasses(), periodNames: ['P1', 'P2'] });
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'p2' },
    });
    expect(screen.getByText('Ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open for P2' }));
    await waitFor(() =>
      expect(classActions.openClass).toHaveBeenCalledWith('p2')
    );
  });

  it('pauses only the picked class', async () => {
    renderAssigned({ periodAccess: twoClasses(), periodNames: ['P1', 'P2'] });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(classActions.pauseClass).toHaveBeenCalledWith('p1')
    );
  });

  it('closes a class only after the teacher confirms', async () => {
    renderAssigned({ periodAccess: twoClasses(), periodNames: ['P1', 'P2'] });
    fireEvent.click(screen.getByRole('button', { name: 'Close P1' }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    expect(classActions.closeClass).not.toHaveBeenCalled();
    showConfirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close P1' }));
    await waitFor(() =>
      expect(classActions.closeClass).toHaveBeenCalledWith('p1')
    );
  });

  it('shows no class actions beside All classes', () => {
    renderAssigned({ periodAccess: twoClasses(), periodNames: ['P1', 'P2'] });
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: '' },
    });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull();
  });

  it('reopens a closed class', async () => {
    renderAssigned({
      periodAccess: {
        p1: row('P1', { closedAt: 5 }),
        p2: row('P2', { state: 'open' }),
      },
      periodNames: ['P1', 'P2'],
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'p1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen for P1' }));
    await waitFor(() =>
      expect(classActions.reopenClass).toHaveBeenCalledWith('p1')
    );
  });

  it('names no class on a single-class quiz', async () => {
    renderAssigned({ periodNames: ['P1'], status: 'paused' });
    expect(screen.queryByRole('combobox', { name: 'Class' })).toBeNull();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() =>
      expect(classActions.openClass).toHaveBeenCalledWith(null)
    );
    expect(screen.queryByRole('button', { name: /Close all/ })).toBeNull();
  });

  it('keeps More time on a one-class quiz with a close time', () => {
    renderAssigned({
      periodAccess: {
        p1: row('P1', { state: 'open', closeAt: Date.now() + 600_000 }),
      },
      periodNames: ['P1'],
    });
    expect(
      screen.getByRole('button', { name: 'More time for P1' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('keeps Close all and the shared Pause with the flag off', () => {
    renderAssigned({ periodNames: ['P1'], assignedTab: false });
    expect(
      screen.getByRole('button', { name: /Close all/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

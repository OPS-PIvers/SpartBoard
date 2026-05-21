/**
 * Tests for PlcNewQuizAssignmentModal — Task 10 (slim PLC quiz assign).
 *
 * After Task 10:
 *   - The configure step no longer renders a mode picker, toggles, or
 *     gamification controls.
 *   - It renders: class picker + due-date input + behavior summary.
 *   - createAssignment receives sessionMode/sessionOptions/attemptLimit
 *     sourced from getQuizBehavior(pickedQuiz.behavior), NOT from removed
 *     controls.
 *   - dueAt flows into settings when a date is entered.
 *   - PLC linkage (plc.id, plc.name) is still set.
 *
 * Mocking strategy:
 *   - useQuiz: quizzes list with one item carrying a behavior.
 *     loadQuizData returns a fake QuizData.
 *   - useQuizAssignments: createAssignment spy.
 *   - useAuth, useDashboard: stubs.
 *   - Heavy side-effects (Drive sheet, syncedQuizGroups, attachSyncLinkage)
 *     mocked.
 *   - PlcSharePickerModal mocked as a sentinel that immediately calls onPick.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcNewQuizAssignmentModal } from '@/components/plc/PlcNewQuizAssignmentModal';
import type { Plc, ClassRoster, QuizMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateAssignment = vi.fn();
const mockLoadQuizData = vi.fn();
const mockAttachSyncLinkage = vi.fn();
const mockAddToast = vi.fn();

const fakeQuiz: QuizMetadata = {
  id: 'quiz-1',
  title: 'Cell Division',
  driveFileId: 'drive-1',
  questionCount: 5,
  createdAt: 1000,
  updatedAt: 2000,
  behavior: {
    sessionMode: 'auto',
    sessionOptions: {
      tabWarningsEnabled: false,
      showResultToStudent: true,
      showCorrectAnswerToStudent: false,
      showCorrectOnBoard: false,
      speedBonusEnabled: false,
      streakBonusEnabled: false,
      showPodiumBetweenQuestions: false,
      soundEffectsEnabled: false,
      shuffleQuestions: false,
      shuffleAnswerOptions: true,
    },
    attemptLimit: 2,
  },
};

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: vi.fn(() => ({
    quizzes: [fakeQuiz],
    loadQuizData: mockLoadQuizData,
    attachSyncLinkage: mockAttachSyncLinkage,
    isDriveConnected: true,
    saveQuiz: vi.fn(),
    deleteQuiz: vi.fn(),
  })),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: vi.fn(() => ({
    createAssignment: mockCreateAssignment,
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-teacher',
      displayName: 'Ms. Smith',
      email: 'smith@school.edu',
    },
    googleAccessToken: null,
  })),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(() => ({
    addToast: mockAddToast,
    rosters: [] as ClassRoster[],
  })),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  createSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: vi.fn().mockImplementation(() => ({
    createPlcSheetAndShare: vi.fn().mockResolvedValue({ url: '' }),
  })),
}));

vi.mock('@/utils/resolveAssignmentTargets', () => ({
  deriveSessionTargetsFromRosters: vi.fn().mockReturnValue({
    classIds: [],
    rosterIds: [],
    periodNames: [],
    classPeriodByClassId: {},
  }),
}));

vi.mock('@/utils/plc', () => ({
  getPlcMemberEmails: vi.fn().mockReturnValue([]),
  getPlcTeammateEmails: vi.fn().mockReturnValue([]),
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

// Mock PlcSharePickerModal so the "pick" step is skipped — it immediately
// calls onPick with the first quiz's id so we always land in the configure step.
vi.mock('@/components/plc/PlcSharePickerModal', () => ({
  PlcSharePickerModal: vi.fn(
    ({
      onPick,
    }: {
      onPick: (id: string) => void;
      onClose: () => void;
      title?: string;
      subtitle?: string;
      prompt?: string;
      emptyMessage?: string;
      items?: { id: string; title: string; metaLine?: string }[];
    }) => (
      <button data-testid="pick-quiz-btn" onClick={() => onPick('quiz-1')}>
        Pick quiz-1
      </button>
    )
  ),
}));

// Mock PlcNewAssignmentSharingSlot as a simple sentinel.
vi.mock('@/components/plc/PlcNewAssignmentSharingSlot', () => ({
  PlcNewAssignmentSharingSlot: vi.fn(() => (
    <div data-testid="plc-sharing-slot">Sharing slot</div>
  )),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-42',
  name: 'Grade 6 Science',
  leadUid: 'uid-a',
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Helper: render and advance past the picker step
// ---------------------------------------------------------------------------

async function renderAndPickQuiz(props?: {
  onCreated?: (info: { assignmentId: string; quizTitle: string }) => void;
  onClose?: () => void;
}) {
  const onClose = props?.onClose ?? vi.fn();
  const onCreated = props?.onCreated;

  render(
    <PlcNewQuizAssignmentModal
      plc={fakePlc}
      onClose={onClose}
      onCreated={onCreated}
    />
  );

  // Click the picker sentinel to advance to configure step.
  fireEvent.click(screen.getByTestId('pick-quiz-btn'));

  // Give React a tick to update state.
  await act(async () => {});

  return { onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcNewQuizAssignmentModal (Task 10 — slimmed configure step)', () => {
  beforeEach(() => {
    mockCreateAssignment.mockClear();
    mockAddToast.mockClear();
    mockLoadQuizData.mockClear();
    mockAttachSyncLinkage.mockClear();
    mockCreateAssignment.mockResolvedValue({ id: 'assign-new', code: '9999' });
    mockLoadQuizData.mockResolvedValue({
      id: 'quiz-1',
      title: 'Cell Division',
      questions: [],
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('does NOT render a mode picker (Teacher-paced / Auto-progress / Self-paced radio buttons) in configure step', async () => {
    await renderAndPickQuiz();

    expect(
      screen.queryByRole('radio', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /auto-progress/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /self-paced/i })
    ).not.toBeInTheDocument();
  });

  it('does NOT render gamification toggles', async () => {
    await renderAndPickQuiz();

    // Speed bonus, streak bonus, podium, sound effects are gone
    expect(screen.queryByText(/speed bonus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/streak bonus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/podium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sound effects/i)).not.toBeInTheDocument();
  });

  it('does NOT render attempt limit controls', async () => {
    await renderAndPickQuiz();

    expect(screen.queryByText(/attempt limit/i)).not.toBeInTheDocument();
  });

  it('renders a due-date input in configure step', async () => {
    await renderAndPickQuiz();

    expect(screen.getByTestId('plc-assign-due-date')).toBeInTheDocument();
  });

  it('renders the behavior summary from the picked quiz behavior', async () => {
    await renderAndPickQuiz();

    // fakeQuiz.behavior = { sessionMode: 'auto', attemptLimit: 2, shuffleAnswerOptions: true, showResultToStudent: true }
    // Expected: "Auto-progress · 2 attempts · shuffles answers · shows results"
    const summaryEl = screen.getByTestId('plc-quiz-behavior-summary');
    expect(summaryEl).toBeInTheDocument();
    expect(summaryEl.textContent).toMatch(/auto-progress/i);
    expect(summaryEl.textContent).toMatch(/2 attempts/i);
  });

  it('renders a hint about editing behavior in the quiz editor', async () => {
    await renderAndPickQuiz();

    // The behavior panel shows a hint directing the teacher to the quiz editor
    // (no inline editor in the PLC modal — behavior is edited in the QuizWidget).
    expect(screen.getByText(/edit in the quiz editor/i)).toBeInTheDocument();
  });

  it('renders the PLC sharing slot', async () => {
    await renderAndPickQuiz();

    expect(screen.getByTestId('plc-sharing-slot')).toBeInTheDocument();
  });

  it('sources sessionMode/sessionOptions/attemptLimit from getQuizBehavior(pickedQuiz) on submit', async () => {
    await renderAndPickQuiz();

    const confirmBtn = screen.getByRole('button', {
      name: /create assignment/i,
    });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];

    // Must use behavior from fakeQuiz.behavior
    expect(settings.sessionMode).toBe('auto');
    expect(settings.attemptLimit).toBe(2);
    expect(
      (settings.sessionOptions as Record<string, unknown>).showResultToStudent
    ).toBe(true);
  });

  it('passes plc linkage (id + name) into settings on submit', async () => {
    await renderAndPickQuiz();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.plc).toBeDefined();
    expect((settings.plc as Record<string, unknown>).id).toBe(fakePlc.id);
    expect((settings.plc as Record<string, unknown>).name).toBe(fakePlc.name);
  });

  it('forwards dueAt into settings when a date is entered', async () => {
    await renderAndPickQuiz();

    const dueDateInput = screen.getByTestId('plc-assign-due-date');
    fireEvent.change(dueDateInput, { target: { value: '2026-07-01' } });

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.dueAt).toBeDefined();
    expect(typeof settings.dueAt).toBe('number');
    expect(settings.dueAt).toBeGreaterThan(0);
  });

  it('does NOT set dueAt when no date is entered', async () => {
    await renderAndPickQuiz();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.dueAt).toBeUndefined();
  });

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn();
    await renderAndPickQuiz({ onClose });

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

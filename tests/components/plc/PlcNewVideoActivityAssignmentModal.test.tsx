/**
 * Tests for PlcNewVideoActivityAssignmentModal — VA Task 10 parity with
 * PlcNewQuizAssignmentModal.test.tsx (Quiz Task 10).
 *
 * After VA Task 10:
 *   - The configure step no longer renders editable mode/toggle/penalty/
 *     rewind/scoreVisibility/attemptLimit controls.
 *   - It renders: class picker + due-date input + read-only behavior summary.
 *   - createAssignment receives sessionOptions/attemptLimit sourced from
 *     getVideoActivityBehavior(pickedActivity), NOT from removed controls.
 *   - dueAt flows into settings.sessionOptions.dueAt when a date is entered.
 *   - PLC linkage (plc.id, plc.name) is still set.
 *
 * Mocking strategy:
 *   - useVideoActivity: activities list with one item carrying a behavior.
 *     loadActivityData returns fake data.
 *   - useVideoActivityAssignments: createAssignment spy.
 *   - useAuth, useDashboard: stubs.
 *   - Heavy side-effects (Drive sheet, syncedVideoActivityGroups,
 *     attachSyncLinkage) mocked.
 *   - PlcSharePickerModal mocked as a sentinel that immediately calls onPick.
 *   - PlcNewAssignmentSharingSlot mocked as a sentinel.
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

import { PlcNewVideoActivityAssignmentModal } from '@/components/plc/PlcNewVideoActivityAssignmentModal';
import type { Plc, ClassRoster, VideoActivityMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateAssignment = vi.fn();
const mockLoadActivityData = vi.fn();
const mockAttachSyncLinkage = vi.fn();
const mockAddToast = vi.fn();

const fakeActivity: VideoActivityMetadata = {
  id: 'va-1',
  title: 'Cell Division',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
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
      shuffleQuestions: false,
      shuffleAnswerOptions: true,
      rewindOnIncorrectSeconds: 10,
      pointPenaltyOnIncorrect: 0,
      scoreVisibility: 'score-only',
    },
    attemptLimit: 2,
  },
};

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: vi.fn(() => ({
    activities: [fakeActivity],
    loadActivityData: mockLoadActivityData,
    attachSyncLinkage: mockAttachSyncLinkage,
    isDriveConnected: true,
    saveActivity: vi.fn(),
    deleteActivity: vi.fn(),
  })),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: vi.fn(() => ({
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

vi.mock('@/hooks/useSyncedVideoActivityGroups', () => ({
  createSyncedVideoActivityGroup: vi.fn().mockResolvedValue(undefined),
  callLeaveSyncedVideoActivityGroup: vi.fn().mockResolvedValue(undefined),
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

// Mock PlcSharePickerModal so the "pick" step is skipped — immediately
// calls onPick with the first activity's id so we always land in the
// configure step.
vi.mock('@/components/plc/PlcSharePickerModal', () => ({
  PlcSharePickerModal: vi.fn(
    ({
      onPick,
    }: {
      onPick: (id: string) => Promise<void>;
      onClose: () => void;
      title?: string;
      subtitle?: string;
      prompt?: string;
      emptyMessage?: string;
      items?: { id: string; title: string; metaLine?: string }[];
    }) => (
      <button data-testid="pick-activity-btn" onClick={() => onPick('va-1')}>
        Pick va-1
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
  members: {},
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

async function renderAndPickActivity(props?: {
  onCreated?: (info: { assignmentId: string; activityTitle: string }) => void;
  onClose?: () => void;
}) {
  const onClose = props?.onClose ?? vi.fn();
  const onCreated = props?.onCreated;

  render(
    <PlcNewVideoActivityAssignmentModal
      plc={fakePlc}
      onClose={onClose}
      onCreated={onCreated}
    />
  );

  // Click the picker sentinel to advance to configure step.
  fireEvent.click(screen.getByTestId('pick-activity-btn'));

  // Give React a tick to update state.
  await act(async () => {
    await Promise.resolve();
  });

  return { onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcNewVideoActivityAssignmentModal (VA Task 10 — slimmed configure step)', () => {
  beforeEach(() => {
    mockCreateAssignment.mockClear();
    mockAddToast.mockClear();
    mockLoadActivityData.mockClear();
    mockAttachSyncLinkage.mockClear();
    mockCreateAssignment.mockResolvedValue({
      id: 'va-assign-new',
    });
    mockLoadActivityData.mockResolvedValue({
      id: 'va-1',
      title: 'Cell Division',
      youtubeUrl: 'https://youtube.com/watch?v=abc',
      questions: [],
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('does NOT render editable mode controls in configure step', async () => {
    await renderAndPickActivity();

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

  it('does NOT render editable penalty/rewind/scoreVisibility controls', async () => {
    await renderAndPickActivity();

    expect(screen.queryByLabelText(/penalty/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/rewind/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/score visibility/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/attempt limit/i)).not.toBeInTheDocument();
  });

  it('renders a due-date input in configure step', async () => {
    await renderAndPickActivity();

    expect(screen.getByTestId('plc-va-assign-due-date')).toBeInTheDocument();
  });

  it('renders the behavior summary from the picked activity behavior', async () => {
    await renderAndPickActivity();

    // fakeActivity.behavior = { sessionMode: 'auto', attemptLimit: 2, rewind 10s, score only }
    // Expected summary includes: "Auto-progress", "2 attempts", "rewind 10s", "score only"
    const summaryEl = screen.getByTestId('plc-new-va-behavior-summary');
    expect(summaryEl).toBeInTheDocument();
    expect(summaryEl.textContent).toMatch(/auto-progress/i);
    expect(summaryEl.textContent).toMatch(/2 attempts/i);
    expect(summaryEl.textContent).toMatch(/rewind 10s/i);
  });

  it('renders a hint about editing behavior in the activity editor', async () => {
    await renderAndPickActivity();

    expect(
      screen.getByText(/edit in the activity editor/i)
    ).toBeInTheDocument();
  });

  it('renders the PLC sharing slot', async () => {
    await renderAndPickActivity();

    expect(screen.getByTestId('plc-sharing-slot')).toBeInTheDocument();
  });

  it('sources sessionOptions/attemptLimit from getVideoActivityBehavior(pickedActivity) on submit', async () => {
    await renderAndPickActivity();

    const confirmBtn = screen.getByRole('button', {
      name: /create assignment/i,
    });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    // VA createAssignment: (activityRef, settings, initialStatus, ...)
    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];

    // Must use behavior from fakeActivity.behavior
    const sessionOptions = settings.sessionOptions as Record<string, unknown>;
    expect(sessionOptions.attemptLimit).toBe(2);
    expect(sessionOptions.showResultToStudent).toBe(true);
    expect(sessionOptions.rewindOnIncorrectSeconds).toBe(10);
  });

  it('passes plc linkage (id + name) into settings on submit', async () => {
    await renderAndPickActivity();

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

  it('forwards dueAt into sessionOptions.dueAt when a date is entered', async () => {
    await renderAndPickActivity();

    const dueDateInput = screen.getByTestId('plc-va-assign-due-date');
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
    const sessionOptions = settings.sessionOptions as Record<string, unknown>;
    expect(sessionOptions.dueAt).toBeDefined();
    expect(typeof sessionOptions.dueAt).toBe('number');
    expect(sessionOptions.dueAt).toBeGreaterThan(0);
  });

  it('does NOT set sessionOptions.dueAt when no date is entered', async () => {
    await renderAndPickActivity();

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
    const sessionOptions = settings.sessionOptions as Record<string, unknown>;
    // dueAt should be absent (undefined) when no date is entered
    expect(sessionOptions.dueAt).toBeUndefined();
  });

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn();
    await renderAndPickActivity({ onClose });

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

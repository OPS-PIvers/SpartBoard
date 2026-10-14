/**
 * Tests for PlcNewVideoActivityAssignmentModal on the assign stepper.
 *
 * Mocking strategy:
 *   - useVideoActivity: activities list with one item carrying a behavior.
 *     loadActivityData returns fake data.
 *   - useVideoActivityAssignments: createAssignment spy.
 *   - useAuth, useDashboard: stubs.
 *   - Heavy side-effects (Drive sheet, syncedVideoActivityGroups,
 *     attachSyncLinkage) mocked.
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

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
const mockUpdateDoc = vi.fn();
const mockCommit = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ path: _args.slice(1).join('/') })),
  writeBatch: () => ({ update: mockUpdateDoc, commit: mockCommit }),
}));
const mockMirror = vi.fn((..._args: unknown[]): void => undefined);
vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  mirrorPlcAssignmentStatus: (...args: unknown[]): void => {
    mockMirror(...args);
  },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-teacher',
      displayName: 'Ms. Smith',
      email: 'smith@school.edu',
    },
    googleAccessToken: null,
    // Path B: sheet auto-create now gates on ensureGoogleScope. Resolve null to
    // preserve the "no token → skip sheet creation" behavior these tests assert.
    ensureGoogleScope: vi.fn().mockResolvedValue(null),
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

describe('PlcNewVideoActivityAssignmentModal — assign stepper', () => {
  beforeEach(() => {
    mockCreateAssignment.mockReset();
    mockCreateAssignment.mockResolvedValue({ id: 'asg-1' });
    mockLoadActivityData.mockResolvedValue({
      id: 'va-1',
      title: 'Cell Division',
      youtubeUrl: 'https://youtube.com/watch?v=abc',
      questions: [],
    });
    mockUpdateDoc.mockClear();
    mockCommit.mockClear();
    mockMirror.mockClear();
    mockAddToast.mockClear();
    mockAttachSyncLinkage.mockClear();
  });

  it('shows Classes, When and a fixed Sharing step with no name field', async () => {
    await renderAndPickActivity();
    expect(screen.getByRole('button', { name: /^1Classes/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2When/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^3SharingShared with Grade 6/ })
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText(/assignment name/i)).toBeNull();
  });

  it('creates it paused, then opens it with its window in one batch', async () => {
    await renderAndPickActivity();
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));
    await waitFor(() => expect(mockCreateAssignment).toHaveBeenCalled());
    const [, settings, status] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      { className: string; plc: { id: string } },
      string,
    ];
    expect(status).toBe('paused');
    expect(settings.className).toBe('Cell Division');
    expect(settings.plc).toMatchObject({ id: 'plc-42' });
    await waitFor(() => expect(mockCommit).toHaveBeenCalledOnce());
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    const fields = mockUpdateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(fields.status).toBe('active');
    expect(typeof fields.openAt).toBe('number');
    expect(typeof fields.closeAt).toBe('number');
    expect(mockMirror).toHaveBeenCalledWith('plc-42', 'asg-1', 'active');
  });

  it('stays paused and reports the error when opening fails', async () => {
    mockCommit.mockRejectedValueOnce(new Error('offline'));
    await renderAndPickActivity();
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));
    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('offline', 'error')
    );
    expect(mockMirror).not.toHaveBeenCalled();
  });

  it("sources sessionOptions/attemptLimit from the picked activity's behavior on submit", async () => {
    await renderAndPickActivity();

    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));

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

    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));

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

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn();
    await renderAndPickActivity({ onClose });

    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

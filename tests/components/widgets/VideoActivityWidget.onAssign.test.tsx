/**
 * M17 §5 B3 — VideoActivityWidget's real `onAssign` wiring (not the
 * pure-composition VideoActivityManager.assign.test.tsx). Exercises the
 * actual handler passed to <VideoActivityManager onAssign={...}> for the
 * canonical rules unified across the B3 PRs:
 *   - the client never writes `targetMode`/`targetStudents` to the
 *     assignment doc — `setAssignmentTargetsV1` is the sole writer
 *   - the CF is called ONLY when `targetMode === 'students'` — a
 *     class-wide assignment with a Schedule window makes zero CF calls
 *   - on CF failure, a clear "created but targeting failed" toast with a
 *     retry action is shown instead of the default success toast
 *   - on CF success, `targetSkippedCount` (a plain number) is persisted
 *     onto the teacher's own assignment doc
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { httpsCallable } from 'firebase/functions';

import { VideoActivityWidget } from '@/components/widgets/VideoActivityWidget/Widget';
import type {
  WidgetData,
  VideoActivityMetadata,
  VideoActivityConfig,
} from '@/types';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';

// ---------------------------------------------------------------------------
// Firebase mocks — capture writes/CF calls instead of hitting real Firestore.
// ---------------------------------------------------------------------------

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: false,
}));

const mockSetDoc = vi.fn(
  (..._args: unknown[]): Promise<void> => Promise.resolve()
);
const mockUpdateDoc = vi.fn(
  (..._args: unknown[]): Promise<void> => Promise.resolve()
);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __mockDocRefArgs: _args })),
  getDoc: vi.fn().mockResolvedValue({
    exists: (): boolean => false,
    data: (): undefined => undefined,
  }),
  setDoc: (...args: unknown[]): Promise<void> => mockSetDoc(...args),
  updateDoc: (...args: unknown[]): Promise<void> => mockUpdateDoc(...args),
}));

const mockCallable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

// ---------------------------------------------------------------------------
// Heavy hook stubs
// ---------------------------------------------------------------------------

const addToast = vi.fn();
const updateWidget = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget, addToast, rosters: [] }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'teacher-1',
      displayName: 'Test Teacher',
      email: 't@example.com',
    },
    googleAccessToken: 'token',
    isAdmin: false,
    canAccessFeature: () => false,
    featurePermissions: [],
    getAssignmentMode: () => 'graded',
  }),
}));

const ACTIVITY: VideoActivityMetadata = {
  id: 'va-1',
  title: 'Cell Division',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  driveFileId: 'drive-1',
  questionCount: 4,
  createdAt: 1000,
  updatedAt: 2000,
};

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [ACTIVITY],
    loading: false,
    error: null,
    saveActivity: vi.fn(),
    loadActivityData: vi.fn().mockResolvedValue({
      id: 'va-1',
      title: 'Cell Division',
      youtubeUrl: 'https://youtube.com/watch?v=abc',
      questions: [],
    }),
    deleteActivity: vi.fn(),
    duplicateActivity: vi.fn(),
    attachSyncLinkage: vi.fn(),
    createTemplateSheet: vi.fn(),
    isDriveConnected: true,
  }),
}));

const createSession = vi.fn().mockResolvedValue('session-1');
vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionTeacher: () => ({
    createSession,
    responses: [],
    liveSession: null,
    subscribeToSession: vi.fn(),
    unsubscribeFromSession: vi.fn(),
    unlockStudentAttempt: vi.fn(),
  }),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    assignments: [],
    loading: false,
    pauseAssignment: vi.fn(),
    resumeAssignment: vi.fn(),
    deactivateAssignment: vi.fn(),
    reactivateAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
    shareAssignment: vi.fn(),
    publishAssignmentScores: vi.fn(),
    unpublishAssignmentScores: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

// Stub AssignClassPicker so roster selection is driven by checkboxes, same as
// VideoActivityManager.assign.test.tsx.
vi.mock('@/components/common/AssignClassPicker', () => ({
  AssignClassPicker: () => <div data-testid="assign-class-picker" />,
}));

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});

function makeWidget(): WidgetData {
  return {
    id: 'widget-1',
    type: 'videoActivity',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: {} as VideoActivityConfig,
  } as unknown as WidgetData;
}

async function openAssignModal() {
  render(<VideoActivityWidget widget={makeWidget()} />);
  const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
  fireEvent.click(assignBtn);
  return screen.findByRole('dialog', { name: /cell division/i });
}

function confirmAssign(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
}

function enableIndividualTargeting(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByText(/\+ individual students & overrides/i)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  createSession.mockResolvedValue('session-1');
});

describe('VideoActivityWidget onAssign — class-wide flow (§3a-G)', () => {
  it('never calls setAssignmentTargetsV1 for a class-wide assignment', async () => {
    const dialog = await openAssignModal();
    confirmAssign(dialog);

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('never calls setAssignmentTargetsV1 even when a due-date (Schedule window) is set', async () => {
    const dialog = await openAssignModal();
    fireEvent.change(within(dialog).getByTestId('va-assign-due-date'), {
      target: { value: '2026-06-01' },
    });
    confirmAssign(dialog);

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('writes the assignment doc without targetMode or targetStudents', async () => {
    const dialog = await openAssignModal();
    confirmAssign(dialog);

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const assignmentDoc = mockSetDoc.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect('targetMode' in assignmentDoc).toBe(false);
    expect('targetStudents' in assignmentDoc).toBe(false);
  });
});

describe('VideoActivityWidget onAssign — individual targeting (§2a division of labor)', () => {
  it('calls setAssignmentTargetsV1 when targetMode is students', async () => {
    mockCallable.mockResolvedValue({ data: { skipped: [] } });
    const dialog = await openAssignModal();
    enableIndividualTargeting(dialog);
    confirmAssign(dialog);

    await waitFor(() =>
      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        'setAssignmentTargetsV1'
      )
    );
    expect(mockCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: 'session-1',
        kind: 'video-activity',
      })
    );
  });

  it('persists a plain-number targetSkippedCount onto the assignment doc on CF success', async () => {
    mockCallable.mockResolvedValue({
      data: {
        skipped: [{ ref: { kind: 'test' }, reason: 'not-in-teacher-classes' }],
      },
    });
    const dialog = await openAssignModal();
    enableIndividualTargeting(dialog);
    confirmAssign(dialog);

    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        { targetSkippedCount: 1 },
        { merge: true }
      )
    );
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/1 student could not be targeted/i),
      'info'
    );
  });

  it('on CF failure, shows a clear error toast with a retry action instead of a silent success', async () => {
    mockCallable.mockRejectedValueOnce(new Error('network blip'));
    const dialog = await openAssignModal();
    enableIndividualTargeting(dialog);
    confirmAssign(dialog);

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(
          /assignment created, but individual student targeting failed/i
        ),
        'error',
        expect.objectContaining({
          label: 'Retry',
          onClick: expect.any(Function),
        })
      )
    );
    // The session/assignment doc creation itself must still have succeeded.
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('retry action re-invokes setAssignmentTargetsV1', async () => {
    mockCallable
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ data: { skipped: [] } });
    const dialog = await openAssignModal();
    enableIndividualTargeting(dialog);
    confirmAssign(dialog);

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const errorCall = addToast.mock.calls.find((c) => c[1] === 'error');
    expect(errorCall).toBeTruthy();
    const retryAction = errorCall?.[2] as { onClick: () => void };
    retryAction.onClick();

    await waitFor(() => expect(mockCallable).toHaveBeenCalledTimes(2));
  });
});

describe('VideoActivityWidget onAssign — default targeting value', () => {
  it('EMPTY_ASSIGN_TARGETING_VALUE defaults to class mode (sanity check for the gate)', () => {
    expect(EMPTY_ASSIGN_TARGETING_VALUE.targetMode).toBe('class');
  });
});

/**
 * Tests for VideoActivityManager's assign stepper and archive rows.
 *
 * Mocking strategy:
 *   - Heavy hooks (useSessionViewCount, useFolders, useAuth, useDialog) are
 *     stubbed to return minimal safe values.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';

import { VideoActivityManager } from '@/components/widgets/VideoActivityWidget/components/VideoActivityManager';
import type {
  ClassRoster,
  VideoActivityAssignment,
  VideoActivityMetadata,
} from '@/types';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';

// ---------------------------------------------------------------------------
// Heavy hook stubs
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
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

vi.mock('@/hooks/useClaudeReview', () => ({
  useClaudeReview: () => ({
    needsReview: () => false,
    badge: () => null,
    confirmUse: () => Promise.resolve(true),
    markReviewed: () => undefined,
    whenReviewed: (_item: unknown, go: () => void) => go(),
  }),
}));
const liveFlag = { enabled: false };
const lastPacing = {
  lastUsed: null as 'student' | 'teacher' | null,
  save: vi.fn(),
};
vi.mock('@/hooks/useLastVideoAssignPacing', () => ({
  useLastVideoAssignPacing: () => ({ ...lastPacing, loaded: true }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
    canAccessFeature: (id: string) =>
      id === 'video-activity-live' ? liveFlag.enabled : true,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn((_: unknown, opts?: { onConfirm?: () => void }) => {
      opts?.onConfirm?.();
      return Promise.resolve(true);
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROSTERS: ClassRoster[] = [
  {
    id: 'r1',
    name: 'Period 1',
    students: [],
    source: 'manual',
  } as unknown as ClassRoster,
];

function makeVaMeta(
  overrides: Partial<VideoActivityMetadata> = {}
): VideoActivityMetadata {
  return {
    id: 'va-1',
    title: 'Cell Division',
    youtubeUrl: 'https://youtube.com/watch?v=abc',
    driveFileId: 'drive-1',
    questionCount: 4,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

/**
 * Render VideoActivityManager at the library tab with one activity so the
 * Assign button is visible. Returns the `onAssign` spy.
 */
function renderManager(
  activityMeta: VideoActivityMetadata,
  onAssignFn: ReturnType<typeof vi.fn> = vi.fn(),
  assignments: VideoActivityAssignment[] = []
) {
  const onAssign = onAssignFn as (
    activity: VideoActivityMetadata,
    rosterIds: string[],
    dueAt: number | null,
    targeting: AssignTargetingValue,
    sessionMode: 'student' | 'teacher'
  ) => Promise<string>;
  render(
    <VideoActivityManager
      activities={[activityMeta]}
      loading={false}
      error={null}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onAssign={onAssign}
      onResults={vi.fn()}
      rosters={ROSTERS}
      assignments={assignments}
      assignmentsLoading={false}
    />
  );
  return { onAssign: onAssignFn };
}

function makeVaAssignment(
  overrides: Partial<VideoActivityAssignment> = {}
): VideoActivityAssignment {
  return {
    id: 'assign-1',
    activityId: 'va-1',
    activityTitle: 'Cell Division',
    activityDriveFileId: 'drive-1',
    teacherUid: 'teacher-1',
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as unknown as VideoActivityAssignment;
}

describe('VideoActivityManager — targetSkippedCount row marker (M17 E2 F3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "N skipped" marker on an active assignment card', async () => {
    renderManager(makeVaMeta(), vi.fn(), [
      makeVaAssignment({ targetSkippedCount: 2 }),
    ]);

    fireEvent.click(await screen.findByRole('tab', { name: /in progress/i }));

    expect(await screen.findByText('2 skipped')).toBeInTheDocument();
  });

  it('does not render the marker when targetSkippedCount is 0 or absent', async () => {
    renderManager(makeVaMeta(), vi.fn(), [
      makeVaAssignment({ targetSkippedCount: 0 }),
    ]);

    fireEvent.click(await screen.findByRole('tab', { name: /in progress/i }));

    await screen.findByText('Cell Division');
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
  });
});

describe('VideoActivityManager assign stepper — make-up prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveFlag.enabled = true;
  });

  const pending = {
    key: 'k1',
    activityId: 'va-1',
    rosterIds: ['r1'],
    targetStudents: [{ kind: 'classlink' as const, sourcedId: 'sid-b' }],
  };

  const MAKEUP_ROSTERS: ClassRoster[] = [
    {
      ...ROSTERS[0],
      students: [
        { id: 'st-b', firstName: 'Bo', lastName: 'B', pin: '02', classLinkSourcedId: 'sid-b' },
      ],
    } as ClassRoster,
  ];

  function renderWithPending(
    onAssign = vi.fn().mockResolvedValue('s-2'),
    onPendingAssignDone = vi.fn()
  ) {
    render(
      <VideoActivityManager
        activities={[makeVaMeta()]}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAssign={onAssign}
        rosters={MAKEUP_ROSTERS}
        assignments={[]}
        assignmentsLoading={false}
        pendingAssign={pending}
        onPendingAssignDone={onPendingAssignDone}
      />
    );
    return { onAssign, onPendingAssignDone };
  }

  it('opens self-paced with the class and the absent students picked', async () => {
    const { onAssign, onPendingAssignDone } = renderWithPending();
    const dialog = await screen.findByRole('dialog', {
      name: /cell division/i,
    });
    expect(
      within(dialog).getByRole('radio', { name: /self-paced/i })
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [, rosterIds, , , mode, extras] = onAssign.mock.calls[0];
    expect(rosterIds).toEqual(['r1']);
    expect(mode).toBe('student');
    expect(extras.classes.studentsByClass.r1).toEqual([
      expect.objectContaining({ sourcedId: 'sid-b' }),
    ]);
    expect(onPendingAssignDone).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests — delete from the row menu confirms in one click
// ---------------------------------------------------------------------------

describe('VideoActivityManager — delete in progress assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes after one menu click and the confirm dialog', async () => {
    const onArchiveDelete = vi.fn(() => Promise.resolve());
    render(
      <VideoActivityManager
        activities={[makeVaMeta()]}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAssign={vi.fn()}
        onResults={vi.fn()}
          rosters={ROSTERS}
        assignments={[makeVaAssignment()]}
        assignmentsLoading={false}
        onArchiveDelete={onArchiveDelete}
      />
    );

    fireEvent.click(await screen.findByRole('tab', { name: /in progress/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'More actions' })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => expect(onArchiveDelete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Confirm delete')).not.toBeInTheDocument();
  });
});

describe('VideoActivityManager assign stepper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveFlag.enabled = true;
    lastPacing.lastUsed = null;
  });
  afterEach(() => {
    liveFlag.enabled = false;
  });

  it('opens the stepper with the pacing switch', async () => {
    renderManager(makeVaMeta());
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('radiogroup', { name: 'Pacing' })
    ).toBeInTheDocument();
  });

  it('opens on the last-used pacing and saves the pacing on assign', async () => {
    lastPacing.lastUsed = 'teacher';
    const onAssign = vi.fn().mockResolvedValue('session-1');
    renderManager(makeVaMeta(), onAssign);
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Start live/ }));
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    const [, rosterIds, dueAt, , mode, extras] = onAssign.mock.calls[0];
    expect(rosterIds).toEqual([]);
    expect(dueAt).toBeNull();
    expect(mode).toBe('teacher');
    expect(extras).toMatchObject({ manualStart: false, plc: null });
    expect(lastPacing.save).toHaveBeenCalledWith('teacher');
  });

  it('keeps the dialog open and shows the error when assigning fails', async () => {
    const onAssign = vi.fn().mockRejectedValue(new Error('No questions yet'));
    renderManager(makeVaMeta(), onAssign);
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Assign$/ }));
    expect(await screen.findByText('No questions yet')).toBeInTheDocument();
    expect(lastPacing.save).not.toHaveBeenCalled();
  });
});

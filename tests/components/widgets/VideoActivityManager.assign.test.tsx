/**
 * Tests for the slimmed VA Assign flow — VA Task 9 parity with Quiz Task 9.
 *
 * After the change the standalone VideoActivity AssignModal no longer
 * contains editable mode/toggle/penalty/scoreVisibility controls. Instead
 * it shows:
 *   - The class/period picker (AssignClassPicker)
 *   - A due-date date input
 *   - A read-only behavior summary derived from getVideoActivityBehavior(meta)
 *   - An "Edit in activity" affordance
 *
 * The `onAssign` callback must receive:
 *   - `meta`      as first arg (VideoActivityMetadata)
 *   - `rosterIds` from the picker
 *   - `dueAt`     from the due-date input (number | null)
 *   — behavior values (sessionOptions, attemptLimit) are sourced from
 *     `getVideoActivityBehavior(meta)` in the Widget handler, not passed
 *     through `onAssign`.
 *
 * Mocking strategy:
 *   - Heavy hooks (useSessionViewCount, useFolders, useAuth, useDialog) are
 *     stubbed to return minimal safe values.
 *   - AssignClassPicker: stubbed so roster selection is driven by checkboxes.
 *   - AssignModal: rendered real (we test end-to-end).
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

import { VideoActivityManager } from '@/components/widgets/VideoActivityWidget/components/VideoActivityManager';
import type {
  ClassRoster,
  VideoActivityAssignment,
  VideoActivityMetadata,
  VideoActivityBehaviorSettings,
  VideoActivitySessionSettings,
} from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';

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

// Stub AssignClassPicker so roster selection is driven by checkboxes.
vi.mock('@/components/common/AssignClassPicker', () => ({
  AssignClassPicker: ({
    rosters,
    value,
    onChange,
  }: {
    rosters: ClassRoster[];
    value: { rosterIds: string[] };
    onChange: (next: { rosterIds: string[] }) => void;
  }) => (
    <div data-testid="assign-class-picker">
      {rosters.map((r) => (
        <label key={r.id}>
          <input
            type="checkbox"
            data-testid={`roster-${r.id}`}
            checked={value.rosterIds.includes(r.id)}
            onChange={(e) =>
              onChange({
                rosterIds: e.target.checked
                  ? [...value.rosterIds, r.id]
                  : value.rosterIds.filter((id) => id !== r.id),
              })
            }
          />
          {r.name}
        </label>
      ))}
    </div>
  ),
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

const DEFAULT_SESSION_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: false,
  allowSkipping: true,
};

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
      defaultSessionSettings={DEFAULT_SESSION_SETTINGS}
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

// ---------------------------------------------------------------------------
// Tests — modal content assertions
// ---------------------------------------------------------------------------

describe('VideoActivityManager assign modal — slimmed flow (VA Task 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the assign modal when Assign is clicked for an activity', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(
      screen.getByRole('dialog', { name: /cell division/i })
    ).toBeInTheDocument();
  });

  it('does NOT render editable session-mode controls in the assign modal', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    // No mode buttons (teacher/auto/self-paced radio or toggle buttons)
    expect(
      screen.queryByRole('button', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /auto-progress/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /self-paced/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Session Mode')).not.toBeInTheDocument();
  });

  it('does NOT render editable penalty/rewind/scoreVisibility controls', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(screen.queryByLabelText(/penalty/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/rewind/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/score visibility/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/attempt limit/i)).not.toBeInTheDocument();
  });

  it('renders a read-only behavior summary in the assign modal', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(screen.getByTestId('va-behavior-summary')).toBeInTheDocument();
  });

  it('renders an "Edit in activity" button in the assign modal', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(
      screen.getByRole('button', { name: /edit in activity/i })
    ).toBeInTheDocument();
  });

  it('renders a due-date input in the assign modal', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(screen.getByTestId('va-assign-due-date')).toBeInTheDocument();
  });

  it('renders the class/period picker in the assign modal', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    expect(screen.getByTestId('assign-class-picker')).toBeInTheDocument();
  });

  it('behavior summary reflects default behavior and names no session mode', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    const summary = screen.getByTestId('va-behavior-summary');
    expect(summary.textContent).toMatch(/1 attempt/i);
    expect(summary.textContent).not.toMatch(/paced/i);
  });

  it('behavior summary reflects custom behavior set on the activity', async () => {
    const customBehavior: VideoActivityBehaviorSettings = {
      ...DEFAULT_VA_BEHAVIOR,
      attemptLimit: 3,
    };
    renderManager(makeVaMeta({ behavior: customBehavior }));
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    const summary = screen.getByTestId('va-behavior-summary');
    expect(summary.textContent).toMatch(/3 attempts/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — onAssign callback composition
// ---------------------------------------------------------------------------

describe('VideoActivityManager onAssign — behavior sourced from activity, dueAt from input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onAssign with dueAt=null when no due date is entered', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    const meta = makeVaMeta();
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    // Signature: (meta, rosterIds, dueAt)
    const dueAt = args[2];
    expect(dueAt).toBeNull();
  });

  it('calls onAssign with dueAt as epoch ms when a date is entered', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    const meta = makeVaMeta();
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    const dueDateInput = screen.getByTestId('va-assign-due-date');
    fireEvent.change(dueDateInput, { target: { value: '2026-06-01' } });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    const dueAt = args[2];
    expect(typeof dueAt).toBe('number');
    expect(dueAt).toBeGreaterThan(0);
    // Pin the concrete local epoch (June 1 2026 at 23:59 local time) and
    // explicitly rule out the old UTC-midnight value that caused off-by-one dates.
    expect(dueAt).toBe(new Date(2026, 5, 1, 23, 59, 0, 0).getTime());
    expect(dueAt).not.toBe(new Date('2026-06-01').getTime());
  });

  it('calls onAssign with the activity meta as the first argument', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    const meta = makeVaMeta({ id: 'va-42', title: 'Cell Division' });
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [calledMeta] = onAssign.mock.calls[0];
    expect(calledMeta).toMatchObject({ id: 'va-42' });
  });

  it('calls onAssign with selected roster ids from the picker', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    const meta = makeVaMeta();
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    // Select roster r1
    const rosterCheck = screen.getByTestId('roster-r1');
    fireEvent.click(rosterCheck);

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    // Signature: (meta, rosterIds, dueAt)
    const rosterIds = args[1];
    expect(rosterIds).toContain('r1');
  });

  it('onAssign is called with exactly 5 args (meta, rosterIds, dueAt, targeting, sessionMode) — no behavior args', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    const customBehavior: VideoActivityBehaviorSettings = {
      ...DEFAULT_VA_BEHAVIOR,
      sessionMode: 'student',
      attemptLimit: 2,
    };
    const meta = makeVaMeta({ behavior: customBehavior });
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    // 5 args: meta, rosterIds, dueAt, targeting, pacing — NO sessionOptions/attemptLimit
    expect(onAssign.mock.calls[0]).toHaveLength(5);
    expect(onAssign.mock.calls[0][4]).toBe('student');
    // The meta carries the behavior so the Widget handler can call
    // getVideoActivityBehavior(calledMeta) to source the behavior.
    const calledMeta = onAssign.mock.calls[0][0] as VideoActivityMetadata;
    expect(calledMeta.behavior).toMatchObject({
      sessionMode: 'student',
      attemptLimit: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — M17 §5 B3: individual targeting section
// ---------------------------------------------------------------------------

describe('VideoActivityManager assign modal — individual targeting (M17 B3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('§3a-G: default (class-wide) flow shows only the collapsed affordance, not the picker/overrides', async () => {
    renderManager(makeVaMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    expect(screen.getByText(/edit or add modifications/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /choose students/i })
    ).not.toBeInTheDocument();
  });

  it('calls onAssign with targetMode "class" and no students by default', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    renderManager(makeVaMeta(), onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const targeting = onAssign.mock.calls[0][3] as AssignTargetingValue;
    expect(targeting.targetMode).toBe('class');
    expect(targeting.targetStudents).toEqual([]);
  });

  it('expanding "Edit or add modifications" keeps the assignment class-wide', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    renderManager(makeVaMeta(), onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    fireEvent.click(screen.getByText(/edit or add modifications/i));
    expect(
      screen.queryByRole('button', { name: /choose students/i })
    ).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const targeting = onAssign.mock.calls[0][3] as AssignTargetingValue;
    expect(targeting.targetMode).toBe('class');
  });

  it('mirrors the legacy due-date input onto targeting.dueAt', async () => {
    const onAssign = vi.fn().mockResolvedValue('session-1');
    renderManager(makeVaMeta(), onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });

    fireEvent.change(screen.getByTestId('va-assign-due-date'), {
      target: { value: '2026-06-01' },
    });

    const dialog = screen.getByRole('dialog', { name: /cell division/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [, , dueAt, targeting] = onAssign.mock.calls[0] as [
      unknown,
      unknown,
      number | null,
      AssignTargetingValue,
    ];
    expect(targeting.dueAt).toBe(dueAt);
  });
});

// ---------------------------------------------------------------------------
// Tests — M17 E2 F3: "N skipped" row marker (parity with Quiz/GL/MiniApp)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests — teacher-paced (live) pacing choice (VA_TEACHER_PACED §5.1)
// ---------------------------------------------------------------------------

describe('VideoActivityManager assign modal — live pacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveFlag.enabled = false;
  });

  async function openModal(onAssign = vi.fn().mockResolvedValue('s-1')) {
    renderManager(makeVaMeta(), onAssign);
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    const dialog = await screen.findByRole('dialog', {
      name: /cell division/i,
    });
    return { dialog, onAssign };
  }

  it('hides the pacing choice without the flag', async () => {
    const { dialog } = await openModal();
    expect(
      within(dialog).queryByRole('radio', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
  });

  it('defaults to self-paced with the flag', async () => {
    liveFlag.enabled = true;
    const { dialog } = await openModal();
    expect(
      within(dialog).getByRole('radio', { name: /self-paced/i })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      within(dialog).queryByTestId('va-assign-live-note')
    ).not.toBeInTheDocument();
  });

  it('live assigns one class, no due date, and passes teacher pacing', async () => {
    liveFlag.enabled = true;
    const { dialog, onAssign } = await openModal();
    fireEvent.click(within(dialog).getByTestId('roster-r1'));
    fireEvent.change(within(dialog).getByTestId('va-assign-due-date'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /teacher-paced/i })
    );
    expect(
      within(dialog).getByTestId('va-assign-live-note')
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('va-assign-due-date')).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: /start live/i })
    );

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [, rosterIds, dueAt, targeting, mode] = onAssign.mock.calls[0];
    expect(rosterIds).toEqual(['r1']);
    expect(dueAt).toBeNull();
    expect(targeting).toEqual(EMPTY_ASSIGN_TARGETING_VALUE);
    expect(mode).toBe('teacher');
  });
});

describe('VideoActivityManager assign modal — make-up prefill', () => {
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
        defaultSessionSettings={DEFAULT_SESSION_SETTINGS}
        rosters={ROSTERS}
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
    expect(within(dialog).getByTestId('roster-r1')).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: /self-paced/i })
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [, rosterIds, , targeting, mode] = onAssign.mock.calls[0];
    expect(rosterIds).toEqual(['r1']);
    expect((targeting as AssignTargetingValue).targetMode).toBe('students');
    expect((targeting as AssignTargetingValue).targetStudents).toEqual(
      pending.targetStudents
    );
    expect(mode).toBe('student');
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
        defaultSessionSettings={DEFAULT_SESSION_SETTINGS}
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

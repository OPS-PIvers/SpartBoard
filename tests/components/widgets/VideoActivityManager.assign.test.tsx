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
  VideoActivityMetadata,
  VideoActivityBehaviorSettings,
  VideoActivitySessionSettings,
} from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import { dueInputsToEpoch, DEFAULT_DUE_TIME } from '@/utils/localDate';

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

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
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
  onAssignFn: ReturnType<typeof vi.fn> = vi.fn()
) {
  const onAssign = onAssignFn as (
    activity: VideoActivityMetadata,
    rosterIds: string[],
    dueAt: number | null
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
      assignments={[]}
      assignmentsLoading={false}
    />
  );
  return { onAssign: onAssignFn };
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

  it('behavior summary reflects default behavior (teacher-paced) when no behavior is set', async () => {
    renderManager(makeVaMeta()); // no behavior → DEFAULT_VA_BEHAVIOR (teacher)
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    const summary = screen.getByTestId('va-behavior-summary');
    expect(summary.textContent).toMatch(/teacher.paced/i);
  });

  it('behavior summary reflects custom behavior set on the activity', async () => {
    const customBehavior: VideoActivityBehaviorSettings = {
      ...DEFAULT_VA_BEHAVIOR,
      sessionMode: 'student',
      attemptLimit: 3,
    };
    renderManager(makeVaMeta({ behavior: customBehavior }));
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    await screen.findByRole('dialog', { name: /cell division/i });
    const summary = screen.getByTestId('va-behavior-summary');
    expect(summary.textContent).toMatch(/self.paced/i);
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
    expect(dueAt).toBe(dueInputsToEpoch('2026-06-01', DEFAULT_DUE_TIME));
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

  it('onAssign is called with exactly 3 args (meta, rosterIds, dueAt) — no behavior args', async () => {
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
    // 3 args: meta, rosterIds, dueAt — NO mode/sessionOptions/attemptLimit
    expect(onAssign.mock.calls[0]).toHaveLength(3);
    // The meta carries the behavior so the Widget handler can call
    // getVideoActivityBehavior(calledMeta) to source the behavior.
    const calledMeta = onAssign.mock.calls[0][0] as VideoActivityMetadata;
    expect(calledMeta.behavior).toMatchObject({
      sessionMode: 'student',
      attemptLimit: 2,
    });
  });
});

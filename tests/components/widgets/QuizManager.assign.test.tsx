/**
 * Tests for the slimmed Quiz Assign flow — Task 9.
 *
 * Goal: After the change the standalone Quiz AssignModal no longer contains
 * a mode picker, integrity/feedback/randomization toggles, gamification
 * controls, or an attempt-limit control.  Instead it shows:
 *   - The class/period picker (AssignClassPicker)
 *   - A due-date date input
 *   - A read-only behavior summary derived from getQuizBehavior(meta)
 *   - An "Edit in quiz" affordance
 *   - The PLC "Share with PLC" slot
 *
 * The `onAssign` callback must receive:
 *   - `rosterIds` from the picker (unchanged)
 *   - `plcOptions`  from the PLC slot (unchanged)
 *   - `dueAt`       from the due-date input (new)
 *   — behavior values (`sessionMode`, `sessionOptions`, `attemptLimit`) are
 *     now sourced from `getQuizBehavior(meta)` inside the handler, so they
 *     are NOT passed through `onAssign` any more.
 *
 * Mocking strategy:
 *   - Heavy hooks (usePlcs, useAuth, useFolders, useSessionViewCount) are
 *     stubbed to return minimal safe values.
 *   - Library primitives (useLibraryView, useLibrarySelection,
 *     useSortableReorder) rendered by QuizManager's library tab are left
 *     real; we render `managerTab='library'` so archive-card hooks never fire.
 *   - AssignClassPicker: stubbed so we can drive roster selection.
 *   - Modal: not stubbed — we test it end-to-end.
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

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type {
  ClassRoster,
  QuizConfig,
  QuizMetadata,
  QuizBehaviorSettings,
} from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

// ---------------------------------------------------------------------------
// Heavy hook stubs
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
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

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
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

const BASE_CONFIG: QuizConfig = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

function makeQuizMeta(overrides: Partial<QuizMetadata> = {}): QuizMetadata {
  return {
    id: 'quiz-1',
    title: 'Chapter 5 Review',
    driveFileId: 'drive-1',
    questionCount: 5,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

/**
 * Render QuizManager at the library tab with one quiz so the Assign button
 * is visible. Returns the `onAssign` spy.
 */
function renderManager(
  quizMeta: QuizMetadata,
  onAssignFn: ReturnType<typeof vi.fn> = vi.fn(),
  extra: { canAssignToClassroom?: boolean } = {}
) {
  // Cast: QuizManagerProps['onAssign'] signature is
  //   (quiz, plcOptions, rosterIds, dueAt) => void
  const onAssign = onAssignFn as (
    quiz: QuizMetadata,
    plcOptions: import('@/components/widgets/QuizWidget/components/QuizManager').PlcOptions,
    rosterIds: string[],
    dueAt: number | null
  ) => void;
  render(
    <QuizManager
      quizzes={[quizMeta]}
      loading={false}
      error={null}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onPreview={vi.fn()}
      onAssign={onAssign}
      onResults={vi.fn()}
      onDelete={vi.fn()}
      onShare={vi.fn()}
      rosters={ROSTERS}
      config={BASE_CONFIG}
      managerTab="library"
      canAssignToClassroom={extra.canAssignToClassroom}
    />
  );
  return { onAssign: onAssignFn };
}

// ---------------------------------------------------------------------------
// Tests — modal content assertions
// ---------------------------------------------------------------------------

describe('QuizManager assign modal — slimmed flow (Task 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the assign modal when Assign is clicked for a quiz', async () => {
    renderManager(makeQuizMeta());
    // Find the primary "Assign" action button on the library card.
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Modal should now be visible — the modal dialog is labeled by the quiz title
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    expect(
      screen.getByRole('dialog', { name: /chapter 5 review/i })
    ).toBeInTheDocument();
  });

  it('does NOT render a mode picker (Teacher-paced / Auto-progress / Self-paced cards)', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    expect(screen.queryByText('Session Mode')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /auto-progress/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /self-paced/i })
    ).not.toBeInTheDocument();
  });

  it('does NOT render integrity/feedback/gamification toggle controls', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    // Interactive toggle labels that used to appear in the assign modal should be gone.
    // The behavior summary shows a compact text line — not editable controls.
    expect(screen.queryByText('Speed Bonus Points')).not.toBeInTheDocument();
    expect(screen.queryByText('Streak Bonuses')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamification')).not.toBeInTheDocument();
    // "Shuffle Questions" was a standalone toggle label (editable control).
    expect(screen.queryByText('Shuffle Questions')).not.toBeInTheDocument();
    // There should be no attempt-limit picker UI element — the value
    // is shown read-only in the behavior summary.
    expect(screen.queryByLabelText(/attempt limit/i)).not.toBeInTheDocument();
  });

  it('renders a read-only behavior summary in the assign modal', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    // Behavior summary block should be present (look for a heading or label)
    expect(screen.getByTestId('quiz-behavior-summary')).toBeInTheDocument();
  });

  it('renders an "Edit in quiz" button in the assign modal', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    expect(
      screen.getByRole('button', { name: /edit in quiz/i })
    ).toBeInTheDocument();
  });

  it('renders a due-date input in the assign modal', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    // Due-date should be a date input or labeled element
    expect(screen.getByTestId('assign-due-date')).toBeInTheDocument();
  });

  it('renders the class/period picker in the assign modal', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });
    expect(screen.getByTestId('assign-class-picker')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — onAssign callback composition
// ---------------------------------------------------------------------------

describe('QuizManager onAssign — behavior sourced from quiz, dueAt from input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onAssign with dueAt=null when no due date is entered', async () => {
    const onAssign = vi.fn();
    const meta = makeQuizMeta(); // no behavior → DEFAULT_QUIZ_BEHAVIOR
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    // Confirm without touching anything
    // Find the confirm button inside the modal dialog (not the card button).
    const dialog = screen.getByRole('dialog', { name: /chapter 5 review/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    // Signature: (meta, plcOptions, rosterIds, dueAt)
    const dueAt = args[3];
    expect(dueAt).toBeNull();
  });

  it('calls onAssign with dueAt as epoch ms when a date is entered', async () => {
    const onAssign = vi.fn();
    const meta = makeQuizMeta();
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    // Set a due date
    const dueDateInput = screen.getByTestId('assign-due-date');
    fireEvent.change(dueDateInput, { target: { value: '2026-06-01' } });

    // Find the confirm button inside the modal dialog (not the card button).
    const dialog = screen.getByRole('dialog', { name: /chapter 5 review/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    const dueAt = args[3];
    // Should be a positive epoch ms number
    expect(typeof dueAt).toBe('number');
    expect(dueAt).toBeGreaterThan(0);
    // Pin the concrete local epoch (June 1 2026 at 23:59 local time) and
    // explicitly rule out the old UTC-midnight value that caused off-by-one dates.
    expect(dueAt).toBe(new Date(2026, 5, 1, 23, 59, 0, 0).getTime());
    expect(dueAt).not.toBe(new Date('2026-06-01').getTime());
  });

  it('calls onAssign passing the quiz meta as first argument', async () => {
    const onAssign = vi.fn();
    const meta = makeQuizMeta({ id: 'quiz-42', title: 'Chapter 5 Review' });
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    // Find the confirm button inside the modal dialog (not the card button).
    const dialog = screen.getByRole('dialog', { name: /chapter 5 review/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const [calledMeta] = onAssign.mock.calls[0];
    expect(calledMeta).toMatchObject({ id: 'quiz-42' });
  });

  it('calls onAssign with selected roster ids from the picker', async () => {
    const onAssign = vi.fn();
    const meta = makeQuizMeta();
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    // Select roster r1
    const rosterCheck = screen.getByTestId('roster-r1');
    fireEvent.click(rosterCheck);

    // Find the confirm button inside the modal dialog (not the card button).
    const dialog = screen.getByRole('dialog', { name: /chapter 5 review/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const args = onAssign.mock.calls[0];
    // Signature: (meta, plcOptions, rosterIds, dueAt)
    const rosterIds = args[2];
    expect(rosterIds).toContain('r1');
  });
});

// ---------------------------------------------------------------------------
// Tests — Widget-level: behavior sourced from getQuizBehavior(meta)
// ---------------------------------------------------------------------------

describe('Widget.onAssign — createAssignment receives behavior from quiz meta', () => {
  it('sources sessionMode from the quiz behavior (non-default)', async () => {
    /**
     * This test exercises the Widget-level onAssign handler indirectly by
     * checking that the onAssign prop QuizManager calls receives the meta
     * with the custom behavior — then the Widget handler calls
     * getQuizBehavior(meta) to derive sessionMode etc. For this test we
     * verify the contract: QuizManager's onAssign signature no longer
     * includes mode/sessionOptions/attemptLimit; the meta IS the first arg.
     */
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'student',
      attemptLimit: 3,
    };
    const onAssign = vi.fn();
    const meta = makeQuizMeta({ behavior: customBehavior });
    renderManager(meta, onAssign);

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    // Find the confirm button inside the modal dialog (not the card button).
    const dialog = screen.getByRole('dialog', { name: /chapter 5 review/i });
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^assign$/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const calledMeta = onAssign.mock.calls[0][0] as QuizMetadata;
    // Behavior must come from the meta — the Widget handler will call
    // getQuizBehavior(calledMeta) which returns the custom behavior.
    expect(calledMeta.behavior).toMatchObject({
      sessionMode: 'student',
      attemptLimit: 3,
    });
    // Crucially, NO mode/sessionOptions/attemptLimit args — behavior is sourced
    // from the quiz meta. The args are (meta, plcOptions, rosterIds, dueAt,
    // destination); the chooser pick adds the destination as the 5th arg.
    expect(onAssign.mock.calls[0]).toHaveLength(5);
    expect(onAssign.mock.calls[0][4]).toBe('spartboard');
  });

  it('behavior summary shows the mode from the quiz behavior', async () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'student',
    };
    renderManager(makeQuizMeta({ behavior: customBehavior }));

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    const summary = screen.getByTestId('quiz-behavior-summary');
    // Self-paced / student mode should appear in the summary text
    expect(summary.textContent).toMatch(/self.paced/i);
  });

  it('behavior summary shows teacher-paced for default quiz (no behavior set)', async () => {
    renderManager(makeQuizMeta()); // no behavior → DEFAULT_QUIZ_BEHAVIOR (teacher)

    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    fireEvent.click(assignBtn);
    // Phase 2: the library-row Assign opens a destination chooser first; pick
    // "SpartBoard Only" to continue into the standard assign modal.
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    // Wait for the assign modal dialog to appear
    await screen.findByRole('dialog', { name: /chapter 5 review/i });

    const summary = screen.getByTestId('quiz-behavior-summary');
    expect(summary.textContent).toMatch(/teacher.paced/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — Phase 2 destination chooser routing
// ---------------------------------------------------------------------------

describe('QuizManager assign — destination chooser (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routing through "Google Classroom" passes destination="classroom" to onAssign', async () => {
    const onAssign = vi.fn();
    renderManager(makeQuizMeta(), onAssign, { canAssignToClassroom: true });

    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    // The Google Classroom option only appears when enabled.
    fireEvent.click(
      await screen.findByRole('button', { name: /Google Classroom/i })
    );
    // Same targeting modal — the confirm button is destination-aware so the
    // teacher knows the Classroom course picker comes next.
    const dialog = await screen.findByRole('dialog', {
      name: /chapter 5 review/i,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /continue to google classroom/i,
      })
    );

    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    expect(onAssign.mock.calls[0][4]).toBe('classroom');
  });

  it('re-picks the destination on each assign (Classroom then SpartBoard-only)', async () => {
    const onAssign = vi.fn();
    renderManager(makeQuizMeta(), onAssign, { canAssignToClassroom: true });

    // First assign → Google Classroom.
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Google Classroom/i })
    );
    let dialog = await screen.findByRole('dialog', {
      name: /chapter 5 review/i,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /continue to google classroom/i,
      })
    );
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
    expect(onAssign.mock.calls[0][4]).toBe('classroom');

    // Second assign → SpartBoard Only must NOT inherit the prior 'classroom'.
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /SpartBoard Only/i })
    );
    dialog = await screen.findByRole('dialog', { name: /chapter 5 review/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(2));
    expect(onAssign.mock.calls[1][4]).toBe('spartboard');
  });

  it('picking "Schoology" shows the how-to and does NOT create an assignment', async () => {
    const onAssign = vi.fn();
    renderManager(makeQuizMeta(), onAssign);

    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Schoology/i }));
    // The Schoology how-to modal appears (no targeting modal, no onAssign).
    await screen.findByRole('dialog', { name: /how to assign in schoology/i });
    expect(onAssign).not.toHaveBeenCalled();
  });
});

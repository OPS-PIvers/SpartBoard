import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizAssignmentSettingsModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentSettingsModal';
import type { ClassRoster, QuizAssignment } from '@/types';

function makePlcAssignment(
  overrides: Partial<QuizAssignment> = {}
): QuizAssignment {
  return {
    id: 'a1',
    quizId: 'q1',
    quizTitle: 'PLC Quiz',
    quizDriveFileId: 'drive1',
    teacherUid: 'teacher-1',
    code: 'ABC123',
    status: 'paused',
    createdAt: 1,
    updatedAt: 1,
    sessionMode: 'teacher',
    sessionOptions: {},
    // Mirror the new PlcLinkage sub-object shape — `plcMode` is now derived
    // as `!!assignment.plc`, and the sheet URL lives on `plc.sheetUrl`.
    plc: {
      id: 'plc-1',
      name: 'Test PLC',
      sheetUrl: '',
      memberEmails: [],
    },
    teacherName: '',
    periodNames: [],
    ...overrides,
  } as unknown as QuizAssignment;
}

describe('QuizAssignmentSettingsModal — behavior is read-only (freeze-live)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a read-only behavior summary instead of editable behavior controls', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          sessionMode: 'teacher',
          sessionOptions: { shuffleAnswerOptions: true },
          attemptLimit: 1,
        })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // Should show the behavior summary text (from formatBehaviorSummary)
    const summary = screen.getByTestId('assignment-behavior-summary');
    expect(summary).toBeInTheDocument();
    expect(summary.textContent).toContain('Teacher-paced');
    expect(summary.textContent).toContain('1 attempt');
  });

  it('shows an "Edit in quiz" hint (not an active nav button)', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/edit in (the )?quiz/i)).toBeInTheDocument();
  });

  it('does NOT render mode radio buttons or behavior toggle inputs', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ status: 'inactive' })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // No radiogroup for session mode
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    // No attempt-limit number input
    expect(
      screen.queryByRole('spinbutton', { name: /attempt/i })
    ).not.toBeInTheDocument();
  });

  it('save patch includes targeting fields but NOT behavior fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          className: 'Period 1',
          sessionMode: 'student',
          sessionOptions: { speedBonusEnabled: true },
          attemptLimit: 3,
          periodNames: ['P1'],
        })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    // Targeting fields SHOULD be present
    expect(patch).toHaveProperty('className');
    expect(patch).toHaveProperty('periodName');
    expect(patch).toHaveProperty('periodNames');
    // Behavior fields MUST NOT be present
    expect(patch).not.toHaveProperty('sessionMode');
    expect(patch).not.toHaveProperty('sessionOptions');
    expect(patch).not.toHaveProperty('attemptLimit');
  });

  it('save patch includes dueAt when a due date is entered', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ dueAt: null })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    const dateInput = screen.getByTestId('assignment-due-date');
    fireEvent.change(dateInput, { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty('dueAt');
    expect(typeof patch.dueAt).toBe('number');
  });

  it('save patch includes dueAt: null when the date input is cleared', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    // Assignment starts with a due date set
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          dueAt: new Date('2026-05-01').getTime(),
        })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    const dateInput = screen.getByTestId('assignment-due-date');
    // Clear the date
    fireEvent.change(dateInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.dueAt).toBeNull();
  });

  it('behavior summary reflects the assignment sessionMode at render time', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          sessionMode: 'auto',
          attemptLimit: null,
        })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const summary = screen.getByTestId('assignment-behavior-summary');
    expect(summary.textContent).toContain('Auto-progress');
    expect(summary.textContent).toContain('unlimited attempts');
  });
});

describe('QuizAssignmentSettingsModal — Auto-Generated PLC Sheet toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts ON (URL input hidden) when the assignment has no plc.sheetUrl', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // The Auto-Generated row is visible; the URL input is not rendered.
    expect(screen.getByText('Auto-Generated PLC Sheet')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/docs\.google\.com\/spreadsheets/i)
    ).not.toBeInTheDocument();
  });

  it('starts OFF (URL input pre-filled) when the assignment already has a plc.sheetUrl (legacy)', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          plc: {
            id: 'plc-1',
            name: 'Test PLC',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
            memberEmails: [],
          },
        })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // Field is rendered with the legacy URL pre-populated.
    expect(screen.getByDisplayValue(/legacy-sheet-id/)).toBeInTheDocument();
  });

  it('toggling Auto-Generated back ON preserves the existing plc.sheetUrl (cancel, not clear)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          plc: {
            id: 'plc-1',
            name: 'Test PLC',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
            memberEmails: ['a@example.com'],
          },
        })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    // Legacy assignment: toggle starts OFF, URL pre-filled. Click the
    // toggle to turn Auto-Generated back ON — this clears the form input
    // but should NOT clear the saved plc.sheetUrl (the no-op branch in
    // handleAssign preserves the existing linkage when plcSheetUrl saves
    // as ''). Without that branch, saving '' would be dropped by the
    // read-side validator on next snapshot, silently losing PLC mode.
    // Anchor on the label text and walk up to its sibling switch — the
    // ToggleRow renders <span>{label}</span> + <Toggle/> as direct
    // children of the same flex row, so finding the row from the label
    // and querying for [role=switch] inside it gives us the right one
    // even when other toggles (Share with PLC) live in nearby rows.
    const labelEl = screen.getByText('Auto-Generated PLC Sheet');
    const row = labelEl.parentElement; // the flex row
    const autoGenSwitch = row?.querySelector('[role="switch"]');
    expect(autoGenSwitch).not.toBeNull();
    fireEvent.click(autoGenSwitch as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      plc: {
        id: 'plc-1',
        name: 'Test PLC',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
        memberEmails: ['a@example.com'],
      },
    });
  });
});

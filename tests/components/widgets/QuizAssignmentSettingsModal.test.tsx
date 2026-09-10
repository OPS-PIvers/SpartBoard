import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizAssignmentSettingsModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentSettingsModal';
import { combineDateAndTime } from '@/utils/localDate';
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

function makeRoster(overrides: Partial<ClassRoster> = {}): ClassRoster {
  return {
    id: 'r1',
    name: 'Period 1',
    driveFileId: null,
    studentCount: 0,
    createdAt: 1,
    students: [],
    ...overrides,
  } as ClassRoster;
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

  it('combines the due date + time inputs into a local-datetime dueAt', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ dueAt: null })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('assignment-due-date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByTestId('assignment-due-time'), {
      target: { value: '14:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    // dueAt is the LOCAL combination of the chosen date + time (not UTC midnight).
    expect(patch.dueAt).toBe(combineDateAndTime('2026-06-01', '14:30'));
    // …and it's marked time-bearing so the round-trip / Classroom conversion
    // reads the chosen time rather than defaulting to end-of-day.
    expect(patch.dueAtHasTime).toBe(true);
  });

  it('defaults the due time to end-of-day when only a date is picked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ dueAt: null })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('assignment-due-date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.dueAt).toBe(combineDateAndTime('2026-06-01', '23:59'));
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

describe('QuizAssignmentSettingsModal — unified class picker (rosterIds)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates the picker from assignment.rosterIds (new path)', () => {
    const rosters = [
      makeRoster({ id: 'r1', name: 'Period 1' }),
      makeRoster({ id: 'r2', name: 'Period 2' }),
      makeRoster({ id: 'r3', name: 'Period 3' }),
    ];
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          // periodNames intentionally stale/empty to prove rosterIds wins.
          rosterIds: ['r1', 'r3'],
          periodNames: [],
        })}
        rosters={rosters}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // Three rosters → three checkboxes; r1 and r3 preselected, r2 not.
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toBeChecked(); // r1
    expect(checkboxes[1]).not.toBeChecked(); // r2
    expect(checkboxes[2]).toBeChecked(); // r3
  });

  it('hydrates the picker from legacy periodNames by matching roster.name', () => {
    const rosters = [
      makeRoster({ id: 'r1', name: 'Period 1' }),
      makeRoster({ id: 'r2', name: 'Period 2' }),
    ];
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          // Legacy assignment: no rosterIds, only stored period names.
          rosterIds: undefined,
          periodNames: ['Period 2'],
        })}
        rosters={rosters}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked(); // Period 1
    expect(checkboxes[1]).toBeChecked(); // Period 2 (matched by name)
  });

  it('an explicit empty rosterIds short-circuits the legacy periodNames fallback', () => {
    // rosterIds: [] means "no classes selected" and must NOT fall through to
    // name-matching periodNames — even when periodNames is non-empty (e.g. a
    // legacy field left on a doc whose targeting was later cleared).
    const rosters = [
      makeRoster({ id: 'r1', name: 'Period 1' }),
      makeRoster({ id: 'r2', name: 'Period 2' }),
    ];
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          rosterIds: [],
          periodNames: ['Period 1', 'Period 2'],
        })}
        rosters={rosters}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // Nothing preselected despite the non-empty legacy periodNames.
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('writes BOTH rosterIds AND periodNames (derived from selected rosters) on save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const rosters = [
      makeRoster({ id: 'r1', name: 'Period 1' }),
      makeRoster({ id: 'r2', name: 'Period 2' }),
    ];
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          rosterIds: ['r1'],
          periodNames: ['Period 1'],
        })}
        rosters={rosters}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    // Add Period 2 to the selection.
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    // rosterIds: both selected rosters, derived via deriveSessionTargetsFromRosters.
    expect(patch.rosterIds).toEqual(['r1', 'r2']);
    // periodNames: derived from the selected rosters' names (back-compat).
    expect(patch.periodNames).toEqual(['Period 1', 'Period 2']);
    // periodName mirrors periodNames[0].
    expect(patch.periodName).toBe('Period 1');
  });

  it('writes empty rosterIds + periodNames when all classes are deselected', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const rosters = [makeRoster({ id: 'r1', name: 'Period 1' })];
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          rosterIds: ['r1'],
          periodNames: ['Period 1'],
        })}
        rosters={rosters}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // deselect
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.rosterIds).toEqual([]);
    expect(patch.periodNames).toEqual([]);
    expect(patch.periodName).toBe('');
  });
});

describe('QuizAssignmentSettingsModal — PLC results sharing (D12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the linked PLC and a Stop sharing button when assignment.plc exists', () => {
    const onStopSharing = vi.fn();
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        canShareWithPlc
        onStopSharing={onStopSharing}
        onShareResults={vi.fn()}
      />
    );
    expect(
      screen.getByText('Sharing results with Test PLC')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onStopSharing).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /Share results with PLC/ })
    ).not.toBeInTheDocument();
  });

  it('offers "Share results with PLC…" on an unlinked assignment when the teacher is in a PLC', () => {
    const onShareResults = vi.fn();
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ plc: undefined })}
        rosters={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        canShareWithPlc
        onShareResults={onShareResults}
        onStopSharing={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Share results with PLC…' })
    );
    expect(onShareResults).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Stop sharing' })
    ).not.toBeInTheDocument();
  });

  it('hides both actions when the teacher belongs to no PLC', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ plc: undefined })}
        rosters={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Share results with PLC/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stop sharing' })
    ).not.toBeInTheDocument();
  });

  it('never writes plc, teacherName or a sheet URL in the save patch', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[]}
        onSave={onSave}
        onClose={vi.fn()}
        canShareWithPlc
        onStopSharing={vi.fn()}
        onShareResults={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('plc');
    expect(patch).not.toHaveProperty('teacherName');
    expect(patch).not.toHaveProperty('plcSheetUrl');
    expect(screen.queryByText('Auto-Generated PLC Sheet')).toBeNull();
  });
});

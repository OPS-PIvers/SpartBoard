import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizAssignmentSettingsModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentSettingsModal';
import { combineDateAndTime } from '@/utils/localDate';
import type { ClassRoster, QuizAssignment } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';

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

describe('QuizAssignmentSettingsModal — behavior editable on a live assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the behavior summary on the collapsed section', () => {
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
    const summary = screen.getByTestId('assignment-behavior-summary');
    expect(summary.textContent).toContain('Teacher-paced');
    expect(summary.textContent).toContain('1 attempt');
    expect(screen.queryByText(/edit in (the )?quiz/i)).not.toBeInTheDocument();
  });

  it('never offers the session mode selector', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({ status: 'active' })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /assessment settings/i })
    );
    expect(screen.queryByText('Session Mode')).not.toBeInTheDocument();
    expect(screen.getByText('Question Randomization')).toBeInTheDocument();
  });

  it('save patch leaves behavior out when it was not edited', async () => {
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
    expect(patch).toHaveProperty('className');
    expect(patch).toHaveProperty('periodName');
    expect(patch).toHaveProperty('periodNames');
    expect(patch).not.toHaveProperty('sessionMode');
    expect(patch).not.toHaveProperty('sessionOptions');
    expect(patch).not.toHaveProperty('attemptLimit');
  });

  it('save patch carries an edited shuffle toggle but never sessionMode', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          status: 'active',
          sessionMode: 'student',
          sessionOptions: { shuffleAnswerOptions: true },
          attemptLimit: 1,
        })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /assessment settings/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /question randomization/i })
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Shuffle Answer Options' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.sessionOptions).toEqual({ shuffleAnswerOptions: false });
    expect(patch).not.toHaveProperty('sessionMode');
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

describe('QuizAssignmentSettingsModal — assessment only (Review split D9)', () => {
  const renderModal = (assessmentOnly: boolean) =>
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          status: 'active',
          sessionMode: 'student',
          sessionOptions: { speedBonusEnabled: true },
          attemptLimit: 1,
        })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        assessmentOnly={assessmentOnly}
      />
    );

  it('hides gamification, board reveal and the mode label', () => {
    renderModal(true);
    const summary = screen.getByTestId('assignment-behavior-summary');
    expect(summary.textContent).not.toContain('Assessment Mode');
    expect(summary.textContent?.startsWith('1 attempt')).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: /assessment settings/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /answer feedback/i }));
    expect(screen.queryByText('Gamification')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Show correct answer on board')
    ).not.toBeInTheDocument();
  });

  it('keeps gamification without the split', () => {
    renderModal(false);
    fireEvent.click(
      screen.getByRole('button', { name: /assessment settings/i })
    );
    expect(screen.getByText('Gamification')).toBeInTheDocument();
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

describe('QuizAssignmentSettingsModal — per-class due dates', () => {
  const rosters = [
    makeRoster({ id: 'r1', name: 'Period 1' }),
    makeRoster({ id: 'r2', name: 'Period 2' }),
  ];
  const withFlag = (ui: React.ReactElement, on = true) => (
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) =>
            on && id === 'quiz-per-class-due-dates',
        } as unknown as AuthContextType
      }
    >
      {ui}
    </AuthContext.Provider>
  );

  it('hides the switch without the flag', () => {
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={makePlcAssignment({ rosterIds: ['r1', 'r2'] })}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
        false
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Each class' })
    ).not.toBeInTheDocument();
  });

  it('saves a date per class with the earliest as dueAt', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={makePlcAssignment({ rosterIds: ['r1', 'r2'] })}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Each class' }));
    fireEvent.change(screen.getByLabelText('Period 1 due date'), {
      target: { value: '2026-06-02' },
    });
    fireEvent.change(screen.getByLabelText('Period 2 due date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.dueAtByRosterId).toEqual({
      r1: combineDateAndTime('2026-06-02', '23:59'),
      r2: combineDateAndTime('2026-06-01', '23:59'),
    });
    expect(patch.dueAt).toBe(combineDateAndTime('2026-06-01', '23:59'));
  });

  it('switching back to one date clears the per-class map', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={makePlcAssignment({
            rosterIds: ['r1', 'r2'],
            dueAt: combineDateAndTime('2026-06-01', '09:00'),
            dueAtHasTime: true,
            dueAtByRosterId: {
              r1: combineDateAndTime('2026-06-01', '09:00') ?? 0,
              r2: combineDateAndTime('2026-06-03', '09:00') ?? 0,
            },
          })}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'One date' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty('dueAtByRosterId', undefined);
    expect(patch.dueAt).toBe(combineDateAndTime('2026-06-01', '09:00'));
  });
});

describe('QuizAssignmentSettingsModal — availability and due date', () => {
  const rosters = [
    makeRoster({ id: 'r1', name: 'Period 1' }),
    makeRoster({ id: 'r2', name: 'Period 2' }),
  ];
  const withFlag = (ui: React.ReactElement) => (
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) => id === 'assign-availability',
        } as unknown as AuthContextType
      }
    >
      {ui}
    </AuthContext.Provider>
  );
  const opens = combineDateAndTime('2026-06-01', '09:00') ?? 0;
  const closes = combineDateAndTime('2026-06-02', '15:00') ?? 0;
  const saved = (overrides: Partial<QuizAssignment> = {}) =>
    makePlcAssignment({
      rosterIds: ['r1'],
      openAt: opens,
      closeAt: closes,
      dueAt: closes,
      dueAtHasTime: true,
      ...overrides,
    });

  const savePatch = async (onSave: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as Record<string, unknown>;
  };

  it('replaces the due date field with the saved window', () => {
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    expect(screen.queryByTestId('assignment-due-date')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Opens')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('Closes')).toHaveValue('2026-06-02');
    expect(screen.getByLabelText('Closes time')).toHaveValue('15:00');
  });

  it('writes no window fields when the section is untouched', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    const patch = await savePatch(onSave);
    for (const key of ['openAt', 'closeAt', 'dueAt', 'dueAtByRosterId'])
      expect(patch).not.toHaveProperty(key);
  });

  it('moves the close and the due date together', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByLabelText('Closes'), {
      target: { value: '2026-06-05' },
    });
    const patch = await savePatch(onSave);
    const next = combineDateAndTime('2026-06-05', '15:00');
    expect(patch.closeAt).toBe(next);
    expect(patch.dueAt).toBe(next);
    expect(patch.dueAtHasTime).toBe(true);
    expect(patch).not.toHaveProperty('openAt');
  });

  it('keeps one Opens for every class when only one open time is stored', () => {
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved({ rosterIds: ['r1', 'r2'] })}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByLabelText('Dates for'), {
      target: { value: 'each' },
    });
    expect(screen.getAllByLabelText('Opens')).toHaveLength(1);
    expect(screen.getAllByLabelText('Closes')).toHaveLength(2);
  });

  it('saves each class Opens to its own row on a per-class session', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const row = (rosterId: string) => ({
      state: 'open',
      openAt: opens,
      closeAt: closes,
      bellPeriodId: null,
      verified: true,
      label: rosterId,
      rosterId,
    });
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved({
            rosterIds: ['r1', 'r2'],
            openAt: undefined,
            closeAt: undefined,
            accessMode: 'assignment',
            periodAccess: { k1: row('r1'), k2: row('r2') },
          } as Partial<QuizAssignment>)}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByLabelText('Dates for'), {
      target: { value: 'each' },
    });
    fireEvent.change(screen.getAllByLabelText('Opens time')[1], {
      target: { value: '10:30' },
    });
    const patch = await savePatch(onSave);
    expect(patch.periodAccessEdits).toEqual({
      'periodAccess.k2.openAt': combineDateAndTime('2026-06-01', '10:30'),
    });
    expect(patch).not.toHaveProperty('openAt');
    expect(patch).not.toHaveProperty('closeAt');
  });

  it('saves a date per class with the earliest as dueAt', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved({ rosterIds: ['r1', 'r2'] })}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByLabelText('Dates for'), {
      target: { value: 'each' },
    });
    fireEvent.change(screen.getAllByLabelText('Closes')[1], {
      target: { value: '2026-06-04' },
    });
    const patch = await savePatch(onSave);
    expect(patch.dueAtByRosterId).toEqual({
      r1: closes,
      r2: combineDateAndTime('2026-06-04', '15:00'),
    });
    expect(patch.dueAt).toBe(closes);
    expect(patch.closeAt).toBe(combineDateAndTime('2026-06-04', '15:00'));
  });

  it('blocks Save when the window closes before it opens', () => {
    render(
      withFlag(
        <QuizAssignmentSettingsModal
          assignment={saved({ closeAt: opens - 60_000, dueAt: opens - 60_000 })}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });
});

describe('QuizAssignmentSettingsModal — on the assign stepper', () => {
  const rosters = [
    makeRoster({ id: 'r1', name: 'Period 1' }),
    makeRoster({ id: 'r2', name: 'Period 2' }),
  ];
  const withStepper = (ui: React.ReactElement) => (
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) => id === 'assign-stepper',
        } as unknown as AuthContextType
      }
    >
      {ui}
    </AuthContext.Provider>
  );
  const opens = combineDateAndTime('2026-06-01', '09:00') ?? 0;
  const closes = combineDateAndTime('2026-06-02', '15:00') ?? 0;
  const saved = (overrides: Partial<QuizAssignment> = {}) =>
    makePlcAssignment({
      rosterIds: ['r1'],
      openAt: opens,
      closeAt: closes,
      dueAt: closes,
      dueAtHasTime: true,
      sessionMode: 'student',
      ...overrides,
    });
  const savePatch = async (onSave: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as Record<string, unknown>;
  };

  it('shows When, the three rule steps and Sharing, with no Classes step or name', () => {
    render(
      withStepper(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    const headers = screen
      .getAllByRole('button', { expanded: false })
      .concat(screen.getAllByRole('button', { expanded: true }))
      .map((b) => b.textContent ?? '')
      .join('|');
    for (const title of [
      'When',
      'Attempts and order',
      'Quiz integrity',
      'What students see',
      'Sharing',
    ])
      expect(headers).toContain(title);
    expect(headers).not.toContain('Classes');
    expect(screen.queryByTestId('assign-class-picker')).not.toBeInTheDocument();
    expect(screen.getByText('Shared with Test PLC')).toBeInTheDocument();
    expect(screen.getByLabelText('Closes')).toHaveValue('2026-06-02');
  });

  it('saves the same classes and no window fields when untouched', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withStepper(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    const patch = await savePatch(onSave);
    expect(patch.rosterIds).toEqual(['r1']);
    for (const key of ['openAt', 'closeAt', 'dueAt', 'sessionOptions'])
      expect(patch).not.toHaveProperty(key);
  });

  it('moves the close and the due date together', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      withStepper(
        <QuizAssignmentSettingsModal
          assignment={saved()}
          rosters={rosters}
          onSave={onSave}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByLabelText('Closes'), {
      target: { value: '2026-06-05' },
    });
    const patch = await savePatch(onSave);
    const next = combineDateAndTime('2026-06-05', '15:00');
    expect(patch.closeAt).toBe(next);
    expect(patch.dueAt).toBe(next);
  });

  it('keeps one Opens for every class when only one open time is stored', () => {
    render(
      withStepper(
        <QuizAssignmentSettingsModal
          assignment={saved({ rosterIds: ['r1', 'r2'] })}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Different time for each class' })
    );
    expect(screen.getAllByLabelText('Opens')).toHaveLength(1);
    expect(screen.getAllByLabelText('Closes')).toHaveLength(2);
  });

  it('shows the Manual state with no dates for a Manual start', () => {
    render(
      withStepper(
        <QuizAssignmentSettingsModal
          assignment={saved({
            openAt: undefined,
            closeAt: undefined,
            dueAt: undefined,
            accessMode: 'assessment',
            periodAccess: {
              c1: { state: 'closed' },
            } as unknown as QuizAssignment['periodAccess'],
          })}
          rosters={rosters}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    expect(
      screen.getByText('Starts paused. You start and pause each class.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Closes')).not.toBeInTheDocument();
  });
});

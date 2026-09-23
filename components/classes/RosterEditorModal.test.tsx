import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RosterEditorModal } from './RosterEditorModal';
import { ClassRoster } from '@/types';

/**
 * Tests for the row-based roster editor. Each student is a directly
 * editable row (not a textarea slice). Tests add rows via "+ Add Student"
 * and type into per-row inputs to simulate the real UX.
 *
 * Default state (Slice 4): showLastNames=true, showPins=true,
 * showRestrictions=true, showEmails=false.
 * Tests that rely on the old single-name ("Full name") placeholder must
 * explicitly toggle last-names OFF first.
 */
describe('RosterEditorModal', () => {
  it('renders empty state for a new roster', () => {
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/class name/i)).toBeInTheDocument();
    expect(screen.getByText(/no students yet/i)).toBeInTheDocument();
    // No rows yet, so no name inputs
    expect(
      screen.queryByPlaceholderText(/^first name$/i)
    ).not.toBeInTheDocument();
    // Toggle buttons always visible — last names ON by default so label is "−"
    expect(
      screen.getByRole('button', { name: /− last name/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /− quiz pin/i })
    ).toBeInTheDocument();
  });

  it('does not offer the Accommodations tab for a brand-new roster', () => {
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // No roster yet — the whole tab strip (Students/Groups/Accommodations)
    // is gated on `roster`, so activeTab can never resolve to 'accommodations'.
    expect(
      screen.queryByRole('tab', { name: /accommodations/i })
    ).not.toBeInTheDocument();
  });

  it('adds a row via "+ Add Student" and shows dual name fields by default', async () => {
    const user = userEvent.setup();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Last names are ON by default — adding a row yields "First name"/"Last name"
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    expect(screen.getByPlaceholderText(/^first name$/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^last name$/i)).toBeInTheDocument();
    // Toggle label is "− Last Name" (currently active)
    expect(
      screen.getByRole('button', { name: /− last name/i })
    ).toBeInTheDocument();

    // Clicking the toggle collapses to single-name mode
    await user.click(screen.getByRole('button', { name: /− last name/i }));
    expect(screen.getByPlaceholderText(/^full name$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\+ last name/i })
    ).toBeInTheDocument();
  });

  it('calls onSave with single-field full names and closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={onClose}
        onSave={onSave}
      />
    );

    await user.type(screen.getByPlaceholderText(/class name/i), 'New Class');

    // Collapse last-name column so inputs show "Full name" placeholder
    await user.click(screen.getByRole('button', { name: /− last name/i }));

    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^full name$/i), 'Alice Smith');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const nameInputs = screen.getAllByPlaceholderText(/^full name$/i);
    await user.type(nameInputs[1], 'Bob Jones');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('New Class', [
        expect.objectContaining({ firstName: 'Alice Smith', lastName: '' }),
        expect.objectContaining({ firstName: 'Bob Jones', lastName: '' }),
      ]);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSave with split first/last names when in dual mode', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [],
      driveFileId: null,
      studentCount: 0,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    // Last names are already visible by default — no toggle needed
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));

    const firstInputs = screen.getAllByPlaceholderText(/^first name$/i);
    const lastInputs = screen.getAllByPlaceholderText(/^last name$/i);
    await user.type(firstInputs[0], 'Alice');
    await user.type(lastInputs[0], 'Smith');

    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const firsts2 = screen.getAllByPlaceholderText(/^first name$/i);
    const lasts2 = screen.getAllByPlaceholderText(/^last name$/i);
    await user.type(firsts2[1], 'Bob');
    await user.type(lasts2[1], 'Jones');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'Existing Class',
        expect.arrayContaining([
          expect.objectContaining({ firstName: 'Alice', lastName: 'Smith' }),
          expect.objectContaining({ firstName: 'Bob', lastName: 'Jones' }),
        ])
      );
    });
  });

  it('saves a standing accommodation set on the Accommodations tab', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
      ],
      driveFileId: null,
      studentCount: 1,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('tab', { name: /accommodations/i }));
    await user.click(screen.getByRole('button', { name: /alice smith/i }));
    await user.click(screen.getByRole('tab', { name: /^2x$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'Existing Class',
        expect.any(Array),
        undefined,
        { s1: { timeMultiplier: 2 } }
      );
    });
  });

  it('does not render window-shift inputs on the roster accommodations surface', async () => {
    const user = userEvent.setup();
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
      ],
      driveFileId: null,
      studentCount: 1,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByRole('tab', { name: /accommodations/i }));
    await user.click(screen.getByRole('button', { name: /alice smith/i }));

    // Standing defaults are absolute timestamps and must never be editable
    // here — they'd be copied verbatim onto every future assignment.
    expect(screen.queryByText(/window shift/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/opens/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/closes/i)).not.toBeInTheDocument();
  });

  it('never lets openAt/closeAt reach onSave from the roster accommodations tab', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
      ],
      driveFileId: null,
      studentCount: 1,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('tab', { name: /accommodations/i }));
    await user.click(screen.getByRole('button', { name: /alice smith/i }));
    await user.click(screen.getByRole('tab', { name: /^2x$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'Existing Class',
        expect.any(Array),
        undefined,
        { s1: { timeMultiplier: 2 } }
      );
    });
    const savedOverrides = onSave.mock.calls[0][3] as Record<
      string,
      Record<string, unknown>
    >;
    expect(savedOverrides.s1).not.toHaveProperty('openAt');
    expect(savedOverrides.s1).not.toHaveProperty('closeAt');
  });

  it('drops the student entry when a standing accommodation is cleared', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
      ],
      defaultOverridesByStudentId: { s1: { timeMultiplier: 2 } },
      driveFileId: null,
      studentCount: 1,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('tab', { name: /accommodations/i }));
    await user.click(screen.getByRole('button', { name: /alice smith/i }));
    await user.click(screen.getByRole('tab', { name: /^none$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'Existing Class',
        expect.any(Array),
        undefined,
        {}
      );
    });
  });

  it('calls onSave exactly once on a plain student edit (no groups touched)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [],
      groups: [{ id: 'g1', name: 'Group A', studentIds: [] }],
      driveFileId: null,
      studentCount: 0,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const firstInputs = screen.getAllByPlaceholderText(/^first name$/i);
    await user.type(firstInputs[0], 'Alice');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    // No groups arg — legacy path must not touch the groups field.
    expect(onSave.mock.calls[0]).toHaveLength(2);
  });

  it('drops a deleted student from the group member count without waiting for a save', async () => {
    const user = userEvent.setup();
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
        { id: 's2', firstName: 'Bob', lastName: 'Jones', pin: '02' },
      ],
      groups: [{ id: 'g1', name: 'Group A', studentIds: ['s1', 's2'] }],
      driveFileId: null,
      studentCount: 2,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    );

    // Remove Alice from the Students tab...
    const removeButtons = screen.getAllByRole('button', {
      name: /remove student/i,
    });
    await user.click(removeButtons[0]);

    // ...then the Groups tab badge should already read 1, not the stale 2.
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    expect(screen.getByText('1 student')).toBeInTheDocument();
  });

  it('splits the class into N named groups covering every student', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        firstName: `Kid${i}`,
        lastName: 'X',
        pin: String(i).padStart(2, '0'),
      })),
      groups: [],
      driveFileId: null,
      studentCount: 6,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /split class/i }));

    const nameField = screen.getByLabelText(/group name/i);
    // Prefilled and dated so repeat splits stay tellable apart (plan D18).
    expect((nameField as HTMLInputElement).value).toMatch(/^Teams – /);
    await user.clear(nameField);
    await user.type(nameField, 'Teams');

    const countField = screen.getByLabelText(/^groups$/i);
    await user.clear(countField);
    await user.type(countField, '3');
    await user.click(screen.getByRole('button', { name: /create groups/i }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const groups = onSave.mock.calls[0][2] as ClassRoster['groups'];
    expect(groups).toHaveLength(3);
    expect(groups?.map((g) => g.name)).toEqual([
      'Teams (1)',
      'Teams (2)',
      'Teams (3)',
    ]);
    // Every student lands in exactly one group, keyed by id not display name.
    const assigned = groups?.flatMap((g) => g.studentIds) ?? [];
    expect(assigned.slice().sort()).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
  });

  it('offers a single "+ New Group" CTA on the empty groups tab', async () => {
    const user = userEvent.setup();
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
        { id: 's2', firstName: 'Bob', lastName: 'Jones', pin: '02' },
      ],
      groups: [],
      driveFileId: null,
      studentCount: 2,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    // RosterEmptyState carries the only add CTA; the footer keeps just Split.
    expect(screen.getAllByRole('button', { name: /new group/i })).toHaveLength(
      1
    );
    expect(
      screen.getByRole('button', { name: /split class/i })
    ).toBeInTheDocument();
  });

  it('keeps existing groups when splitting', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Existing Class',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Smith', pin: '01' },
        { id: 's2', firstName: 'Bob', lastName: 'Jones', pin: '02' },
      ],
      groups: [{ id: 'g1', name: 'Reading Group A', studentIds: ['s1'] }],
      driveFileId: null,
      studentCount: 2,
      createdAt: Date.now(),
    };

    render(
      <RosterEditorModal
        isOpen={true}
        roster={existing}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /split class/i }));
    await user.click(screen.getByRole('button', { name: /create groups/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const groups = onSave.mock.calls[0][2] as ClassRoster['groups'];
    expect(groups?.[0]).toEqual({
      id: 'g1',
      name: 'Reading Group A',
      studentIds: ['s1'],
    });
    expect(groups).toHaveLength(3);
  });

  it('splits full names when toggling single → dual', async () => {
    const user = userEvent.setup();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Start in single-name mode by collapsing the last-name column first
    await user.click(screen.getByRole('button', { name: /− last name/i }));

    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^full name$/i), 'Alice Smith');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    let names = screen.getAllByPlaceholderText(/^full name$/i);
    await user.type(names[1], 'Bob Jones');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    names = screen.getAllByPlaceholderText(/^full name$/i);
    await user.type(names[2], 'Charlie');

    // Now expand last-name column — names should be split
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

    const firsts = screen.getAllByPlaceholderText(/^first name$/i);
    const lasts = screen.getAllByPlaceholderText(/^last name$/i);
    expect(firsts[0]).toHaveValue('Alice');
    expect(lasts[0]).toHaveValue('Smith');
    expect(firsts[1]).toHaveValue('Bob');
    expect(lasts[1]).toHaveValue('Jones');
    expect(firsts[2]).toHaveValue('Charlie');
    expect(lasts[2]).toHaveValue('');
  });

  it('merges names when toggling dual → single', async () => {
    const user = userEvent.setup();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Last names are already visible by default — add students directly
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^first name$/i), 'Alice');
    await user.type(screen.getByPlaceholderText(/^last name$/i), 'Smith');

    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const firsts = screen.getAllByPlaceholderText(/^first name$/i);
    const lasts = screen.getAllByPlaceholderText(/^last name$/i);
    await user.type(firsts[1], 'Bob');
    await user.type(lasts[1], 'Jones');

    // Toggle off — label is "− Last Name" (active state)
    await user.click(screen.getByRole('button', { name: /− last name/i }));

    const fullNames = screen.getAllByPlaceholderText(/^full name$/i);
    expect(fullNames[0]).toHaveValue('Alice Smith');
    expect(fullNames[1]).toHaveValue('Bob Jones');
  });

  it('shows "− Quiz PIN" button (visible by default) and toggles PIN column off/on', async () => {
    const user = userEvent.setup();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // PINs are visible by default — add a student and confirm PIN column appears
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    expect(screen.getByPlaceholderText('01')).toBeInTheDocument();

    // Toggle hides PIN column
    await user.click(screen.getByRole('button', { name: /− quiz pin/i }));
    expect(screen.queryByPlaceholderText('01')).not.toBeInTheDocument();

    // Toggle again restores it
    await user.click(screen.getByRole('button', { name: /\+ quiz pin/i }));
    expect(screen.getByPlaceholderText('01')).toBeInTheDocument();
  });

  it('persists PINs through save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.type(screen.getByPlaceholderText(/class name/i), 'PIN Class');

    // PINs are visible by default — add students using "First name" placeholder
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^first name$/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const nameInputs = screen.getAllByPlaceholderText(/^first name$/i);
    await user.type(nameInputs[1], 'Bob');

    const pinInputs = screen.getAllByPlaceholderText('01');
    await user.type(pinInputs[0], '12');
    await user.type(pinInputs[1], '42');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('PIN Class', [
        expect.objectContaining({ firstName: 'Alice', pin: '12' }),
        expect.objectContaining({ firstName: 'Bob', pin: '42' }),
      ]);
    });
  });

  it('shows duplicate PIN warning', async () => {
    const user = userEvent.setup();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // PINs visible by default — add students using "First name" placeholder
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^first name$/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const names = screen.getAllByPlaceholderText(/^first name$/i);
    await user.type(names[1], 'Bob');

    const pinInputs = screen.getAllByPlaceholderText('01');
    await user.type(pinInputs[0], '42');
    await user.type(pinInputs[1], '42');

    await waitFor(() => {
      expect(screen.getByText(/duplicate pins/i)).toBeInTheDocument();
    });
  });

  it('does not call onSave when name is empty', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
    await user.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('removes a row when delete button is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.type(screen.getByPlaceholderText(/class name/i), 'Delete Test');

    // Add students using "First name" placeholder (last names visible by default)
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    await user.type(screen.getByPlaceholderText(/^first name$/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /\+ add student/i }));
    const names = screen.getAllByPlaceholderText(/^first name$/i);
    await user.type(names[1], 'Bob');

    // Delete the first row
    const removeButtons = screen.getAllByRole('button', {
      name: /remove student/i,
    });
    await user.click(removeButtons[0]);

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Delete Test', [
        expect.objectContaining({ firstName: 'Bob' }),
      ]);
    });
  });

  it('keeps the modal open and surfaces an alert when the save rejects', async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, 'error')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    const onClose = vi.fn();
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('Failed to save roster changes to Drive'));

    render(
      <RosterEditorModal
        isOpen={true}
        roster={null}
        onClose={onClose}
        onSave={onSave}
      />
    );

    await user.type(screen.getByPlaceholderText(/class name/i), 'Doomed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/could not save/i);
    expect(onClose).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  describe('Bell period', () => {
    const existing: ClassRoster = {
      id: 'r1',
      name: 'Period 3 Bio',
      students: [],
      driveFileId: null,
      studentCount: 0,
      createdAt: 0,
    };
    const options = [
      { buildingId: 'high', periodId: 'P1', label: 'Period 1' },
      { buildingId: 'high', periodId: 'P3', label: 'Period 3' },
    ];

    it('is hidden when the host passes no options', () => {
      render(
        <RosterEditorModal
          isOpen
          roster={existing}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );
      expect(screen.queryByLabelText(/bell period/i)).not.toBeInTheDocument();
    });

    it('saves a picked period, and leaves the call unchanged otherwise', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const { unmount } = render(
        <RosterEditorModal
          isOpen
          roster={existing}
          onClose={vi.fn()}
          onSave={onSave}
          bellPeriodOptions={options}
        />
      );
      await user.click(screen.getByRole('button', { name: /save/i }));
      expect(onSave).toHaveBeenLastCalledWith('Period 3 Bio', []);
      unmount();

      render(
        <RosterEditorModal
          isOpen
          roster={existing}
          onClose={vi.fn()}
          onSave={onSave}
          bellPeriodOptions={options}
        />
      );
      await user.selectOptions(
        screen.getByLabelText(/bell period/i),
        'high|P3'
      );
      await user.click(screen.getByRole('button', { name: /save/i }));
      expect(onSave).toHaveBeenLastCalledWith(
        'Period 3 Bio',
        [],
        undefined,
        undefined,
        { buildingId: 'high', periodId: 'P3' }
      );
    });

    it('clears a saved tag to null and keeps an orphaned one selectable', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <RosterEditorModal
          isOpen
          roster={{
            ...existing,
            bellPeriod: { buildingId: 'middle', periodId: 'P7' },
          }}
          onClose={vi.fn()}
          onSave={onSave}
          bellPeriodOptions={options}
        />
      );
      const select = screen.getByLabelText<HTMLSelectElement>(/bell period/i);
      expect(select.value).toBe('middle|P7');
      await user.selectOptions(select, '');
      await user.click(screen.getByRole('button', { name: /save/i }));
      expect(onSave).toHaveBeenLastCalledWith(
        'Period 3 Bio',
        [],
        undefined,
        undefined,
        null
      );
    });
  });
});

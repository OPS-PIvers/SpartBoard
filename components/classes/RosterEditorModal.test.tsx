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
});

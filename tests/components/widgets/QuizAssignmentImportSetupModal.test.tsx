import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizAssignmentImportSetupModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentImportSetupModal';
import type { ClassRoster, QuizAssignment } from '@/types';

// Stub AssignClassPicker to a controlled checkbox list. The real
// component pulls in ClassLink helpers and visual chrome we don't need
// for this behavioral test — focus on the modal's own contracts: which
// roster ids it gathers, what it derives, what it forwards to onSave.
vi.mock('@/components/common/AssignClassPicker', () => ({
  AssignClassPicker: ({
    rosters,
    value,
    onChange,
    disabled,
  }: {
    rosters: ClassRoster[];
    value: { rosterIds: string[] };
    onChange: (next: { rosterIds: string[] }) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="picker">
      {rosters.map((r) => (
        <label key={r.id}>
          <input
            type="checkbox"
            data-testid={`roster-${r.id}`}
            disabled={disabled}
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

const assignment = {
  id: 'a1',
  quizTitle: 'Imported Quiz',
} as unknown as QuizAssignment;

const rosters: ClassRoster[] = [
  {
    id: 'r1',
    name: 'Math 1',
    students: [],
    classlinkClassId: 'cl-A',
  } as unknown as ClassRoster,
  {
    id: 'r2',
    name: 'Math 2',
    students: [],
  } as unknown as ClassRoster,
];

describe('QuizAssignmentImportSetupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables Save until at least one roster is selected', () => {
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={rosters}
        onSave={vi.fn()}
        onEditAllSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const save = screen.getByRole('button', { name: /^Save$/ });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByTestId('roster-r1'));
    expect(save).not.toBeDisabled();
  });

  it('passes derived targets (rosterIds, classIds, periodNames) to onSave then closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={rosters}
        onSave={onSave}
        onEditAllSettings={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('roster-r1'));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      rosterIds: expect.arrayContaining(['r1']),
      classIds: expect.arrayContaining(['cl-A']),
      periodNames: expect.arrayContaining(['Math 1']),
    });
    // Modal closes only after the save promise resolves — guards
    // against the lost-error pattern where onClose runs before we
    // know whether the write succeeded.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open and does NOT call onClose when onSave throws', async () => {
    const saveError = new Error('Firestore down');
    const onSave = vi.fn().mockRejectedValue(saveError);
    const onClose = vi.fn();
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={rosters}
        onSave={onSave}
        onEditAllSettings={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('roster-r1'));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the no-classes empty state and disables Save when rosters is empty', () => {
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={[]}
        onSave={vi.fn()}
        onEditAllSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/don't have any classes yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('"Edit all settings…" calls onEditAllSettings (not onClose)', () => {
    const onEditAllSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={rosters}
        onSave={vi.fn()}
        onEditAllSettings={onEditAllSettings}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit all settings/i }));
    expect(onEditAllSettings).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Skip for now" closes without invoking onSave', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <QuizAssignmentImportSetupModal
        assignment={assignment}
        rosters={rosters}
        onSave={onSave}
        onEditAllSettings={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

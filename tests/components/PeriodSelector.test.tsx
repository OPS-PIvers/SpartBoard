import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodSelector } from '@/components/common/library/PeriodSelector';
import type { ClassRoster } from '@/types';

function makeRoster(id: string, name: string): ClassRoster {
  return {
    id,
    name,
    driveFileId: null,
    studentCount: 0,
    createdAt: Date.now(),
    students: [],
  };
}

/** Find the checkbox input associated with a given period name. */
function getPeriodCheckbox(name: string): HTMLInputElement {
  const label = screen.getByText(name).closest('label');
  if (!label) throw new Error(`Label for ${name} not found`);
  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) throw new Error(`Checkbox for ${name} not found`);
  return input;
}

const ROSTERS: ClassRoster[] = [
  makeRoster('r1', 'Period 1'),
  makeRoster('r2', 'Period 2'),
  makeRoster('r3', 'Period 3'),
];

describe('PeriodSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cannot uncheck a locked period', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <PeriodSelector
        rosters={ROSTERS}
        selectedPeriodNames={['Period 1', 'Period 2']}
        lockedPeriodNames={['Period 2']}
        onSave={onSave}
        onClose={onClose}
      />
    );
    // Period 2 checkbox should be disabled because it's selected AND locked.
    // A disabled checkbox cannot be toggled off by a user — that's what
    // guarantees the period stays selected in the saved payload below.
    const period2Input = getPeriodCheckbox('Period 2');
    expect(period2Input).toBeDisabled();
    expect(period2Input.checked).toBe(true);

    // Period 1 is selected but not locked — should still be toggleable
    const period1Input = getPeriodCheckbox('Period 1');
    expect(period1Input).not.toBeDisabled();

    // Even if onSave fires, the locked period remains in the selection.
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining(['Period 1', 'Period 2'])
    );
  });

  it('fires onSave with the selected period names on Save', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <PeriodSelector
        rosters={ROSTERS}
        selectedPeriodNames={['Period 1']}
        onSave={onSave}
        onClose={onClose}
      />
    );
    // Toggle Period 3 on
    fireEvent.click(getPeriodCheckbox('Period 3'));

    // Click Save
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(['Period 1', 'Period 3']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside click (mousedown on document)', () => {
    const onClose = vi.fn();
    render(
      <PeriodSelector
        rosters={ROSTERS}
        selectedPeriodNames={[]}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    // Click outside the popover
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the explicit close button', () => {
    const onClose = vi.fn();
    render(
      <PeriodSelector
        rosters={ROSTERS}
        selectedPeriodNames={[]}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty-state copy when no rosters exist', () => {
    render(
      <PeriodSelector
        rosters={[]}
        selectedPeriodNames={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/No rosters available/i)).toBeInTheDocument();
  });
});

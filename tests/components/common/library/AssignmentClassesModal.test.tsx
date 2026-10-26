import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, PeriodAccess } from '@/types';
import { AssignmentClassesModal } from '@/components/common/library/AssignmentClassesModal';

const roster = (id: string): ClassRoster =>
  ({ id, name: `Period ${id}`, students: [] }) as unknown as ClassRoster;
const rosters = [roster('1'), roster('2')];

const row: PeriodAccess = {
  state: 'open',
  openAt: 1,
  closeAt: 2,
  bellPeriodId: null,
  verified: false,
  label: 'Period 1',
  rosterId: '1',
};

const toggle = (name: string) => {
  const trigger = document.querySelector(
    '[data-tour="assign-classes.trigger"]'
  );
  if (!(trigger instanceof HTMLElement)) throw new Error('no classes trigger');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('checkbox', { name }));
};

describe('AssignmentClassesModal', () => {
  it('saves the checked classes and closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <AssignmentClassesModal
        rosters={rosters}
        assignment={{ rosterIds: ['1'] }}
        onClose={onClose}
        onSave={onSave}
      />
    );
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    toggle('Period 2');
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ rosterIds: ['1', '2'] })
    );
  });

  it('keeps the dialog open when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    const onClose = vi.fn();
    render(
      <AssignmentClassesModal
        rosters={rosters}
        assignment={{ rosterIds: ['1'] }}
        onClose={onClose}
        onSave={onSave}
      />
    );
    toggle('Period 2');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('blocks removing every class from a per-period session', () => {
    render(
      <AssignmentClassesModal
        rosters={rosters}
        assignment={{
          rosterIds: ['1'],
          accessMode: 'assignment',
          periodAccess: { 'roster:1': row },
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    toggle('Period 1');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

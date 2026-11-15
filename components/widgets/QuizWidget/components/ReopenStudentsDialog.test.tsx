import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReopenStudentsDialog } from './ReopenStudentsDialog';

const students = [
  {
    key: 'a',
    name: 'Anders, Kai',
    className: 'Period 3',
    status: 'turned-in' as const,
  },
  {
    key: 'b',
    name: 'Li, Bo',
    className: 'Period 3',
    status: 'not-started' as const,
  },
  {
    key: 'c',
    name: 'Okafor, Chidinma',
    className: 'Period 5',
    status: 'in-progress' as const,
  },
];

describe('ReopenStudentsDialog', () => {
  it('lists missing students first and reopens the selected ones', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ReopenStudentsDialog
        isOpen
        title="Reopen for selected students"
        students={students}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    const missing = screen.getByText('Missing · 2');
    const submitted = screen.getByText('Submitted · 1');
    expect(
      missing.compareDocumentPosition(submitted) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Select all' })[0]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reopen for 2 students' })
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(['b', 'c']));
  });

  it('filters by name or class', () => {
    render(
      <ReopenStudentsDialog
        isOpen
        title="Reopen for selected students"
        students={students}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search students' }),
      {
        target: { value: 'period 5' },
      }
    );
    expect(screen.getByText('Okafor, Chidinma')).toBeInTheDocument();
    expect(screen.queryByText('Li, Bo')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import type { StudentOverride } from '@/types';
import { RosterAccommodationsList } from './RosterAccommodationsList';

const person = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
  pin: id,
});
const students = [
  person('a', 'Hamza', 'Abdi'),
  person('b', 'Margaret', 'Anderson'),
  person('c', 'Linh', 'Bui'),
];
const groups = [{ id: 'g', name: 'Modified', studentIds: ['b', 'c'] }];

let latest: Record<string, StudentOverride> = {};
const Host = ({
  initial = {},
}: {
  initial?: Record<string, StudentOverride>;
}) => {
  const [overrides, setOverrides] = useState(initial);
  return (
    <RosterAccommodationsList
      students={students}
      groups={groups}
      overrides={overrides}
      readAloudAvailable={false}
      onChange={(next) => {
        latest = next;
        setOverrides(next);
      }}
      onAddStudents={() => undefined}
    />
  );
};

describe('RosterAccommodationsList', () => {
  it('lists only students with accommodations, as Last, First', () => {
    render(<Host initial={{ a: { timeMultiplier: 2 } }} />);
    expect(screen.getByText('Abdi, Hamza')).toBeInTheDocument();
    expect(screen.queryByText('Bui, Linh')).toBeNull();
  });

  it('shows the empty line when no one has accommodations', () => {
    render(<Host />);
    expect(
      screen.getByText('No one has accommodations yet.')
    ).toBeInTheDocument();
  });

  it('adds a group from the menu and applies its setting to every member', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Modified/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Modified (2 students)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('2x', { exact: true }));
    expect(latest).toEqual({
      b: { timeMultiplier: 2 },
      c: { timeMultiplier: 2 },
    });
    // Members whose settings are the group's are not listed again.
    expect(screen.queryByText('Anderson, Margaret')).toBeNull();
  });

  it('removing a group clears its shared setting from the members', () => {
    render(
      <Host
        initial={{
          b: { timeMultiplier: 2 },
          c: { timeMultiplier: 2, readAloud: true },
        }}
      />
    );
    expect(screen.getByText('Modified (2 students)')).toBeInTheDocument();
    // Linh has an extra setting, so she is listed on her own too.
    expect(screen.getByText('Bui, Linh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Modified' }));
    expect(latest).toEqual({ c: { readAloud: true } });
  });
});

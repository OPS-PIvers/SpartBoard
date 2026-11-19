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
  speechToTextAvailable = false,
}: {
  initial?: Record<string, StudentOverride>;
  speechToTextAvailable?: boolean;
}) => {
  const [overrides, setOverrides] = useState(initial);
  return (
    <RosterAccommodationsList
      students={students}
      groups={groups}
      overrides={overrides}
      readAloudAvailable={false}
      speechToTextAvailable={speechToTextAvailable}
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

  it('sets Speech to text on a student when the flag is on', () => {
    render(
      <Host initial={{ a: { timeMultiplier: 2 } }} speechToTextAvailable />
    );
    fireEvent.click(screen.getByText('Abdi, Hamza'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Speech to text' }));
    expect(latest).toEqual({ a: { timeMultiplier: 2, speechToText: true } });
  });

  it('hides Speech to text when the flag is off', () => {
    render(<Host initial={{ a: { timeMultiplier: 2 } }} />);
    fireEvent.click(screen.getByText('Abdi, Hamza'));
    expect(
      screen.queryByRole('checkbox', { name: 'Speech to text' })
    ).toBeNull();
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

  it("removing a member's own row keeps the group's settings", () => {
    render(
      <Host
        initial={{
          b: { timeMultiplier: 2 },
          c: { timeMultiplier: 2, readAloud: true },
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Bui, Linh/ }));
    expect(latest).toEqual({
      b: { timeMultiplier: 2 },
      c: { timeMultiplier: 2 },
    });
    expect(screen.getByText('Modified (2 students)')).toBeInTheDocument();
  });

  it('hides a student whose settings are exactly what two groups give them', () => {
    render(
      <RosterAccommodationsList
        students={students}
        groups={[
          { id: 'g1', name: 'Read', studentIds: ['b', 'c'] },
          { id: 'g2', name: 'Timed', studentIds: ['a', 'c'] },
        ]}
        overrides={{
          a: { timeMultiplier: 2 },
          b: { readAloud: true },
          c: { timeMultiplier: 2, readAloud: true },
        }}
        readAloudAvailable={false}
        onChange={() => undefined}
        onAddStudents={() => undefined}
      />
    );
    expect(screen.getByText('Timed (2 students)')).toBeInTheDocument();
    expect(screen.queryByText('Bui, Linh')).toBeNull();
  });
});

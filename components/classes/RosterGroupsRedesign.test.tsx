import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import type { RosterGroup, StudentOverride } from '@/types';
import { RosterGroupsPanel } from './RosterGroupsPanel';
import { RosterAccommodationsByStudent } from './RosterAccommodationsByStudent';
import {
  studentAccommodationSources,
  groupAccommodations,
} from '@/utils/rosterAccommodationSources';

vi.mock('@/components/common/library/assignStepper/SupportsEditor', () => ({
  SupportsEditor: () => null,
}));

const person = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
  pin: id,
});
const students = [
  person('c', 'Linh', 'Bui'),
  person('a', 'Hamza', 'Abdi'),
  person('b', 'Margaret', 'Anderson'),
];

let latestGroups: RosterGroup[] = [];
let latestOverrides: Record<string, StudentOverride> = {};
const GroupsHost = ({
  initialGroups,
  initialOverrides = {},
}: {
  initialGroups: RosterGroup[];
  initialOverrides?: Record<string, StudentOverride>;
}) => {
  const [groups, setGroups] = useState(initialGroups);
  const [overrides, setOverrides] = useState(initialOverrides);
  return (
    <RosterGroupsPanel
      groups={groups}
      students={students}
      onChange={(next) => {
        latestGroups = next;
        setGroups(next);
      }}
      overrides={overrides}
      onOverridesChange={(next) => {
        latestOverrides = next;
        setOverrides(next);
      }}
      readAloudAvailable={false}
      speechToTextAvailable={false}
    />
  );
};

describe('RosterGroupsPanel (redesign)', () => {
  it('lists each group with its members as Last, First and labeled buttons', () => {
    render(
      <GroupsHost
        initialGroups={[{ id: 'g', name: 'Modified', studentIds: ['b', 'c'] }]}
        initialOverrides={{
          b: { timeMultiplier: 2 },
          c: { timeMultiplier: 2 },
        }}
      />
    );
    expect(
      screen.getByText('Anderson, Margaret; Bui, Linh')
    ).toBeInTheDocument();
    expect(screen.getByText('2x time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('New Group opens a page to name it and pick students', () => {
    render(<GroupsHost initialGroups={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /New Group/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Group name' }), {
      target: { value: 'Readers' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Abdi, Hamza' }));
    expect(latestGroups).toEqual([
      expect.objectContaining({ name: 'Readers', studentIds: ['a'] }),
    ]);
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Readers')).toBeInTheDocument();
  });

  it('a group accommodation is set on every member', () => {
    render(
      <GroupsHost
        initialGroups={[{ id: 'g', name: 'Modified', studentIds: ['b', 'c'] }]}
        initialOverrides={{ c: { readAloud: true } }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByText('2x', { exact: true }));
    expect(latestOverrides).toEqual({
      b: { timeMultiplier: 2 },
      c: { readAloud: true, timeMultiplier: 2 },
    });
  });

  it('Delete group removes it and returns to the list', () => {
    render(
      <GroupsHost
        initialGroups={[{ id: 'g', name: 'Modified', studentIds: ['b'] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(latestGroups).toEqual([]);
    expect(screen.getByText('No groups yet')).toBeInTheDocument();
  });
});

describe('RosterAccommodationsByStudent', () => {
  const groups = [{ id: 'g', name: 'Modified', studentIds: ['b', 'c'] }];
  const Host = ({ initial }: { initial: Record<string, StudentOverride> }) => {
    const [overrides, setOverrides] = useState(initial);
    return (
      <RosterAccommodationsByStudent
        students={students}
        groups={groups}
        overrides={overrides}
        readAloudAvailable
        speechToTextAvailable={false}
        onChange={(next) => {
          latestOverrides = next;
          setOverrides(next);
        }}
        onAddStudents={() => undefined}
      />
    );
  };

  it('lists every student with what their group gives and what is their own', () => {
    render(
      <Host
        initial={{
          b: { timeMultiplier: 2 },
          c: { timeMultiplier: 2, readAloud: true },
        }}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual([
      'Abdi, Hamza',
      'Anderson, Margaret',
      'Bui, Linh',
    ]);
    expect(within(rows[0]).getByText('None')).toBeInTheDocument();
    expect(within(rows[1]).getByText('From Modified:')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Own:')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Read aloud')).toBeInTheDocument();
  });

  it('Edit opens one student and changes only them', () => {
    render(<Host initial={{ b: { timeMultiplier: 2 } }} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit accommodations for Abdi, Hamza',
      })
    );
    fireEvent.click(screen.getByText('1.5x', { exact: true }));
    expect(latestOverrides).toEqual({
      a: { timeMultiplier: 1.5 },
      b: { timeMultiplier: 2 },
    });
  });
});

describe('studentAccommodationSources', () => {
  it('keeps a setting that differs from the group as the student own setting', () => {
    const overrides: Record<string, StudentOverride> = {
      b: { timeMultiplier: 2, readAloud: true },
      c: { timeMultiplier: 1.5, readAloud: true },
    };
    const infos = groupAccommodations(
      [{ id: 'g', name: 'G', studentIds: ['b', 'c'] }],
      students,
      overrides
    );
    const c = studentAccommodationSources('c', infos, overrides);
    expect(c.fromGroups[0].override).toEqual({ readAloud: true });
    expect(c.own).toEqual({ timeMultiplier: 1.5 });
  });
});

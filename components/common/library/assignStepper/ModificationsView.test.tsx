import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClassRoster } from '@/types';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { ModificationsLink, ModificationsView } from './ModificationsView';
import {
  clearedModifications,
  countModifications,
  countUnresolvableStudents,
  formatModificationsValue,
  modificationRows,
} from './ModificationsView.helpers';

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 2',
  driveFileId: 'f1',
  studentCount: 3,
  createdAt: 0,
  defaultOverridesByStudentId: { s2: { timeMultiplier: 2 } },
  students: [
    {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
    {
      id: 's2',
      firstName: 'Grace',
      lastName: 'Hopper',
      pin: '02',
      classLinkSourcedId: 'SID-2',
    },
    { id: 's3', firstName: 'No', lastName: 'Signin', pin: '03' },
  ],
};

const other: ClassRoster = {
  ...roster,
  id: 'r2',
  name: 'Period 3',
  defaultOverridesByStudentId: {},
  students: [
    {
      id: 't1',
      firstName: 'Alan',
      lastName: 'Turing',
      pin: '04',
      classLinkSourcedId: 'SID-4',
    },
  ],
};

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k]));

const adaRef = { kind: 'classlink' as const, sourcedId: 'SID-1' };
const alanRef = { kind: 'classlink' as const, sourcedId: 'SID-4' };

describe('modification helpers', () => {
  it('counts a standing accommodation as modified and ignores no-sign-in students', () => {
    const rows = modificationRows({ rosters: [roster] });
    expect(rows.map((r) => r.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
    expect(countModifications(rows, EMPTY_ASSIGN_TARGETING_VALUE)).toEqual({
      modified: 1,
      skipped: 0,
    });
    expect(countUnresolvableStudents({ rosters: [roster] })).toBe(1);
  });

  it('drops standing accommodations on a re-edit', () => {
    const rows = modificationRows({
      rosters: [roster],
      useRosterDefaults: false,
    });
    expect(countModifications(rows, EMPTY_ASSIGN_TARGETING_VALUE)).toEqual({
      modified: 0,
      skipped: 0,
    });
  });

  it('counts skips only inside the checked classes, and a skip is not also modified', () => {
    const value: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      excludedStudents: [adaRef, alanRef],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
    };
    const rows = modificationRows({
      rosters: [roster, other],
      selectedRosterIds: ['r1'],
    });
    expect(countModifications(rows, value)).toEqual({
      modified: 1,
      skipped: 1,
    });
  });

  it('formats the value for the link and step header', () => {
    expect(formatModificationsValue({ modified: 0, skipped: 0 }, t)).toBe(
      'None'
    );
    expect(formatModificationsValue({ modified: 1, skipped: 0 }, t)).toBe(
      '1 modified'
    );
    expect(formatModificationsValue({ modified: 2, skipped: 3 }, t)).toBe(
      '2 modified, 3 skipped'
    );
  });

  it('clearing keeps everything but the edits and skips', () => {
    const value: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      openAt: 5,
      excludedStudents: [adaRef],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
    };
    expect(clearedModifications(value)).toEqual({
      ...value,
      targetStudents: [],
      overridesByKey: {},
      excludedStudents: [],
    });
  });
});

describe('ModificationsLink', () => {
  it('shows the count and opens the view', () => {
    const onOpen = vi.fn();
    render(
      <ModificationsLink
        rosters={[roster]}
        value={EMPTY_ASSIGN_TARGETING_VALUE}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByText('Modifications: 1 modified'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('reads none when nothing is modified', () => {
    render(
      <ModificationsLink
        rosters={[other]}
        value={EMPTY_ASSIGN_TARGETING_VALUE}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText('Modifications: none')).toBeInTheDocument();
  });
});

describe('ModificationsView', () => {
  const renderView = (value = EMPTY_ASSIGN_TARGETING_VALUE) => {
    const onChange = vi.fn();
    const onBack = vi.fn();
    render(
      <ModificationsView
        activityTitle="Fractions check"
        rosters={[roster]}
        value={value}
        onChange={onChange}
        onBack={onBack}
        quizMode
      />
    );
    return { onChange, onBack };
  };

  it('renders the header, the no-sign-in count and the standing student', () => {
    renderView();
    expect(screen.getByText('Assign · Fractions check')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Modifications' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 students have no school sign-in/)
    ).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Ada Lovelace/ })
    ).not.toBeInTheDocument();
  });

  it('back arrow and Done both return', () => {
    const { onBack } = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('adding a student opens their row, and skip lives inside it', () => {
    const { onChange } = renderView();
    expect(
      screen.queryByRole('button', { name: /Ada Lovelace/ })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Add a student'), {
      target: { value: 'classlink:SID-1' },
    });
    expect(
      screen.getByRole('button', { name: /Ada Lovelace/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Skip Ada Lovelace' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ excludedStudents: [adaRef] })
    );
  });

  it('shows a Skipped chip, and Remove modification unskips', () => {
    const value: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      excludedStudents: [adaRef],
    };
    const { onChange } = renderView(value);
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ada Lovelace'));
    fireEvent.click(screen.getByText('Remove modification'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ excludedStudents: [] })
    );
  });

  it('Remove modification on a standing student clears it for this assignment only', () => {
    const { onChange } = renderView();
    fireEvent.click(screen.getByText('Grace Hopper'));
    fireEvent.click(screen.getByText('Remove modification'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ overridesByKey: { 'classlink:SID-2': {} } })
    );
  });

  it('Clear all modifications drops edits and skips', () => {
    const value: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      excludedStudents: [adaRef],
    };
    const { onChange } = renderView(value);
    fireEvent.click(screen.getByText('Clear all modifications'));
    expect(onChange).toHaveBeenCalledWith(clearedModifications(value));
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  AssignTargetingSection,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/components/common/library/AssignTargetingSection';
import type { ClassRoster } from '@/types';

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 2',
  driveFileId: 'f1',
  studentCount: 2,
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
  ],
};

const renderSection = (
  overrides: Partial<React.ComponentProps<typeof AssignTargetingSection>> = {}
) => {
  const onChange = vi.fn();
  const value: AssignTargetingValue =
    overrides.value ?? EMPTY_ASSIGN_TARGETING_VALUE;
  const utils = render(
    <AssignTargetingSection
      rosters={[roster]}
      selectedRosterIds={['r1']}
      value={value}
      onChange={onChange}
      kind="quiz"
      {...overrides}
    />
  );
  return { onChange, ...utils };
};

const openModifications = () =>
  fireEvent.click(screen.getByText('Edit or add modifications'));

describe('AssignTargetingSection', () => {
  it('collapsed default renders only the affordance, with a single plus-free label', () => {
    renderSection();
    const affordance = screen.getByText('Edit or add modifications');
    expect(affordance).toBeInTheDocument();
    expect(affordance.textContent).not.toContain('+');
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    expect(screen.queryByText('Opens')).not.toBeInTheDocument();
  });

  it('expanding fires onExpand and leaves targetMode on class', () => {
    const onExpand = vi.fn();
    const { onChange } = renderSection({ onExpand });
    openModifications();
    expect(onExpand).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lists students with standing accommodations first and collapses the rest', () => {
    renderSection();
    openModifications();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Standing')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show 1 more'));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('editing a roster-prefilled row writes an assignment-only override', () => {
    const { onChange } = renderSection();
    openModifications();
    fireEvent.click(screen.getByText('Grace Hopper'));
    fireEvent.click(screen.getByText('1.5x'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetMode: 'class',
        overridesByKey: { 'classlink:SID-2': { timeMultiplier: 1.5 } },
      })
    );
  });

  it('skipping a student records them in excludedStudents', () => {
    const { onChange } = renderSection();
    openModifications();
    fireEvent.click(screen.getAllByLabelText('Skip this student')[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-2' }],
      })
    );
  });

  it('unskipping removes the student from excludedStudents', () => {
    const { onChange } = renderSection({
      value: {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-2' }],
      },
    });
    openModifications();
    fireEvent.click(screen.getAllByLabelText('Skip this student')[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ excludedStudents: [] })
    );
  });

  it('gives each skip checkbox a per-row accessible name', () => {
    renderSection();
    openModifications();
    expect(screen.getByLabelText('Skip Grace Hopper')).toBeInTheDocument();
  });

  it('summarises skips and modifications on the collapsed affordance', () => {
    renderSection({
      value: {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      },
    });
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    // SID-2 carries a standing roster default, so it counts as modified.
    expect(screen.getByText(/1 modified/)).toBeInTheDocument();
  });

  it('renders the class skip toggles for an assignment that already has skips', () => {
    renderSection({
      value: {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        targetMode: 'students',
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      },
    });
    openModifications();
    expect(screen.getByLabelText('Skip Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /choose students/i })
    ).not.toBeInTheDocument();
  });

  it('counts students with no school sign-in', () => {
    const noSso: ClassRoster = {
      ...roster,
      students: [
        ...roster.students,
        { id: 's3', firstName: 'No', lastName: 'Sso', pin: '03' },
      ],
    };
    renderSection({ rosters: [noSso] });
    openModifications();
    expect(screen.getByText(/1 students in these classes/)).toBeInTheDocument();
  });

  it('distinguishes a checked class with no SSO students from no class at all', () => {
    const noSso: ClassRoster = {
      ...roster,
      defaultOverridesByStudentId: {},
      students: [{ id: 's3', firstName: 'No', lastName: 'Sso', pin: '03' }],
    };
    renderSection({ rosters: [noSso] });
    openModifications();
    expect(
      screen.getByText(/No one in the checked classes has a school sign-in/)
    ).toBeInTheDocument();
  });

  it('hides the modifications affordance when no roster resolves', () => {
    renderSection({ selectedRosterIds: [], allowModifications: false });
    expect(
      screen.queryByText('Edit or add modifications')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('shows the class hint when no class is checked', () => {
    renderSection({ selectedRosterIds: [] });
    openModifications();
    expect(
      screen.getByText('Check a class above to modify individual students.')
    ).toBeInTheDocument();
  });

  it('the Schedule affordance is independent of targetMode and renders window pickers when expanded', () => {
    renderSection();
    fireEvent.click(screen.getByText('Schedule'));
    expect(screen.getByText('Opens')).toBeInTheDocument();
    expect(screen.getByText('Closes')).toBeInTheDocument();
    expect(screen.queryByText('Due')).not.toBeInTheDocument();
    expect(screen.getByText('Edit or add modifications')).toBeInTheDocument();
  });

  it('showDueAt reveals the due date picker once Schedule is expanded', () => {
    renderSection({ showDueAt: true });
    fireEvent.click(screen.getByText('Schedule'));
    expect(screen.getByText('Due')).toBeInTheDocument();
  });

  it('shows a collapsed-state summary once a schedule is set', () => {
    renderSection({
      value: { ...EMPTY_ASSIGN_TARGETING_VALUE, openAt: 1_700_000_000_000 },
    });
    expect(screen.getByText(/Opens/)).toBeInTheDocument();
  });

  it('window picker changes emit epoch-ms values', () => {
    const { onChange } = renderSection();
    fireEvent.click(screen.getByText('Schedule'));
    const openInput = screen.getByLabelText('Opens', {
      selector: 'input',
    }) as HTMLInputElement | null;
    const input =
      openInput ??
      (screen.getByText('Opens').nextElementSibling as HTMLInputElement);
    fireEvent.change(input, { target: { value: '2026-09-01T09:00' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ openAt: expect.any(Number) })
    );
  });

  describe('legacy targetMode:"students" assignments', () => {
    const legacyValue: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      targetGroupIds: [],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
      excludedStudents: [],
    };

    it('still renders the hand-picked rows', () => {
      renderSection({ value: legacyValue });
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('still removes a student from targetStudents and overridesByKey', () => {
      const { onChange } = renderSection({ value: legacyValue });
      fireEvent.click(screen.getByLabelText('Remove Ada Lovelace'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ targetStudents: [], overridesByKey: {} })
      );
    });

    it('collapsing back to class preserves the schedule', () => {
      const { onChange } = renderSection({
        value: { ...legacyValue, openAt: 1000, closeAt: 2000 },
      });
      fireEvent.click(screen.getByText('Assign to whole class'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          targetMode: 'class',
          targetStudents: [],
          overridesByKey: {},
          openAt: 1000,
          closeAt: 2000,
        })
      );
    });
  });
});

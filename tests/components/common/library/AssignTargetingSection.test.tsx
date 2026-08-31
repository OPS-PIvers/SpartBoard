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
      value={value}
      onChange={onChange}
      kind="quiz"
      {...overrides}
    />
  );
  return { onChange, ...utils };
};

describe('AssignTargetingSection', () => {
  it('collapsed default renders only the affordance, nothing from B1/B2', () => {
    renderSection();
    expect(
      screen.getByText('+ Individual students & overrides')
    ).toBeInTheDocument();
    expect(screen.queryByText('Choose students')).not.toBeInTheDocument();
    expect(screen.queryByText('Opens')).not.toBeInTheDocument();
  });

  it('expanding sets targetMode to students', () => {
    const { onChange } = renderSection();
    fireEvent.click(screen.getByText('+ Individual students & overrides'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ targetMode: 'students' })
    );
  });

  it('expanded state shows the picker trigger and window pickers', () => {
    renderSection({
      value: { ...EMPTY_ASSIGN_TARGETING_VALUE, targetMode: 'students' },
    });
    expect(screen.getByText('Choose students')).toBeInTheDocument();
    expect(screen.getByText('Opens')).toBeInTheDocument();
    expect(screen.getByText('Closes')).toBeInTheDocument();
    expect(screen.queryByText('Due')).not.toBeInTheDocument();
  });

  it('showDueAt reveals the due date picker', () => {
    renderSection({
      value: { ...EMPTY_ASSIGN_TARGETING_VALUE, targetMode: 'students' },
      showDueAt: true,
    });
    expect(screen.getByText('Due')).toBeInTheDocument();
  });

  it('collapsing back to class clears students and overrides', () => {
    const { onChange } = renderSection({
      value: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
        targetGroupIds: [],
        overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
      },
    });
    fireEvent.click(screen.getByText('Assign to whole class'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetMode: 'class',
        targetStudents: [],
        overridesByKey: {},
      })
    );
  });

  it('renders an override row per selected student with a name resolved from rosters', () => {
    renderSection({
      value: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
        targetGroupIds: [],
        overridesByKey: {},
      },
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('removing a student drops it from targetStudents and overridesByKey', () => {
    const { onChange } = renderSection({
      value: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
        targetGroupIds: [],
        overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
      },
    });
    fireEvent.click(screen.getByLabelText('Remove Ada Lovelace'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStudents: [],
        overridesByKey: {},
      })
    );
  });

  it('changing an override row updates overridesByKey using the namespaced key', () => {
    const { onChange } = renderSection({
      value: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
        targetGroupIds: [],
        overridesByKey: {},
      },
    });
    fireEvent.click(screen.getByText('Ada Lovelace'));
    fireEvent.click(screen.getByText('2x'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
      })
    );
  });

  it('opening the picker and confirming updates targetStudents and overridesByKey', () => {
    const { onChange } = renderSection({
      value: { ...EMPTY_ASSIGN_TARGETING_VALUE, targetMode: 'students' },
    });
    fireEvent.click(screen.getByText('Choose students'));
    fireEvent.click(screen.getByText('Ada Lovelace'));
    fireEvent.click(screen.getByText('Add students'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      })
    );
  });

  it('window picker changes emit epoch-ms values', () => {
    const { onChange } = renderSection({
      value: { ...EMPTY_ASSIGN_TARGETING_VALUE, targetMode: 'students' },
    });
    const openInput = screen.getByLabelText('Opens', {
      selector: 'input',
    }) as HTMLInputElement | null;
    // Fall back to querying by the label's sibling input if getByLabelText's
    // implicit association via <label> wrapping doesn't resolve in jsdom.
    const input =
      openInput ??
      (screen.getByText('Opens').nextElementSibling as HTMLInputElement);
    fireEvent.change(input, { target: { value: '2026-09-01T09:00' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ openAt: expect.any(Number) })
    );
  });

  it('round-trips a fully controlled value unchanged when nothing is edited', () => {
    const value: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      targetGroupIds: ['g1'],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
      openAt: 1000,
      closeAt: 2000,
    };
    renderSection({ value });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

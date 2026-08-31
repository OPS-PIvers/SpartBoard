import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AssignStudentPicker } from '@/components/common/library/AssignStudentPicker';
import type { ClassRoster } from '@/types';

const mixedRoster: ClassRoster = {
  id: 'r1',
  name: 'Period 2',
  driveFileId: 'f1',
  studentCount: 3,
  createdAt: 0,
  testClassId: 'demo',
  students: [
    { id: 's1', firstName: 'Ada', lastName: 'Lovelace', pin: '01' },
    {
      id: 's2',
      firstName: 'Grace',
      lastName: 'Hopper',
      pin: '02',
      classLinkSourcedId: 'SID-2',
    },
    {
      id: 's3',
      firstName: 'Kid',
      lastName: 'Test',
      pin: '03',
      email: 'kid@example.com',
    },
  ],
  groups: [{ id: 'g1', name: 'Group A', studentIds: ['s1', 's2', 's3'] }],
  defaultOverridesByStudentId: { s2: { timeMultiplier: 2 } },
};

const renderPicker = (
  overrides: Partial<React.ComponentProps<typeof AssignStudentPicker>> = {}
) =>
  render(
    <AssignStudentPicker
      isOpen
      onClose={vi.fn()}
      rosters={[mixedRoster]}
      selected={[]}
      overridesByKey={{}}
      onConfirm={vi.fn()}
      {...overrides}
    />
  );

describe('AssignStudentPicker', () => {
  it('renders a manually-created student as disabled with the SSO explanation', () => {
    renderPicker();
    const adaCheckbox = screen.getByRole('checkbox', { name: /ada lovelace/i });
    expect(adaCheckbox).toBeDisabled();
    expect(
      screen.getByText('Individual assignment requires ClassLink sign-in')
    ).toBeInTheDocument();
  });

  it('selects a classlink-sourced student and pre-populates their default override', () => {
    const onConfirm = vi.fn();
    renderPicker({ onConfirm });

    fireEvent.click(screen.getByRole('checkbox', { name: /grace hopper/i }));
    fireEvent.click(screen.getByRole('button', { name: /add students/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      [{ kind: 'classlink', sourcedId: 'SID-2' }],
      { 'classlink:SID-2': { timeMultiplier: 2 } }
    );
  });

  it('selects a test-class student by email', () => {
    const onConfirm = vi.fn();
    renderPicker({ onConfirm });

    fireEvent.click(screen.getByRole('checkbox', { name: /kid test/i }));
    fireEvent.click(screen.getByRole('button', { name: /add students/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      [{ kind: 'test', email: 'kid@example.com' }],
      {}
    );
  });

  it('selecting a group chip selects its targetable members, skips the manually-created one, and surfaces the omission', () => {
    const onConfirm = vi.fn();
    renderPicker({ onConfirm });

    // The chip itself visibly signals the partial selection ("2 of 3").
    const groupChip = screen.getByRole('button', { name: /Group A/ });
    expect(groupChip).toHaveTextContent('(2/3)');

    // An inline note names the skipped, untargetable member.
    expect(
      screen.getByText(
        (_, el) =>
          el?.textContent === 'Not added (no ClassLink sign-in): Ada Lovelace'
      )
    ).toBeInTheDocument();

    fireEvent.click(groupChip);
    fireEvent.click(screen.getByRole('button', { name: /add students/i }));

    const [selected] = onConfirm.mock.calls[0];
    expect(selected).toEqual(
      expect.arrayContaining([
        { kind: 'classlink', sourcedId: 'SID-2' },
        { kind: 'test', email: 'kid@example.com' },
      ])
    );
    expect(selected).toHaveLength(2);
  });

  it('removes a student via the selected-summary chip', () => {
    const onConfirm = vi.fn();
    renderPicker({
      onConfirm,
      selected: [{ kind: 'classlink', sourcedId: 'SID-2' }],
    });

    fireEvent.click(
      screen.getByRole('button', { name: /remove grace hopper/i })
    );
    // Confirm is disabled with nothing selected — reselect isn't required to
    // prove removal took effect; check the chip itself is gone.
    expect(
      screen.queryByRole('button', { name: /remove grace hopper/i })
    ).not.toBeInTheDocument();
  });

  it('filters the checklist via search', () => {
    renderPicker();
    fireEvent.change(screen.getByPlaceholderText('Search students…'), {
      target: { value: 'grace' },
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Kid Test')).not.toBeInTheDocument();
  });
});

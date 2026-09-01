import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import { makeEmptyPickerValue } from '@/components/common/AssignClassPicker.helpers';
import type { ClassRoster } from '@/types';

function makeRoster(id: string, name: string, loadError?: string): ClassRoster {
  return {
    id,
    name,
    driveFileId: null,
    studentCount: 0,
    createdAt: Date.now(),
    students: [],
    ...(loadError ? { loadError } : {}),
  };
}

describe('AssignClassPicker', () => {
  it('"Select all" only counts and selects rosters without a loadError', () => {
    const onChange = vi.fn();
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2', 'Failed to load students'),
    ];

    render(
      <AssignClassPicker
        rosters={rosters}
        value={makeEmptyPickerValue()}
        onChange={onChange}
      />
    );

    // Only r1 is selectable, so the button's count must reflect that, not the raw total.
    const selectAllButton = screen.getByRole('button', { name: /Select all/ });
    expect(selectAllButton).toHaveTextContent('Select all (1)');

    fireEvent.click(selectAllButton);
    expect(onChange).toHaveBeenCalledWith({ rosterIds: ['r1'] });
  });

  it('hides "Select all" once every selectable roster is already selected', () => {
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2', 'Failed to load students'),
    ];

    // r1 (the only selectable roster) is already selected; r2 stays broken forever.
    render(
      <AssignClassPicker
        rosters={rosters}
        value={{ rosterIds: ['r1'] }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /Select all/ })
    ).not.toBeInTheDocument();
  });

  it('shows the "N of M selected" status against the selectable count, not the raw total', () => {
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2', 'Failed to load students'),
    ];

    // r1 (the only selectable roster) is already selected.
    render(
      <AssignClassPicker
        rosters={rosters}
        value={{ rosterIds: ['r1'] }}
        onChange={vi.fn()}
      />
    );

    // Against the raw total this would misleadingly read "1 of 2 selected"
    // even though every selectable roster is already checked.
    expect(
      screen.getByText('1 of 1 selected (1 unavailable).')
    ).toBeInTheDocument();
  });

  it('keeps "Select all" available when a selected roster has since gone unavailable', () => {
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2', 'Failed to load students'),
      makeRoster('r3', 'Period 3'),
    ];

    // r2 was selected while healthy and only later failed to load. Counting it
    // raw made selected(2) meet selectable(2), hiding the button while r3 sat
    // unchecked and unreachable via "Select all".
    render(
      <AssignClassPicker
        rosters={rosters}
        value={{ rosterIds: ['r1', 'r2'] }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /Select all/ })
    ).toHaveTextContent('Select all (2)');
    expect(
      screen.getByText('1 of 2 selected (1 unavailable).')
    ).toBeInTheDocument();
  });

  it('ignores ids for rosters that no longer exist', () => {
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];

    // A saved picker value can outlive the roster it points at; the dangling id
    // must not count toward the tally that gates "Select all".
    render(
      <AssignClassPicker
        rosters={rosters}
        value={{ rosterIds: ['r1', 'deleted-roster'] }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /Select all/ })
    ).toHaveTextContent('Select all (2)');
    expect(screen.getByText('1 of 2 selected.')).toBeInTheDocument();
  });

  it('still offers "Clear" when only an unavailable roster is selected', () => {
    const onChange = vi.fn();
    const rosters: ClassRoster[] = [
      makeRoster('r1', 'Period 1', 'Failed to load students'),
    ];

    // Nothing selectable is selected, but the value is non-empty — the teacher
    // must still be able to drop it.
    render(
      <AssignClassPicker
        rosters={rosters}
        value={{ rosterIds: ['r1'] }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onChange).toHaveBeenCalledWith({ rosterIds: [] });
  });
});

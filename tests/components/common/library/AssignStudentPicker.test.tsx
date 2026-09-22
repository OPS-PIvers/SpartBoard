import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AssignStudentPicker } from '@/components/common/library/AssignStudentPicker';
import type { ClassRoster } from '@/types';
import { resolveStudentTargetRef } from '@/utils/studentTargetRef';
import { studentTargetRefKey } from '@/utils/studentTargetRef';

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

const emptyRoster: ClassRoster = {
  id: 'r2',
  name: 'Period 3',
  driveFileId: 'f2',
  studentCount: 0,
  createdAt: 0,
  students: [],
};

const loadErrorRoster: ClassRoster = {
  id: 'r3',
  name: 'Period 4',
  driveFileId: 'f3',
  studentCount: 0,
  createdAt: 0,
  students: [],
  loadError: 'network error',
};

const graceRef = resolveStudentTargetRef(mixedRoster.students[1], mixedRoster);
if (!graceRef) throw new Error('fixture: Grace must resolve to a target ref');
const graceKey = studentTargetRefKey(graceRef);
const spanishTargeting = {
  selected: [graceRef],
  overridesByKey: { [graceKey]: { language: 'es' } },
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
      { 'classlink:SID-2': { timeMultiplier: 2 } },
      []
    );
  });

  it('selects a test-class student by email', () => {
    const onConfirm = vi.fn();
    renderPicker({ onConfirm });

    fireEvent.click(screen.getByRole('checkbox', { name: /kid test/i }));
    fireEvent.click(screen.getByRole('button', { name: /add students/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      [{ kind: 'test', email: 'kid@example.com' }],
      {},
      []
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

    const [selected, , groupIds] = onConfirm.mock.calls[0];
    expect(selected).toEqual(
      expect.arrayContaining([
        { kind: 'classlink', sourcedId: 'SID-2' },
        { kind: 'test', email: 'kid@example.com' },
      ])
    );
    expect(selected).toHaveLength(2);
    // Group provenance is recorded for display (spec §2a `targetGroupIds`).
    expect(groupIds).toEqual(['g1']);
  });

  it('keeps a picked group id after removing one of its members (provenance-only, not retroactively edited)', () => {
    const onConfirm = vi.fn();
    renderPicker({ onConfirm });

    fireEvent.click(screen.getByRole('button', { name: /Group A/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /remove grace hopper/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /add students/i }));

    const [, , groupIds] = onConfirm.mock.calls[0];
    expect(groupIds).toEqual(['g1']);
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

  // Regression: the active roster can disappear out from under an already-open
  // picker (e.g. a roster listener update removes it), not just start empty.
  // The adjust-during-render seed only handled `activeRosterId === null`, so a
  // stale id pointing at a now-gone roster was never replaced — the picker got
  // stuck on the "Select a roster" empty state even though other rosters were
  // still available and visible in the left-hand roster list.
  it('falls back to another roster when the active one is removed from the list', () => {
    const { rerender } = renderPicker({
      rosters: [emptyRoster, mixedRoster],
    });

    // Activate the second roster (mixedRoster) so activeRosterId !== null.
    fireEvent.click(screen.getByRole('button', { name: /period 2/i }));
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    // mixedRoster is removed from the list out from under the open picker.
    rerender(
      <AssignStudentPicker
        isOpen
        onClose={vi.fn()}
        rosters={[emptyRoster]}
        selected={[]}
        overridesByKey={{}}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByText('Select a roster')).not.toBeInTheDocument();
    expect(screen.getByText('No students')).toBeInTheDocument();
  });

  it('offers to switch rosters from the load-error empty state when another roster exists', () => {
    renderPicker({ rosters: [loadErrorRoster, mixedRoster] });

    expect(screen.getByText("Couldn't load students")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /choose another class/i })
    );

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('closes the modal from the load-error empty state when it is the only roster', () => {
    const onClose = vi.fn();
    renderPicker({ rosters: [loadErrorRoster], onClose });

    fireEvent.click(screen.getAllByRole('button', { name: /close/i })[1]);

    expect(onClose).toHaveBeenCalled();
  });

  it('offers to switch rosters from the empty-roster empty state when another roster exists', () => {
    renderPicker({ rosters: [emptyRoster, mixedRoster] });

    expect(screen.getByText('No students')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /choose another class/i })
    );

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('closes the modal from the empty-roster empty state when it is the only roster', () => {
    const onClose = vi.fn();
    renderPicker({ rosters: [emptyRoster], onClose });

    fireEvent.click(screen.getAllByRole('button', { name: /close/i })[1]);

    expect(onClose).toHaveBeenCalled();
  });

  it('disables the advisory Generate once the translation cap is used up', () => {
    renderPicker({
      ...spanishTargeting,
      translation: {
        sourceLanguage: 'en',
        onGenerate: vi.fn(),
        cap: { remaining: 0, total: 2000 },
      },
    });
    const generate = screen.getByRole('button', { name: 'Generate' });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAttribute(
      'title',
      "Your school's monthly translation limit is used up."
    );
  });

  it('keeps the advisory Generate live while budget remains', () => {
    const onGenerate = vi.fn();
    renderPicker({
      ...spanishTargeting,
      translation: {
        sourceLanguage: 'en',
        onGenerate,
        cap: { remaining: 5, total: 2000 },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).toHaveBeenCalledWith(['es']);
  });

  it('renders the translation error inline', () => {
    renderPicker({
      ...spanishTargeting,
      translation: { sourceLanguage: 'en', error: 'Drive is unavailable' },
    });
    expect(screen.getByText('Drive is unavailable')).toBeInTheDocument();
  });
});

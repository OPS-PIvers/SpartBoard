import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';
import {
  modificationClassGroups,
  modificationRows,
} from './ModificationsView.helpers';
import { ModificationGroupsStep } from './ModificationGroupsStep';
import {
  newModificationGroup,
  type ModificationGroup,
} from './modificationGroups';

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));
vi.mock('./SupportsEditor', () => ({ SupportsEditor: () => null }));
vi.mock('@/hooks/useQuizTranslationSettings', () => ({
  useQuizTranslationSettings: () => ({ languages: [] }),
}));

const rows = modificationRows({
  rosters: SAMPLE_ROSTERS,
  selectedRosterIds: ['c1'],
});
const classGroups = modificationClassGroups(SAMPLE_ROSTERS, ['c1'], rows);

let latest: ModificationGroup[] = [];
const Host = () => {
  const [groups, setGroups] = useState([newModificationGroup()]);
  return (
    <ModificationGroupsStep
      groups={groups}
      onChange={(next) => {
        latest = next;
        setGroups(next);
      }}
      rows={rows}
      classGroups={classGroups}
      unresolvableCount={0}
      quizContext={{ questions: [], rubrics: [] }}
      overridesByKey={{}}
    />
  );
};

describe('ModificationGroupsStep class groups', () => {
  it('adds and removes a whole class group from the Students menu', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Select students/ }));
    const group = screen.getByRole('button', { name: /Reading group A/ });
    expect(group).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(group);
    expect(latest[0].studentKeys).toHaveLength(2);
    expect(group).toHaveAttribute('aria-pressed', 'true');
    // Picking exactly one group names it on the menu button.
    expect(
      screen.getByRole('button', { name: 'Reading group A', expanded: true })
    ).toBeInTheDocument();
    fireEvent.click(group);
    expect(latest[0].studentKeys).toHaveLength(0);
  });

  it('disables a group with nobody who has a school sign-in', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Select students/ }));
    expect(
      screen.getByRole('button', { name: /Needs reteach/ })
    ).toBeDisabled();
  });

  it('closes the menu with Done and clears picks with Clear', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Select students/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reading group A/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(latest[0].studentKeys).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Students' })).toBeNull();
  });
});

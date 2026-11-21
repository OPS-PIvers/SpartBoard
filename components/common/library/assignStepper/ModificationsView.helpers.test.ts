import { describe, it, expect } from 'vitest';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';
import {
  modificationClassGroups,
  modificationRows,
} from './ModificationsView.helpers';

describe('modificationClassGroups', () => {
  it('maps each group of the checked classes to the listed rows it covers', () => {
    const rows = modificationRows({
      rosters: SAMPLE_ROSTERS,
      selectedRosterIds: ['c1'],
    });
    const groups = modificationClassGroups(SAMPLE_ROSTERS, ['c1'], rows);
    expect(groups.map((g) => g.name)).toEqual([
      'Reading group A',
      'Needs reteach',
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r.studentId]));
    expect(groups[0].keys.map((k) => byKey.get(k))).toEqual(['a', 'c']);
    // Mateo has no school sign-in, so the group has no one to modify.
    expect(groups[1].keys).toEqual([]);
  });

  it('leaves out unchecked classes and students not listed', () => {
    const rows = modificationRows({
      rosters: SAMPLE_ROSTERS,
      selectedRosterIds: ['c1'],
    }).filter((r) => r.studentId !== 'c');
    const groups = modificationClassGroups(SAMPLE_ROSTERS, ['c1'], rows);
    expect(groups[0].keys).toHaveLength(1);
    expect(modificationClassGroups(SAMPLE_ROSTERS, [], rows)).toEqual([]);
  });
});

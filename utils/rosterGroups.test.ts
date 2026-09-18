/**
 * Pool resolution for saved class groups
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D22).
 *
 * `null` is load-bearing: every caller reads it as "no pool, use the whole
 * class". Returning an empty Set instead would hide the entire roster, which
 * is the failure mode assumption 4 rules out for a deleted group.
 */
import { describe, it, expect } from 'vitest';
import type { ClassRoster } from '@/types';
import { rosterGroupMemberIds } from './rosterGroups';

const roster = {
  id: 'r1',
  name: 'Period 3',
  students: [
    { id: 's1', firstName: 'Ana', lastName: 'B' },
    { id: 's2', firstName: 'Cy', lastName: 'D' },
  ],
  groups: [{ id: 'g1', name: 'Reading', studentIds: ['s1'] }],
} as unknown as ClassRoster;

describe('rosterGroupMemberIds', () => {
  it('returns the group members when everything lines up', () => {
    expect([...(rosterGroupMemberIds(roster, 'g1', true) ?? [])]).toEqual([
      's1',
    ]);
  });

  it('falls back to the whole class when the gate is off', () => {
    expect(rosterGroupMemberIds(roster, 'g1', false)).toBeNull();
  });

  it('falls back to the whole class when no group is chosen', () => {
    expect(rosterGroupMemberIds(roster, null, true)).toBeNull();
    expect(rosterGroupMemberIds(roster, undefined, true)).toBeNull();
  });

  it('falls back to the whole class when the group was deleted', () => {
    // Assumption 4: a group deleted out from under a widget must not empty it.
    expect(rosterGroupMemberIds(roster, 'gone', true)).toBeNull();
  });

  it('falls back to the whole class with no roster', () => {
    expect(rosterGroupMemberIds(undefined, 'g1', true)).toBeNull();
  });
});

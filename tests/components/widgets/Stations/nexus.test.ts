import { describe, it, expect } from 'vitest';
import { RandomGroup } from '@/types';
import { buildStationsFromRandomGroups } from '@/components/widgets/Stations/nexus';

describe('buildStationsFromRandomGroups', () => {
  it('returns empty stations and assignments for an empty group list', () => {
    const result = buildStationsFromRandomGroups([]);
    expect(result.stations).toEqual([]);
    expect(result.assignments).toEqual({});
  });

  it('falls back to "Group N" when group.id is missing or whitespace', () => {
    const groups: RandomGroup[] = [
      { id: '   ', names: ['Alice'] },
      { names: ['Bob'] },
      { id: 'Reading Corner', names: ['Carol'] },
    ];
    const { stations } = buildStationsFromRandomGroups(groups);
    expect(stations.map((s) => s.title)).toEqual([
      'Group 1',
      'Group 2',
      'Reading Corner',
    ]);
  });

  it('trims surrounding whitespace from non-empty group ids', () => {
    const groups: RandomGroup[] = [{ id: '  Math  ', names: [] }];
    const { stations } = buildStationsFromRandomGroups(groups);
    expect(stations[0].title).toBe('Math');
  });

  it('assigns names to the matching station id', () => {
    const groups: RandomGroup[] = [
      { id: 'A', names: ['Alice', 'Bob'] },
      { id: 'B', names: ['Carol'] },
    ];
    const { stations, assignments } = buildStationsFromRandomGroups(groups);
    expect(assignments.Alice).toBe(stations[0].id);
    expect(assignments.Bob).toBe(stations[0].id);
    expect(assignments.Carol).toBe(stations[1].id);
  });

  it('last write wins when a name appears in multiple groups', () => {
    const groups: RandomGroup[] = [
      { id: 'A', names: ['Alice'] },
      { id: 'B', names: ['Alice'] },
    ];
    const { stations, assignments } = buildStationsFromRandomGroups(groups);
    // Alice should land in the second group's station, not the first.
    expect(assignments.Alice).toBe(stations[1].id);
  });
});

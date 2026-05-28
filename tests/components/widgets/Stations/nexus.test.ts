import { describe, it, expect } from 'vitest';
import { RandomGroup, SharedGroup } from '@/types';
import { buildStationsFromRandomGroups } from '@/components/widgets/Stations/nexus';

// Realistic UUID v4 values matching what crypto.randomUUID() emits.
const UUID_A = '550e8400-e29b-4000-a000-426614174000';
const UUID_B = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

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

  // ── Regression: UUID group IDs must NOT appear as station titles ──────────
  //
  // Groups created by the random groupmaker have crypto.randomUUID() as their
  // `id`. Before the fix, buildStationsFromRandomGroups used `group.id`
  // directly as the station title, so teachers would see raw UUIDs like
  // "550e8400-e29b-4000-a000-426614174000" instead of "Group 1".

  it('resolves UUID group ids to human-readable names via sharedGroups', () => {
    const groups: RandomGroup[] = [
      { id: UUID_A, names: ['Alice', 'Bob'] },
      { id: UUID_B, names: ['Carol'] },
    ];
    const sharedGroups: SharedGroup[] = [
      { id: UUID_A, name: 'Red Team' },
      { id: UUID_B, name: 'Blue Team' },
    ];
    const { stations } = buildStationsFromRandomGroups(groups, sharedGroups);
    // Station titles must be the human-readable names, not UUIDs.
    expect(stations[0].title).toBe('Red Team');
    expect(stations[1].title).toBe('Blue Team');
  });

  it('falls back to "Group N" when UUID id has no sharedGroups entry', () => {
    const groups: RandomGroup[] = [
      { id: UUID_A, names: ['Alice'] },
      { id: UUID_B, names: ['Bob'] },
    ];
    // No sharedGroups provided — simulates the pre-existing save where the
    // sharedGroups collection was pruned or not passed.
    const { stations } = buildStationsFromRandomGroups(groups);
    expect(stations[0].title).toBe('Group 1');
    expect(stations[1].title).toBe('Group 2');
  });

  it('falls back to "Group N" when UUID id exists in sharedGroups but name is blank', () => {
    const groups: RandomGroup[] = [{ id: UUID_A, names: ['Alice'] }];
    const sharedGroups: SharedGroup[] = [{ id: UUID_A, name: '   ' }];
    const { stations } = buildStationsFromRandomGroups(groups, sharedGroups);
    expect(stations[0].title).toBe('Group 1');
  });

  it('does not treat non-UUID string ids as UUIDs (legacy path preserved)', () => {
    // Before the fix, ANY non-empty group.id was used as the title. The fix
    // must preserve this behaviour for backward-compat with callers that
    // intentionally set human-readable ids (e.g. the legacy string[][] path
    // in RandomSettings sets id to "Group 1", "Group 2", etc.).
    const groups: RandomGroup[] = [
      { id: 'Group 1', names: ['Alice'] },
      { id: 'Math Corner', names: ['Bob'] },
    ];
    const { stations } = buildStationsFromRandomGroups(groups);
    expect(stations[0].title).toBe('Group 1');
    expect(stations[1].title).toBe('Math Corner');
  });
});

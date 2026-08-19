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

  // ── Regression: PII — assignments must key by roster id, not raw name ─────
  //
  // "Send Groups → Stations" writes `assignments` straight to the target
  // Stations widget's config via updateWidget, bypassing the Stations
  // widget's own coalesceLegacyKeys id-migration step. Without a roster map,
  // the result is keyed by raw student display name, which is never scrubbed
  // (PII_WIDGET_FIELDS has no entry for `assignments`) and reaches Firestore
  // verbatim — even for ordinary class-roster dashboards, not just
  // custom-roster mode.

  it('keys assignments by roster student id when a name->id map is provided', () => {
    const groups: RandomGroup[] = [{ id: 'A', names: ['Alice Smith'] }];
    const rosterNameToId = new Map([['Alice Smith', 'student-123']]);
    const { assignments } = buildStationsFromRandomGroups(
      groups,
      undefined,
      rosterNameToId
    );
    expect(assignments['student-123']).toBeDefined();
    expect(assignments).not.toHaveProperty('Alice Smith');
  });

  it('falls back to the raw name when it is not found in the roster map', () => {
    const groups: RandomGroup[] = [{ id: 'A', names: ['Custom Kid'] }];
    const rosterNameToId = new Map([['Alice Smith', 'student-123']]);
    const { assignments } = buildStationsFromRandomGroups(
      groups,
      undefined,
      rosterNameToId
    );
    expect(assignments['Custom Kid']).toBeDefined();
  });

  it('falls back to raw name keys when no roster map is passed (custom-roster mode)', () => {
    const groups: RandomGroup[] = [{ id: 'A', names: ['Alice Smith'] }];
    const { assignments } = buildStationsFromRandomGroups(groups);
    expect(assignments['Alice Smith']).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  UNASSIGNED_ZONE_ID,
  toggleLockedName,
  clearLockedNames,
  moveNameToGroup,
  mergeLockedWithFresh,
  shuffleWithLocks,
  findGroupIdForName,
  collectGroupNames,
} from './randomEditHelpers';
import type { RandomGroup } from '@/types';

const makeGroups = (data: Record<string, string[]>): RandomGroup[] =>
  Object.entries(data).map(([id, names]) => ({ id, names }));

describe('toggleLockedName', () => {
  it('adds a name when not present', () => {
    expect(toggleLockedName([], 'Alice')).toEqual(['Alice']);
    expect(toggleLockedName(['Bob'], 'Alice')).toEqual(['Bob', 'Alice']);
  });

  it('removes a name when present', () => {
    expect(toggleLockedName(['Alice', 'Bob'], 'Alice')).toEqual(['Bob']);
  });

  it('treats undefined as empty', () => {
    expect(toggleLockedName(undefined, 'Alice')).toEqual(['Alice']);
  });
});

describe('clearLockedNames', () => {
  it('removes the requested names', () => {
    expect(clearLockedNames(['Alice', 'Bob', 'Carol'], ['Bob'])).toEqual([
      'Alice',
      'Carol',
    ]);
  });

  it('returns empty for missing input', () => {
    expect(clearLockedNames(undefined, ['Alice'])).toEqual([]);
    expect(clearLockedNames([], ['Alice'])).toEqual([]);
  });
});

describe('moveNameToGroup', () => {
  it('moves a name from one group to another', () => {
    const groups = makeGroups({ A: ['Alice', 'Bob'], B: ['Carol'] });
    const next = moveNameToGroup(groups, 'Alice', 'B');
    expect(next).toEqual([
      { id: 'A', names: ['Bob'] },
      { id: 'B', names: ['Carol', 'Alice'] },
    ]);
  });

  it('removes a name when target is the unassigned zone', () => {
    const groups = makeGroups({ A: ['Alice', 'Bob'] });
    const next = moveNameToGroup(groups, 'Alice', UNASSIGNED_ZONE_ID);
    expect(next).toEqual([{ id: 'A', names: ['Bob'] }]);
  });

  it('dedupes when target already contains the name', () => {
    const groups = makeGroups({ A: ['Alice'], B: ['Alice'] });
    const next = moveNameToGroup(groups, 'Alice', 'B');
    expect(next).toEqual([
      { id: 'A', names: [] },
      { id: 'B', names: ['Alice'] },
    ]);
  });
});

describe('findGroupIdForName', () => {
  it('returns the id of the holding group', () => {
    const groups = makeGroups({ A: ['Alice'], B: ['Bob'] });
    expect(findGroupIdForName(groups, 'Bob')).toBe('B');
  });

  it('returns null when not found', () => {
    expect(findGroupIdForName(makeGroups({ A: ['Alice'] }), 'Bob')).toBeNull();
    expect(findGroupIdForName(null, 'Bob')).toBeNull();
  });
});

describe('collectGroupNames', () => {
  it('flattens names across groups in order', () => {
    const groups = makeGroups({ A: ['Alice', 'Bob'], B: ['Carol'] });
    expect(collectGroupNames(groups)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('mergeLockedWithFresh', () => {
  it('keeps locked names in their groups and fills with fresh', () => {
    const currentGroups = makeGroups({
      A: ['Alice', 'Bob'],
      B: ['Carol', 'Dave'],
    });
    const freshGroups = makeGroups({
      X: ['Eve', 'Frank'],
      Y: ['Grace', 'Heidi'],
    });
    const merged = mergeLockedWithFresh({
      currentGroups,
      lockedNames: ['Alice', 'Dave'],
      freshGroups,
    });
    expect(merged).toEqual([
      { id: 'A', names: ['Alice', 'Eve', 'Frank'] },
      { id: 'B', names: ['Dave', 'Grace', 'Heidi'] },
    ]);
  });

  it('preserves group ids so dashboard links survive', () => {
    const currentGroups = makeGroups({ G1: ['Alice'] });
    const freshGroups = makeGroups({ X: ['Bob'] });
    const merged = mergeLockedWithFresh({
      currentGroups,
      lockedNames: ['Alice'],
      freshGroups,
    });
    expect(merged[0].id).toBe('G1');
  });

  it('handles missing fresh groups (fewer fresh than skeleton)', () => {
    const currentGroups = makeGroups({
      A: ['Alice'],
      B: ['Bob'],
      C: ['Carol'],
    });
    const freshGroups = makeGroups({ X: ['Eve'] });
    const merged = mergeLockedWithFresh({
      currentGroups,
      lockedNames: ['Alice', 'Bob', 'Carol'],
      freshGroups,
    });
    // Locked names preserved, fresh distributed by index, empty otherwise
    expect(merged).toEqual([
      { id: 'A', names: ['Alice', 'Eve'] },
      { id: 'B', names: ['Bob'] },
      { id: 'C', names: ['Carol'] },
    ]);
  });
});

describe('shuffleWithLocks', () => {
  it('keeps locked names at their original indices', () => {
    const current = ['Alice', 'Bob', 'Carol', 'Dave'];
    const shuffled = shuffleWithLocks(current, ['Bob', 'Dave']);
    expect(shuffled[1]).toBe('Bob');
    expect(shuffled[3]).toBe('Dave');
    // Same name set
    expect([...shuffled].sort()).toEqual([...current].sort());
  });

  it('reshuffles only unlocked positions', () => {
    // With every name locked, the shuffle is a no-op.
    const current = ['Alice', 'Bob', 'Carol'];
    expect(shuffleWithLocks(current, ['Alice', 'Bob', 'Carol'])).toEqual(
      current
    );
  });

  it('handles empty input', () => {
    expect(shuffleWithLocks([], [])).toEqual([]);
  });

  it('produces no holes when no names are locked', () => {
    const current = ['A', 'B', 'C', 'D'];
    const next = shuffleWithLocks(current, []);
    expect(next).toHaveLength(4);
    expect([...next].sort()).toEqual([...current].sort());
  });
});

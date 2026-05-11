import { describe, it, expect } from 'vitest';
import { RandomGroup } from '@/types';
import { makeJigsawExpertGroups, makeNameGroups } from './groupMaker';

const groupOf = (...names: string[]): RandomGroup => ({
  id: crypto.randomUUID(),
  names,
});

describe('makeJigsawExpertGroups', () => {
  it('returns an empty array when no home groups are supplied', () => {
    expect(makeJigsawExpertGroups([], 4)).toEqual([]);
  });

  it('produces K expert groups from evenly-sized home groups (K = home size)', () => {
    // 4 home groups of 3 with K=3. The round-robin with rotation still places
    // exactly one member from each home group into each expert group, which
    // is the classic jigsaw invariant — even though the per-position mapping
    // is reshuffled by the offset.
    const home = [
      groupOf('A1', 'A2', 'A3'),
      groupOf('B1', 'B2', 'B3'),
      groupOf('C1', 'C2', 'C3'),
      groupOf('D1', 'D2', 'D3'),
    ];

    const expert = makeJigsawExpertGroups(home, 3);

    expect(expert.length).toBe(3);
    // Each expert group should be size 4 and have one student from each home.
    for (const e of expert) {
      expect(e.names.length).toBe(4);
      const prefixes = e.names.map((n) => n[0]).sort();
      expect(prefixes).toEqual(['A', 'B', 'C', 'D']);
    }
    // All 12 students accounted for exactly once.
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      [
        'A1',
        'A2',
        'A3',
        'B1',
        'B2',
        'B3',
        'C1',
        'C2',
        'C3',
        'D1',
        'D2',
        'D3',
      ].sort()
    );
  });

  it('spreads uneven home groups across K expert groups', () => {
    // 11 students into home groups of 4 → sizes [4, 4, 3]. With K=4 every
    // student lands in an expert group; the rotation prevents any single
    // expert from absorbing all the "extra" wrap-around students.
    const home = [
      groupOf('A1', 'A2', 'A3', 'A4'),
      groupOf('B1', 'B2', 'B3', 'B4'),
      groupOf('C1', 'C2', 'C3'),
    ];

    const expert = makeJigsawExpertGroups(home, 4);

    // All 11 students preserved exactly once.
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3'].sort()
    );
    // Sizes should be 3 or 2 (no expert group ends up empty or oversized).
    for (const e of expert) {
      expect(e.names.length).toBeGreaterThanOrEqual(2);
      expect(e.names.length).toBeLessThanOrEqual(3);
    }
  });

  it('drops empty buckets when K exceeds the available students', () => {
    // Single home group of size 2 with K=2 produces all-singleton experts,
    // which then collapse via orphan merge into one balanced group.
    const home = [groupOf('A1', 'A2'), groupOf(), groupOf('C1')];

    const expert = makeJigsawExpertGroups(home, 2);

    // All 3 students preserved.
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      ['A1', 'A2', 'C1'].sort()
    );
    // No empty groups emitted.
    expect(expert.every((g) => g.names.length > 0)).toBe(true);
  });

  it('merges orphan singletons into the smallest non-singleton expert group', () => {
    // Home group sizes 4 / 1 / 2 with K=4. The round-robin will inevitably
    // create at least one expert group of size 1; orphan merge folds it in.
    const home = [
      groupOf('A1', 'A2', 'A3', 'A4'),
      groupOf('B1'),
      groupOf('C1', 'C2'),
    ];

    const expert = makeJigsawExpertGroups(home, 4);

    // No singletons survive
    expect(expert.every((g) => g.names.length >= 2)).toBe(true);
    // Total student count is preserved
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      ['A1', 'A2', 'A3', 'A4', 'B1', 'C1', 'C2'].sort()
    );
  });

  it('leaves all-singleton expert groups alone (degenerate single-home case)', () => {
    // Single home group of size 3 with K=3 produces all-singleton expert
    // groups; with no larger expert group to fold orphans into, they stay
    // as singletons. The caller surfaces a degenerate-jigsaw warning toast.
    const home = [groupOf('A', 'B', 'C')];

    const expert = makeJigsawExpertGroups(home, 3);

    expect(expert.length).toBe(3);
    expect(expert.every((g) => g.names.length === 1)).toBe(true);
    expect(expert.flatMap((g) => g.names).sort()).toEqual(['A', 'B', 'C']);
  });

  it('balances K < max home group size by wrapping with rotation', () => {
    // 6 home groups of 4 with K=3 — the "default jigsaw" scenario for a
    // 24-student class. Each expert group should end up the same size (8),
    // with members drawn from every home group (rotation spreads the
    // wrap-around evenly so no expert is overloaded).
    const home = [
      groupOf('A1', 'A2', 'A3', 'A4'),
      groupOf('B1', 'B2', 'B3', 'B4'),
      groupOf('C1', 'C2', 'C3', 'C4'),
      groupOf('D1', 'D2', 'D3', 'D4'),
      groupOf('E1', 'E2', 'E3', 'E4'),
      groupOf('F1', 'F2', 'F3', 'F4'),
    ];

    const expert = makeJigsawExpertGroups(home, 3);

    expect(expert.length).toBe(3);
    expect(expert.every((g) => g.names.length === 8)).toBe(true);
    // Every home group should be represented in every expert group.
    for (const e of expert) {
      const prefixes = new Set(e.names.map((n) => n[0]));
      expect(prefixes).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
    }
    // All 24 students present exactly once.
    expect(expert.flatMap((g) => g.names).sort().length).toBe(24);
  });

  it('handles K > max home group size by spreading contributions', () => {
    // 2 home groups of 2 with K=4 — more experts than students per home.
    // Each home group can only fill 2 of the 4 expert positions; rotation
    // ensures the contributions don't pile up in the same experts.
    const home = [groupOf('A1', 'A2'), groupOf('B1', 'B2')];

    const expert = makeJigsawExpertGroups(home, 4);

    // 4 students total across at most 4 experts. After orphan merge no
    // singleton survives, so the count of expert groups drops to <= 2.
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      ['A1', 'A2', 'B1', 'B2'].sort()
    );
    expect(expert.every((g) => g.names.length >= 2)).toBe(true);
  });

  it('clamps numExpertGroups to at least 1', () => {
    const home = [groupOf('A1', 'A2'), groupOf('B1', 'B2')];

    const expert = makeJigsawExpertGroups(home, 0);

    // K=0 is invalid; algorithm should fall back to 1 expert group.
    expect(expert.length).toBe(1);
    expect(expert[0].names.sort()).toEqual(['A1', 'A2', 'B1', 'B2'].sort());
  });

  it('assigns a fresh id to each generated expert group', () => {
    const home = [groupOf('A1', 'A2'), groupOf('B1', 'B2')];
    const expert = makeJigsawExpertGroups(home, 2);
    const ids = expert.map((g) => g.id);

    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(
      true
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('makeNameGroups (regression — used by Jigsaw home-group fallback)', () => {
  it('chunks names into the requested group size', () => {
    const groups = makeNameGroups(['a', 'b', 'c', 'd', 'e'], 2);
    expect(groups.length).toBe(3);
    expect(groups[0].names.length).toBe(2);
    expect(groups[2].names.length).toBe(1);
  });
});

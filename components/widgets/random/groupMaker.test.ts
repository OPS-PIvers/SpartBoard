import { describe, it, expect } from 'vitest';
import { RandomGroup } from '@/types';
import { makeJigsawExpertGroups, makeNameGroups } from './groupMaker';

const groupOf = (...names: string[]): RandomGroup => ({
  id: crypto.randomUUID(),
  names,
});

describe('makeJigsawExpertGroups', () => {
  it('returns an empty array when no home groups are supplied', () => {
    expect(makeJigsawExpertGroups([])).toEqual([]);
  });

  it('transposes evenly-sized home groups (position N becomes expert N)', () => {
    const home = [
      groupOf('A1', 'A2', 'A3'),
      groupOf('B1', 'B2', 'B3'),
      groupOf('C1', 'C2', 'C3'),
      groupOf('D1', 'D2', 'D3'),
    ];

    const expert = makeJigsawExpertGroups(home);

    expect(expert.map((g) => g.names)).toEqual([
      ['A1', 'B1', 'C1', 'D1'],
      ['A2', 'B2', 'C2', 'D2'],
      ['A3', 'B3', 'C3', 'D3'],
    ]);
  });

  it('skips missing positions when home groups are uneven', () => {
    // 11 students into home groups of 4 → sizes [4, 4, 3]. Position 4 only
    // exists in the first two home groups.
    const home = [
      groupOf('A1', 'A2', 'A3', 'A4'),
      groupOf('B1', 'B2', 'B3', 'B4'),
      groupOf('C1', 'C2', 'C3'),
    ];

    const expert = makeJigsawExpertGroups(home);

    expect(expert.map((g) => g.names)).toEqual([
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['A3', 'B3', 'C3'],
      ['A4', 'B4'],
    ]);
  });

  it('drops expert positions that would have zero members', () => {
    // Empty home groups in the input must not produce empty expert groups.
    // Here pos 1 only has A2 (singleton) — orphan merging then folds A2 into
    // the only larger expert group, ['A1', 'C1'].
    const home = [groupOf('A1', 'A2'), groupOf(), groupOf('C1')];

    const expert = makeJigsawExpertGroups(home);

    expect(expert.map((g) => g.names.sort())).toEqual([
      ['A1', 'A2', 'C1'].sort(),
    ]);
  });

  it('merges orphan singletons into the smallest non-singleton expert group', () => {
    // Home group sizes 4 / 1 / 2 ⇒ raw transpose:
    //   pos 0: A1, B1, C1   (size 3)
    //   pos 1: A2, C2       (size 2)
    //   pos 2: A3           (size 1, orphan)
    //   pos 3: A4           (size 1, orphan)
    // After merging each orphan into the smallest non-singleton:
    //   A3 → smallest = [A2, C2] → [A2, C2, A3] (size 3)
    //   A4 → smallest now ties at size 3 — picks one of them
    const home = [
      groupOf('A1', 'A2', 'A3', 'A4'),
      groupOf('B1'),
      groupOf('C1', 'C2'),
    ];

    const expert = makeJigsawExpertGroups(home);

    // No singletons survive
    expect(expert.every((g) => g.names.length >= 2)).toBe(true);
    // Total student count is preserved
    expect(expert.flatMap((g) => g.names).sort()).toEqual(
      ['A1', 'A2', 'A3', 'A4', 'B1', 'C1', 'C2'].sort()
    );
  });

  it('leaves all-singleton expert groups alone (degenerate single-home case)', () => {
    // Single home group of size N transposes to N singleton expert groups.
    // There is no larger expert group to fold orphans into, so all stay as
    // singletons; the caller surfaces a degenerate-jigsaw warning toast
    // rather than silently merging them all into one big group.
    const home = [groupOf('A', 'B', 'C')];

    const expert = makeJigsawExpertGroups(home);

    expect(expert.map((g) => g.names)).toEqual([['A'], ['B'], ['C']]);
  });

  it('assigns a fresh id to each generated expert group', () => {
    const home = [groupOf('A1', 'A2'), groupOf('B1', 'B2')];
    const expert = makeJigsawExpertGroups(home);
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

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
    const home = [groupOf('A1', 'A2'), groupOf(), groupOf('C1')];

    const expert = makeJigsawExpertGroups(home);

    expect(expert.map((g) => g.names)).toEqual([['A1', 'C1'], ['A2']]);
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

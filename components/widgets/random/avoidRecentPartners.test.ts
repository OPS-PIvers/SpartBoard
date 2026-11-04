import { describe, it, expect } from 'vitest';
import { Student } from '@/types';
import {
  addRecentGrouping,
  makeAvoidingRecent,
  makeNameGroups,
  makeRestrictedGroups,
  recentPairWeights,
  repeatScore,
  type RecentGrouping,
} from './groupMaker';

const names = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`);
const round = (scope: string, groups: string[][]): RecentGrouping => ({
  scope,
  groups: groups.map((g) => ({ names: g })),
});

describe('avoid recent partners', () => {
  it('weights the newest round most', () => {
    const w = recentPairWeights([
      round('c', [['A', 'B']]),
      round('c', [['A', 'C']]),
      round('c', [['B', 'C']]),
    ]);
    expect(w.get('A\nB')).toBe(1);
    expect(w.get('A\nC')).toBe(2);
    expect(w.get('B\nC')).toBe(3);
  });

  it('counts a single remembered round at full weight', () => {
    const w = recentPairWeights([round('c', [['A', 'B']])]);
    expect(w.get('A\nB')).toBe(3);
  });

  it('keeps the last 3 rounds per class and leaves other classes alone', () => {
    let h: RecentGrouping[] = [round('other', [['X', 'Y']])];
    for (let i = 0; i < 5; i++) {
      h = addRecentGrouping(h, 'c', [{ id: `${i}`, names: [`N${i}`, 'Z'] }]);
    }
    expect(h.filter((r) => r.scope === 'other')).toHaveLength(1);
    const mine = h.filter((r) => r.scope === 'c');
    expect(mine.map((r) => r.groups[0].names[0])).toEqual(['N2', 'N3', 'N4']);
  });

  it('stores groups as objects, never nested arrays', () => {
    const h = addRecentGrouping(undefined, 'c', [{ id: 'g', names: ['A'] }]);
    expect(h[0].groups[0]).toEqual({ names: ['A'] });
  });

  it('finds groups with no repeated partners when one exists', () => {
    const last = makeNameGroups(names(12), 3);
    const history = [
      round(
        'c',
        last.map((g) => g.names)
      ),
    ];
    for (let t = 0; t < 20; t++) {
      const next = makeAvoidingRecent(
        () => ({ groups: makeNameGroups(names(12), 3) }),
        history
      );
      expect(repeatScore(next.groups, recentPairWeights(history))).toBe(0);
    }
  });

  it('never trades a keep-apart restriction for fewer repeats', () => {
    const student = (id: string, restricted: string[] = []): Student => ({
      id,
      firstName: id,
      lastName: '',
      pin: '00',
      restrictedStudentIds: restricted,
    });
    const roster = [
      student('A', ['B']),
      student('B'),
      student('C'),
      student('D'),
    ];
    // Last time A sat with C and B with D, so the only repeat-free split puts A with B.
    const history = [
      round('c', [
        ['A', 'C'],
        ['B', 'D'],
      ]),
    ];
    for (let t = 0; t < 20; t++) {
      const { groups, unsatisfied } = makeAvoidingRecent(
        () => makeRestrictedGroups(roster, 2),
        history
      );
      expect(unsatisfied).toBe(0);
      expect(
        groups.some((g) => g.names.includes('A') && g.names.includes('B'))
      ).toBe(false);
    }
  });

  it('runs the maker once when there is no history', () => {
    let calls = 0;
    makeAvoidingRecent(() => {
      calls++;
      return { groups: makeNameGroups(names(6), 2) };
    }, []);
    expect(calls).toBe(1);
  });
});

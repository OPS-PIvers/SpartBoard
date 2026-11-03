import { describe, it, expect } from 'vitest';
import { Student, RandomGroup } from '@/types';
import { shuffleArray } from '@/utils/randomHelpers';
import {
  makeRestrictedGroups,
  makeRestrictedGroupsByCount,
  makeNameGroups,
  makeNameGroupsByCount,
  makeGroupsWithLockedCohorts,
} from './groupMaker';
import { shuffleWithLocks } from './randomEditHelpers';

// Each check allows 6 standard deviations, so a fair generator fails about once in 10^8 runs.
const SIGMAS = 6;

const student = (i: number): Student => ({
  id: `s${i}`,
  firstName: `S${i}`,
  lastName: '',
  pin: '00',
});

const names = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`);

function expectBinomialSpread(counts: number[], trials: number, p: number) {
  const mean = trials * p;
  const sd = Math.sqrt(trials * p * (1 - p));
  for (const c of counts) {
    expect(Math.abs(c - mean)).toBeLessThan(SIGMAS * sd);
  }
}

// Counts how often each unordered pair of names lands in the same group.
function pairCounts(
  n: number,
  trials: number,
  make: () => RandomGroup[]
): number[] {
  const counts = new Map<string, number>();
  for (let t = 0; t < trials; t++) {
    for (const g of make()) {
      const sorted = [...g.names].sort();
      for (let a = 0; a < sorted.length; a++) {
        for (let b = a + 1; b < sorted.length; b++) {
          const key = `${sorted[a]}|${sorted[b]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const out: number[] = [];
  const all = names(n).sort();
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      out.push(counts.get(`${all[a]}|${all[b]}`) ?? 0);
    }
  }
  return out;
}

describe('Randomizer fairness', () => {
  it('shuffleArray puts every name in every position equally often', () => {
    const n = 6;
    const trials = 30000;
    const grid = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let t = 0; t < trials; t++) {
      shuffleArray(names(n)).forEach((name, pos) => {
        grid[Number(name.slice(1))][pos]++;
      });
    }
    for (const row of grid) expectBinomialSpread(row, trials, 1 / n);
  });

  it('shuffleArray produces all orderings equally often', () => {
    const trials = 24000;
    const counts = new Map<string, number>();
    for (let t = 0; t < trials; t++) {
      const key = shuffleArray(['a', 'b', 'c', 'd']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    expectBinomialSpread([...counts.values()], trials, 1 / 24);
  });

  // 12 names in 4 groups of 3: any given pair shares a group 2/11 of the time.
  const N = 12;
  const TRIALS = 8000;
  const PAIR_P = 2 / 11;

  it('makeRestrictedGroups pairs every two students equally often', () => {
    const roster = Array.from({ length: N }, (_, i) => student(i));
    const counts = pairCounts(
      N,
      TRIALS,
      () => makeRestrictedGroups(roster, 3).groups
    );
    expectBinomialSpread(counts, TRIALS, PAIR_P);
  });

  it('makeRestrictedGroupsByCount pairs every two students equally often', () => {
    const roster = Array.from({ length: N }, (_, i) => student(i));
    const counts = pairCounts(
      N,
      TRIALS,
      () => makeRestrictedGroupsByCount(roster, 4).groups
    );
    expectBinomialSpread(counts, TRIALS, PAIR_P);
  });

  it('makeNameGroups pairs every two names equally often', () => {
    const counts = pairCounts(N, TRIALS, () => makeNameGroups(names(N), 3));
    expectBinomialSpread(counts, TRIALS, PAIR_P);
  });

  it('makeNameGroupsByCount pairs every two names equally often', () => {
    const counts = pairCounts(N, TRIALS, () =>
      makeNameGroupsByCount(names(N), 4)
    );
    expectBinomialSpread(counts, TRIALS, PAIR_P);
  });

  it('makeGroupsWithLockedCohorts gives a locked group no fixed position', () => {
    const roster = Array.from({ length: N }, (_, i) => student(i));
    const trials = 8000;
    const positions = new Array<number>(4).fill(0);
    for (let t = 0; t < trials; t++) {
      const { groups } = makeGroupsWithLockedCohorts({
        students: roster,
        lockedCohorts: [['s0', 's1', 's2']],
        numGroups: 4,
      });
      positions[groups.findIndex((g) => g.names.includes('S0'))]++;
    }
    expectBinomialSpread(positions, trials, 1 / 4);
  });

  it('shuffleWithLocks keeps locked names and spreads the rest evenly', () => {
    const current = names(5);
    const trials = 20000;
    const grid = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
    for (let t = 0; t < trials; t++) {
      const out = shuffleWithLocks(current, ['S2']);
      expect(out[2]).toBe('S2');
      out.forEach((name, pos) => grid[Number(name.slice(1))][pos]++);
    }
    for (const n of [0, 1, 3, 4]) {
      expectBinomialSpread(
        [0, 1, 3, 4].map((pos) => grid[n][pos]),
        trials,
        1 / 4
      );
    }
  });
});

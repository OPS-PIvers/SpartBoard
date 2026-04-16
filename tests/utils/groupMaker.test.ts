import { describe, it, expect } from 'vitest';
import type { Student } from '@/types';
import {
  makeRestrictedGroups,
  makeNameGroups,
} from '@/components/widgets/random/groupMaker';

const student = (id: string, restricted?: string[]): Student => {
  const s: Student = { id, firstName: id.toUpperCase(), lastName: '', pin: '' };
  if (restricted) s.restrictedStudentIds = restricted;
  return s;
};

const collectPairs = (groups: { names: string[] }[]): Set<string> => {
  const pairs = new Set<string>();
  for (const g of groups) {
    for (let i = 0; i < g.names.length; i++) {
      for (let j = i + 1; j < g.names.length; j++) {
        const [a, b] = [g.names[i], g.names[j]].sort();
        pairs.add(`${a}|${b}`);
      }
    }
  }
  return pairs;
};

describe('makeRestrictedGroups', () => {
  it('returns empty result for an empty roster', () => {
    const result = makeRestrictedGroups([], 3);
    expect(result.groups).toEqual([]);
    expect(result.unsatisfied).toBe(0);
  });

  it('keeps restricted pairs apart when feasible', () => {
    const students = [
      student('a', ['b']),
      student('b', ['a']),
      ...['c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => student(id)),
    ];

    // The greedy placer isn't guaranteed to hit a satisfying layout on every
    // shuffle, but when it does succeed (unsatisfied === 0) the restricted
    // pair must never share a group. Across many runs the success rate
    // should be overwhelming for this easy instance.
    let successes = 0;
    for (let i = 0; i < 30; i++) {
      const { groups, unsatisfied } = makeRestrictedGroups(students, 3);
      if (unsatisfied === 0) {
        successes++;
        const pairs = collectPairs(groups);
        expect(pairs.has('A|B')).toBe(false);
      }
    }
    expect(successes).toBeGreaterThan(20);
  });

  it('produces groups close to the requested size', () => {
    const students = Array.from({ length: 10 }, (_, i) => student(`s${i}`));
    const { groups } = makeRestrictedGroups(students, 3);
    const sizes = groups.map((g) => g.names.length).sort();
    expect(groups.length).toBe(4);
    expect(sizes[sizes.length - 1] - sizes[0]).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('still produces groups but reports unsatisfied when no layout satisfies all restrictions', () => {
    // Three students, all mutually restricted, forced into a single group of 3.
    const students = [
      student('a', ['b', 'c']),
      student('b', ['a', 'c']),
      student('c', ['a', 'b']),
    ];
    const { groups, unsatisfied } = makeRestrictedGroups(students, 3);
    expect(groups.length).toBe(1);
    expect(groups[0].names.length).toBe(3);
    expect(unsatisfied).toBeGreaterThan(0);
  });

  it('tolerates asymmetric restriction data without crashing', () => {
    // Raw one-sided restriction — the widget normalizes this on save, but the
    // group-maker shouldn't throw if it receives un-normalized input.
    const students = [
      student('a', ['b']),
      student('b'),
      student('c'),
      student('d'),
    ];
    expect(() => makeRestrictedGroups(students, 2)).not.toThrow();
  });
});

describe('makeNameGroups', () => {
  it('chunks names into groups of the requested size', () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const groups = makeNameGroups(names, 2);
    expect(groups.length).toBe(3);
    expect(groups.flatMap((g) => g.names).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(groups.slice(0, 2).every((g) => g.names.length === 2)).toBe(true);
  });

  it('returns empty when given no names', () => {
    expect(makeNameGroups([], 3)).toEqual([]);
  });
});

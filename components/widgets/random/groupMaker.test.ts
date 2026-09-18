import { describe, it, expect, vi, afterEach } from 'vitest';
import { RandomGroup, Student } from '@/types';
import {
  makeGroupsWithLockedCohorts,
  makeJigsawExpertGroups,
  makeNameGroups,
  makeNameGroupsByCount,
  makeRestrictedGroups,
  makeRestrictedGroupsByCount,
} from './groupMaker';

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

  it('treats NaN numExpertGroups as 1 (no silent empty output)', () => {
    const home = [groupOf('A1', 'A2'), groupOf('B1', 'B2')];

    const expert = makeJigsawExpertGroups(home, NaN);

    // Without the Number.isFinite guard, Math.max(1, NaN) returns NaN and
    // Array.from({length: NaN}) returns [] — yielding zero expert groups
    // silently. Verify we land on the K=1 fallback instead.
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

describe('makeNameGroupsByCount', () => {
  it('returns an empty array when no names are supplied', () => {
    expect(makeNameGroupsByCount([], 4)).toEqual([]);
  });

  it('produces exactly the requested number of groups when count divides evenly', () => {
    const groups = makeNameGroupsByCount(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      4
    );
    expect(groups.length).toBe(4);
    for (const g of groups) expect(g.names.length).toBe(2);
    expect(groups.flatMap((g) => g.names).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  it('produces exactly the requested number of groups even on awkward divisions (30 students ÷ 7 groups)', () => {
    // This is the core motivation: chunk-by-size silently produces ⌈30/⌈30/7⌉⌉ =
    // 6 groups instead of the 7 the user asked for. Round-robin distribution
    // honors the request exactly.
    const names = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const groups = makeNameGroupsByCount(names, 7);
    expect(groups.length).toBe(7);
    const total = groups.reduce((sum, g) => sum + g.names.length, 0);
    expect(total).toBe(30);
    // Group sizes should differ by at most 1.
    const sizes = groups.map((g) => g.names.length).sort();
    expect(sizes[sizes.length - 1] - sizes[0]).toBeLessThanOrEqual(1);
  });

  it('clamps numGroups to names.length when asked for more groups than names', () => {
    const groups = makeNameGroupsByCount(['a', 'b', 'c'], 7);
    expect(groups.length).toBe(3);
    for (const g of groups) expect(g.names.length).toBe(1);
  });

  it('handles a non-finite count by collapsing to 1 group', () => {
    const groups = makeNameGroupsByCount(['a', 'b', 'c'], Number.NaN);
    expect(groups.length).toBe(1);
    expect(groups[0].names.length).toBe(3);
  });

  it('gives every group a unique id', () => {
    const groups = makeNameGroupsByCount(['a', 'b', 'c', 'd'], 2);
    const ids = groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('makeRestrictedGroupsByCount', () => {
  const student = (
    id: string,
    firstName: string,
    restrictedStudentIds: string[] = []
  ): Student => ({
    id,
    firstName,
    lastName: '',
    pin: '00',
    restrictedStudentIds,
  });

  it('returns empty result when no students are supplied', () => {
    const { groups, unsatisfied } = makeRestrictedGroupsByCount([], 4);
    expect(groups).toEqual([]);
    expect(unsatisfied).toBe(0);
  });

  it('produces exactly the requested number of groups', () => {
    const students = Array.from({ length: 12 }, (_, i) =>
      student(`s${i}`, `name${i}`)
    );
    const { groups } = makeRestrictedGroupsByCount(students, 5);
    expect(groups.length).toBe(5);
    const total = groups.reduce((sum, g) => sum + g.names.length, 0);
    expect(total).toBe(12);
  });

  it('honors restrictions when a conflict-free placement is available', () => {
    // 6 students, 2 with mutual restriction. With 3 groups they should land
    // in different groups since 3 groups easily accommodate the conflict.
    const a = student('a', 'A', ['b']);
    const b = student('b', 'B', ['a']);
    const others = [
      student('c', 'C'),
      student('d', 'D'),
      student('e', 'E'),
      student('f', 'F'),
    ];
    const { groups, unsatisfied } = makeRestrictedGroupsByCount(
      [a, b, ...others],
      3
    );
    expect(groups.length).toBe(3);
    expect(unsatisfied).toBe(0);
    const aGroup = groups.find((g) => g.names.includes('A'));
    const bGroup = groups.find((g) => g.names.includes('B'));
    expect(aGroup).not.toBe(bGroup);
  });

  it('clamps numGroups to students.length when asked for more groups than students', () => {
    const students = [student('a', 'A'), student('b', 'B')];
    const { groups } = makeRestrictedGroupsByCount(students, 7);
    expect(groups.length).toBe(2);
  });
});

// Restriction lists are supposed to be symmetric (a teacher who checks "keep
// A away from B" should get the same protection whichever student's record
// actually stores the edge), but real roster data reaching these functions
// isn't guaranteed to be normalized — it's read straight from Firestore, not
// passed through the roster editor's `normalizeRestrictions` safeguard. The
// group makers must therefore treat a restriction as binding regardless of
// which side declared it, not just the side of the student being placed.
describe('restriction symmetry (one-directional roster data)', () => {
  const student = (
    id: string,
    firstName: string,
    restrictedStudentIds: string[] = []
  ): Student => ({
    id,
    firstName,
    lastName: '',
    pin: '00',
    restrictedStudentIds,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makeRestrictedGroups still flags a conflict when only the OTHER student declared the restriction', () => {
    // B declares a restriction against A; A's own record has none — the
    // asymmetric shape normalizeRestrictions is meant to heal, but this
    // roster snapshot never went through that pass.
    const b = student('b', 'B', ['a']);
    const a = student('a', 'A', []);

    // Force a single group so B and A are necessarily placed together,
    // and pin the shuffle to identity order (B processed before A) so the
    // greedy loop reaches A — the unrestricted side — last, which is
    // exactly the ordering the one-directional check used to miss.
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { groups, unsatisfied } = makeRestrictedGroups([b, a], 2);

    expect(groups.length).toBe(1);
    expect(groups[0].names.sort()).toEqual(['A', 'B']);
    // The forced placement violates B's stated restriction — it must be
    // reported so the caller's "couldn't satisfy all restrictions" toast
    // fires, even though A's own list was empty.
    expect(unsatisfied).toBe(1);
  });

  it('makeRestrictedGroupsByCount still flags a conflict when only the OTHER student declared the restriction', () => {
    const b = student('b', 'B', ['a']);
    const a = student('a', 'A', []);

    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { groups, unsatisfied } = makeRestrictedGroupsByCount([b, a], 1);

    expect(groups.length).toBe(1);
    expect(groups[0].names.sort()).toEqual(['A', 'B']);
    expect(unsatisfied).toBe(1);
  });
});

describe('student-id carry-through (plan D4)', () => {
  const s = (id: string, firstName: string): Student => ({
    id,
    firstName,
    lastName: 'X',
    pin: '00',
  });

  it('makeRestrictedGroups pairs each name with its student id', () => {
    const students = [s('id-a', 'A'), s('id-b', 'B'), s('id-c', 'C')];
    const { groups } = makeRestrictedGroups(students, 2);
    const byId = new Map(students.map((st) => [st.id, `${st.firstName} X`]));
    for (const g of groups) {
      expect(g.studentIds).toHaveLength(g.names.length);
      g.studentIds?.forEach((id, i) => expect(byId.get(id)).toBe(g.names[i]));
    }
    expect(groups.flatMap((g) => g.studentIds ?? []).sort()).toEqual([
      'id-a',
      'id-b',
      'id-c',
    ]);
  });

  it('makeRestrictedGroupsByCount pairs each name with its student id', () => {
    const students = [s('id-a', 'A'), s('id-b', 'B'), s('id-c', 'C')];
    const { groups } = makeRestrictedGroupsByCount(students, 2);
    const byId = new Map(students.map((st) => [st.id, `${st.firstName} X`]));
    for (const g of groups) {
      expect(g.studentIds).toHaveLength(g.names.length);
      g.studentIds?.forEach((id, i) => expect(byId.get(id)).toBe(g.names[i]));
    }
  });

  it('distinguishes two students who share a display name', () => {
    const students = [s('id-1', 'Sam'), s('id-2', 'Sam')];
    const { groups } = makeRestrictedGroupsByCount(students, 1);
    expect(groups[0].names).toEqual(['Sam X', 'Sam X']);
    expect(groups[0].studentIds?.slice().sort()).toEqual(['id-1', 'id-2']);
  });
});

describe('makeGroupsWithLockedCohorts (plan D10-D13)', () => {
  const mk = (id: string, restricted?: string[]): Student => ({
    id,
    firstName: id.toUpperCase(),
    lastName: 'X',
    pin: '00',
    ...(restricted ? { restrictedStudentIds: restricted } : {}),
  });
  const twelve = Array.from({ length: 12 }, (_, i) => mk(`s${i}`));
  const findCohort = (groups: RandomGroup[], ids: string[]) =>
    groups.find((g) => ids.every((id) => g.studentIds?.includes(id)));

  it('D10: pins a locked cohort verbatim as one group', () => {
    const { groups } = makeGroupsWithLockedCohorts({
      students: twelve,
      lockedCohorts: [['s0', 's1', 's2']],
      groupSize: 3,
    });
    const cohort = findCohort(groups, ['s0', 's1', 's2']);
    expect(cohort?.studentIds?.slice().sort()).toEqual(['s0', 's1', 's2']);
    // Every other student lands somewhere, exactly once.
    expect(groups.flatMap((g) => g.studentIds ?? []).sort()).toEqual(
      twelve.map((s) => s.id).sort()
    );
  });

  it('D12: the locked cohort is exempt from the size control', () => {
    const { groups } = makeGroupsWithLockedCohorts({
      students: twelve,
      lockedCohorts: [['s0', 's1', 's2', 's3', 's4']],
      groupSize: 2,
    });
    // Five locked members stay together despite a size of 2...
    expect(
      findCohort(groups, ['s0', 's1', 's2', 's3', 's4'])?.names
    ).toHaveLength(5);
    // ...while the remaining seven are grouped by twos.
    const rest = groups.filter((g) => (g.studentIds?.length ?? 0) !== 5);
    expect(Math.max(...rest.map((g) => g.names.length))).toBe(2);
  });

  it('D12: count mode spends the remaining group budget on the remainder', () => {
    const { groups } = makeGroupsWithLockedCohorts({
      students: twelve,
      lockedCohorts: [['s0', 's1']],
      numGroups: 4,
    });
    expect(groups).toHaveLength(4);
    expect(findCohort(groups, ['s0', 's1'])?.names).toHaveLength(2);
  });

  it('D13: keeps a cohort together over a keep-apart pair and reports it', () => {
    const students = [mk('s0', ['s1']), mk('s1', ['s0']), ...twelve.slice(2)];
    const { groups, lockConflicts } = makeGroupsWithLockedCohorts({
      students,
      lockedCohorts: [['s0', 's1']],
      groupSize: 3,
    });
    expect(lockConflicts).toBe(1);
    expect(findCohort(groups, ['s0', 's1'])).toBeDefined();
  });

  it('D13: reports no conflict when the cohort has no restricted pair', () => {
    const students = [mk('s0', ['s9']), ...twelve.slice(1)];
    const { lockConflicts } = makeGroupsWithLockedCohorts({
      students,
      lockedCohorts: [['s0', 's1']],
      groupSize: 3,
    });
    expect(lockConflicts).toBe(0);
  });

  it('D11: reshuffles output order so the cohort has no positional tell', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { groups } = makeGroupsWithLockedCohorts({
        students: twelve,
        lockedCohorts: [['s0', 's1', 's2']],
        groupSize: 3,
      });
      positions.add(groups.findIndex((g) => g.studentIds?.includes('s0')));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('assumption 8: drops a cohort whose members are all absent', () => {
    const present = twelve.slice(2);
    const { groups } = makeGroupsWithLockedCohorts({
      students: present,
      lockedCohorts: [['s0', 's1']],
      groupSize: 3,
    });
    expect(groups.flatMap((g) => g.studentIds ?? []).sort()).toEqual(
      present.map((s) => s.id).sort()
    );
  });

  it('gives a student claimed by two cohorts to the first', () => {
    const { groups } = makeGroupsWithLockedCohorts({
      students: twelve,
      lockedCohorts: [
        ['s0', 's1'],
        ['s1', 's2'],
      ],
      groupSize: 3,
    });
    const first = findCohort(groups, ['s0']);
    expect(first?.studentIds?.slice().sort()).toEqual(['s0', 's1']);
    expect(findCohort(groups, ['s2'])?.studentIds).not.toContain('s1');
    // s1 is still placed exactly once overall.
    const all = groups.flatMap((g) => g.studentIds ?? []);
    expect(all.filter((id) => id === 's1')).toHaveLength(1);
  });

  it('handles every student being locked', () => {
    const { groups } = makeGroupsWithLockedCohorts({
      students: twelve.slice(0, 4),
      lockedCohorts: [
        ['s0', 's1'],
        ['s2', 's3'],
      ],
      groupSize: 3,
    });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.names.length === 2)).toBe(true);
  });
});

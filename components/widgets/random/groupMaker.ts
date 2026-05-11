import { Student, RandomGroup } from '@/types';

export interface GroupMakerResult {
  groups: RandomGroup[];
  /** Number of placements that couldn't honor a restriction. Zero is ideal. */
  unsatisfied: number;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Greedy, restriction-aware group maker.
 *
 * Strategy: for each student (in a shuffled order), prefer the smallest
 * group that has free space AND no restricted peer inside. Fall back to
 * any non-full group if no conflict-free option exists, and count those
 * fallback placements so the caller can surface a warning.
 *
 * Greedy is not guaranteed to find a satisfying assignment when one
 * exists, but it runs in O(n·g) and produces good results for realistic
 * classroom sizes (≤ 30 students, ≤ 3 per restriction list). Teachers can
 * simply click Randomize again for a different shuffle order.
 */
export function makeRestrictedGroups(
  students: Student[],
  groupSize: number
): GroupMakerResult {
  if (students.length === 0) return { groups: [], unsatisfied: 0 };
  const size = Math.max(1, Math.floor(groupSize));
  const numGroups = Math.ceil(students.length / size);
  const buckets: Student[][] = Array.from({ length: numGroups }, () => []);
  const shuffled = shuffleInPlace([...students]);
  let unsatisfied = 0;

  for (const student of shuffled) {
    const restricted = new Set(student.restrictedStudentIds ?? []);
    const open = buckets.filter((b) => b.length < size);

    const safe = open.filter((b) => !b.some((m) => restricted.has(m.id)));

    const pool = safe.length > 0 ? safe : open;
    if (safe.length === 0) unsatisfied++;
    pool.sort((a, b) => a.length - b.length);
    pool[0].push(student);
  }

  return {
    groups: buckets.map((b) => ({
      id: crypto.randomUUID(),
      names: b.map((s) => `${s.firstName} ${s.lastName}`.trim()),
    })),
    unsatisfied,
  };
}

/**
 * Build expert groups for the Jigsaw cooperative-learning structure.
 *
 * Distributes each home group's members across `numExpertGroups` buckets
 * via round-robin assignment with a rotating offset per home group. The
 * offset rotation prevents any single expert group from consistently
 * absorbing the "extra" student when numExpertGroups does not evenly
 * divide the home group size — collisions get spread evenly instead.
 *
 * When `numExpertGroups` equals the home group size this reduces to a
 * straight transpose (position N from each home group → expert N), which
 * is the classic jigsaw structure. When it is smaller, expert groups grow
 * by absorbing wrapped positions; when larger, some expert groups receive
 * fewer members.
 *
 * Home groups are shuffled at creation, so positional assignment is
 * already random — no extra shuffle is needed here.
 *
 * If the result contains a size-1 "expert group" (no peer to compare notes
 * with) AND a larger expert group exists, the orphan is merged into the
 * smallest larger group so every expert has at least one peer. When every
 * expert group is size 1 the caller's degenerate-jigsaw warning toast
 * handles communication; we don't artificially merge in that case.
 */
export function makeJigsawExpertGroups(
  homeGroups: RandomGroup[],
  numExpertGroups: number
): RandomGroup[] {
  if (homeGroups.length === 0) return [];
  const k = Math.max(1, Math.floor(numExpertGroups));

  const buckets: string[][] = Array.from({ length: k }, () => []);
  let offset = 0;
  for (const home of homeGroups) {
    for (let i = 0; i < home.names.length; i++) {
      buckets[(i + offset) % k].push(home.names[i]);
    }
    offset = (offset + 1) % k;
  }

  const expertGroups: RandomGroup[] = buckets
    .filter((names) => names.length > 0)
    .map((names) => ({ id: crypto.randomUUID(), names }));

  const balanced = expertGroups.filter((g) => g.names.length > 1);
  const orphans = expertGroups.filter((g) => g.names.length === 1);
  if (balanced.length === 0 || orphans.length === 0) return expertGroups;

  for (const orphan of orphans) {
    balanced.sort((a, b) => a.names.length - b.names.length);
    balanced[0].names.push(...orphan.names);
  }
  return balanced;
}

/**
 * Plain chunking used for custom-names mode, where we have strings only
 * (no IDs, so no restriction lookup). Matches the pre-existing behavior.
 */
export function makeNameGroups(
  names: string[],
  groupSize: number
): RandomGroup[] {
  if (names.length === 0) return [];
  const size = Math.max(1, Math.floor(groupSize));
  const shuffled = shuffleInPlace([...names]);
  const groups: RandomGroup[] = [];
  for (let i = 0; i < shuffled.length; i += size) {
    groups.push({
      id: crypto.randomUUID(),
      names: shuffled.slice(i, i + size),
    });
  }
  return groups;
}

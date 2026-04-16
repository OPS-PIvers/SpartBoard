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

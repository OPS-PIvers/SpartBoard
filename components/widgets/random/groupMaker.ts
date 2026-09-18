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

// Checks both directions — restriction data read from Firestore isn't guaranteed to be symmetric.
// `restricted` is built once per student by the caller, not once per bucket.
function conflictsWithBucket(
  student: Student,
  restricted: ReadonlySet<string>,
  bucket: Student[]
): boolean {
  return bucket.some(
    (m) =>
      restricted.has(m.id) ||
      (m.restrictedStudentIds ?? []).includes(student.id)
  );
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

    const safe = open.filter(
      (b) => !conflictsWithBucket(student, restricted, b)
    );

    const pool = safe.length > 0 ? safe : open;
    if (safe.length === 0) unsatisfied++;
    pool.sort((a, b) => a.length - b.length);
    pool[0].push(student);
  }

  return {
    groups: buckets.map((b) => ({
      id: crypto.randomUUID(),
      names: b.map((s) => `${s.firstName} ${s.lastName}`.trim()),
      studentIds: b.map((s) => s.id),
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
  // Math.max(1, NaN) returns NaN, which then makes Array.from({length: NaN})
  // return [], silently yielding zero expert groups. Guard explicitly.
  const safeK = Number.isFinite(numExpertGroups) ? numExpertGroups : 1;
  const k = Math.max(1, Math.floor(safeK));

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

/**
 * Round-robin variant of {@link makeNameGroups} that distributes shuffled
 * names into EXACTLY `numGroups` buckets. Preferred over `makeNameGroups`
 * for jigsaw home groups, where teachers think in terms of a target group
 * count ("4 home groups") rather than a target group size — chunk-by-size
 * silently produces fewer groups than requested on awkward divisions
 * (e.g. 30 names / 7 groups yields ⌈30/⌈30/7⌉⌉ = 6 groups).
 *
 * Group sizes differ by at most 1. If `numGroups` exceeds `names.length`
 * we clamp to `names.length` so no empty groups are returned. A non-finite
 * `numGroups` collapses to 1 group, matching the defensive guard in
 * {@link makeJigsawExpertGroups}.
 */
export function makeNameGroupsByCount(
  names: string[],
  numGroups: number
): RandomGroup[] {
  if (names.length === 0) return [];
  const safeK = Number.isFinite(numGroups) ? numGroups : 1;
  const k = Math.max(1, Math.min(names.length, Math.floor(safeK)));
  const buckets: string[][] = Array.from({ length: k }, () => []);
  const shuffled = shuffleInPlace([...names]);
  shuffled.forEach((name, i) => {
    buckets[i % k].push(name);
  });
  return buckets.map((b) => ({
    id: crypto.randomUUID(),
    names: b,
  }));
}

/**
 * Restriction-aware group maker that produces EXACTLY `numGroups`
 * buckets. Equivalent to {@link makeRestrictedGroups} but driven by a
 * target group count instead of a target group size. Used by jigsaw
 * mode where the home-group count is the natural UI parameter.
 *
 * Strategy mirrors {@link makeRestrictedGroups} — greedy "smallest safe
 * bucket": shuffle students, then for each student prefer the smallest
 * bucket with no restricted peer, falling back to the overall smallest
 * bucket if no conflict-free option exists. Fallback placements are
 * counted so the caller can surface a warning. This is NOT pure
 * round-robin — restrictions can push placements off the cyclic order
 * — but the smallest-bucket bias keeps group sizes balanced within 1.
 *
 * If `numGroups` exceeds `students.length` we clamp to `students.length`
 * so no empty groups are returned.
 */
export function makeRestrictedGroupsByCount(
  students: Student[],
  numGroups: number
): GroupMakerResult {
  if (students.length === 0) return { groups: [], unsatisfied: 0 };
  const safeK = Number.isFinite(numGroups) ? numGroups : 1;
  const k = Math.max(1, Math.min(students.length, Math.floor(safeK)));
  const buckets: Student[][] = Array.from({ length: k }, () => []);
  const shuffled = shuffleInPlace([...students]);
  let unsatisfied = 0;

  for (const student of shuffled) {
    const restricted = new Set(student.restrictedStudentIds ?? []);
    const safe = buckets.filter(
      (b) => !conflictsWithBucket(student, restricted, b)
    );
    const pool = safe.length > 0 ? safe : buckets;
    if (safe.length === 0) unsatisfied++;
    pool.sort((a, b) => a.length - b.length);
    pool[0].push(student);
  }

  return {
    groups: buckets.map((b) => ({
      id: crypto.randomUUID(),
      names: b.map((s) => `${s.firstName} ${s.lastName}`.trim()),
      studentIds: b.map((s) => s.id),
    })),
    unsatisfied,
  };
}

/** Options for `makeGroupsWithLockedCohorts`. Pass exactly one of the sizing fields. */
export interface LockedCohortOptions {
  students: Student[];
  /** Student ids that must land in one group together, one array per locked group. */
  lockedCohorts: string[][];
  /**
   * Count mode: target number of output groups, locked ones included. Locks
   * win when the two disagree — the lock checkboxes and the count control are
   * independent, so a teacher can lock more groups than the count asks for.
   * Unlocked students still need somewhere to go, and D10 forbids folding them
   * into a cohort, so the result is then `lockedCohorts.length + 1`.
   */
  numGroups?: number;
  /** Size mode: members per group, applied to the unlocked remainder only. */
  groupSize?: number;
}

export interface LockedCohortResult extends GroupMakerResult {
  /** Locked cohorts holding a keep-apart pair. The lock wins; the caller warns. */
  lockConflicts: number;
}

/**
 * Group students while keeping saved cohorts intact
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D10–D13).
 *
 * Each cohort becomes one output group verbatim and is exempt from the sizing
 * control, which governs the remainder only — silently splitting a cohort to
 * hit a target size would defeat the point of locking it. Output order is
 * reshuffled so a locked cohort has no positional tell across days, and a
 * cohort that conflicts with `restrictedStudentIds` is kept together anyway
 * and counted in `lockConflicts`.
 */
export function makeGroupsWithLockedCohorts({
  students,
  lockedCohorts,
  numGroups,
  groupSize,
}: LockedCohortOptions): LockedCohortResult {
  if (students.length === 0) {
    return { groups: [], unsatisfied: 0, lockConflicts: 0 };
  }

  const byId = new Map(students.map((s) => [s.id, s]));
  const claimed = new Set<string>();
  const cohorts: Student[][] = [];
  let lockConflicts = 0;

  for (const ids of lockedCohorts) {
    // A student listed in two cohorts belongs to the first — overlapping
    // groups are allowed on a roster (plan D1) but can't both be honored.
    const members: Student[] = [];
    for (const id of ids) {
      const student = byId.get(id);
      if (!student || claimed.has(id)) continue;
      claimed.add(id);
      members.push(student);
    }
    // A cohort whose members are all absent or off-roster yields nothing.
    if (members.length === 0) continue;
    const conflicted = members.some((m) =>
      conflictsWithBucket(
        m,
        new Set(m.restrictedStudentIds ?? []),
        members.filter((o) => o.id !== m.id)
      )
    );
    if (conflicted) lockConflicts++;
    cohorts.push(members);
  }

  const remainder = students.filter((s) => !claimed.has(s.id));
  let rest: GroupMakerResult = { groups: [], unsatisfied: 0 };
  if (remainder.length > 0) {
    if (numGroups !== undefined) {
      const safeK = Number.isFinite(numGroups) ? Math.floor(numGroups) : 1;
      // Floor of 1: the remainder is non-empty here, and dropping students is
      // worse than overshooting the requested count (see `numGroups`).
      rest = makeRestrictedGroupsByCount(
        remainder,
        Math.max(1, safeK - cohorts.length)
      );
    } else {
      rest = makeRestrictedGroups(remainder, groupSize ?? 1);
    }
  }

  const locked: RandomGroup[] = cohorts.map((members) => ({
    id: crypto.randomUUID(),
    names: members.map((s) => `${s.firstName} ${s.lastName}`.trim()),
    studentIds: members.map((s) => s.id),
  }));

  return {
    groups: shuffleInPlace([...locked, ...rest.groups]),
    unsatisfied: rest.unsatisfied,
    lockConflicts,
  };
}

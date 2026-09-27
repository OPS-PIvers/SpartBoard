import { Station } from '@/types';

type Assignments = Record<string, string | null>;

export interface RotateResult {
  assignments: Assignments;
  /** Students who could not be moved because every later station was full. */
  stuckStudents: string[];
}

export interface ShuffleResult {
  assignments: Assignments;
  /** Students who didn't fit because total cap < roster size. */
  overflowStudents: string[];
  /** Students seated with someone their roster marks as keep-apart. */
  apartConflicts: string[];
  /** Locked class groups no single station could hold, so they were split. */
  splitCohorts: number;
}

export interface ShuffleConstraints {
  /** Cohorts of student keys that must land in the same station. */
  keepTogether?: string[][];
  /** Student key -> keys it should not share a station with. */
  keepApart?: Map<string, Set<string>>;
}

const sortByOrder = (stations: Station[]): Station[] =>
  [...stations].sort((a, b) => a.order - b.order);

const stationCount = (assignments: Assignments, stationId: string): number => {
  let count = 0;
  for (const value of Object.values(assignments)) {
    if (value === stationId) count++;
  }
  return count;
};

const findFirstUnderCapStation = (
  ordered: Station[],
  startIdx: number,
  counts: Map<string, number>
): Station | null => {
  const n = ordered.length;
  for (let step = 0; step < n; step++) {
    const candidate = ordered[(startIdx + step) % n];
    const limit = candidate.maxStudents;
    if (limit == null || (counts.get(candidate.id) ?? 0) < limit) {
      return candidate;
    }
  }
  return null;
};

/**
 * Rotate clockwise: every student in station i moves to station (i+1)%N.
 * If the next station is full, push to the next under-capacity station; if
 * every station is full the student stays put and is reported as stuck.
 */
export function rotateAssignments(
  stations: Station[],
  assignments: Assignments
): RotateResult {
  const ordered = sortByOrder(stations);
  if (ordered.length === 0) {
    return { assignments, stuckStudents: [] };
  }

  const indexById = new Map(ordered.map((s, i) => [s.id, i]));
  const next: Assignments = {};
  // Carry over unassigned students unchanged. Students whose previous station
  // no longer exists (cap removed, station deleted between save & rotate)
  // also need to be carried — silently dropping them would lose roster
  // membership. Treat those as unassigned, matching the front-face semantic
  // where unknown station ids fall through to the unassigned bucket.
  for (const [name, value] of Object.entries(assignments)) {
    if (value == null) {
      next[name] = null;
    } else if (!indexById.has(value)) {
      next[name] = null;
    }
  }

  // Bucket students by their CURRENT station, preserve order they had so the
  // rotate result is stable for tests and predictable for teachers.
  const buckets = new Map<string, string[]>();
  for (const station of ordered) buckets.set(station.id, []);
  for (const [name, value] of Object.entries(assignments)) {
    if (value) {
      const bucket = buckets.get(value);
      if (bucket) bucket.push(name);
    }
  }

  const counts = new Map<string, number>(ordered.map((s) => [s.id, 0]));
  const stuck: string[] = [];

  for (const station of ordered) {
    const fromIdx = indexById.get(station.id) ?? 0;
    const targetIdx = (fromIdx + 1) % ordered.length;
    const students = buckets.get(station.id) ?? [];
    for (const name of students) {
      const target = findFirstUnderCapStation(ordered, targetIdx, counts);
      if (target) {
        next[name] = target.id;
        counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
      } else {
        // Every station full — keep them where they were.
        next[name] = station.id;
        counts.set(station.id, (counts.get(station.id) ?? 0) + 1);
        stuck.push(name);
      }
    }
  }

  return { assignments: next, stuckStudents: stuck };
}

/**
 * Fisher-Yates shuffle that does NOT mutate the input array.
 * `rng` is injectable so tests can pass a deterministic source.
 */
export function shuffleArray<T>(
  input: T[],
  rng: () => number = Math.random
): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Distribute `roster` evenly across `stations`, respecting `maxStudents` caps.
 * Round-robin order so caps fill bottom-up; overflow stays unassigned.
 *
 * Constraint-aware (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D15): a
 * `keepTogether` cohort is placed as one unit, and `keepApart` pairs are
 * avoided when a station without the conflict has room. Keep-together wins a
 * disagreement, matching the Randomizer's D13 lock precedence; the caller
 * toasts what could not be satisfied. With neither constraint the placement is
 * byte-for-byte the plain round-robin it has always been.
 */
export function shuffleStudentsIntoStations(
  stations: Station[],
  roster: string[],
  rng: () => number = Math.random,
  constraints: ShuffleConstraints = {}
): ShuffleResult {
  const ordered = sortByOrder(stations);
  if (ordered.length === 0) {
    const next: Assignments = {};
    for (const name of roster) next[name] = null;
    return {
      assignments: next,
      overflowStudents: roster.slice(),
      apartConflicts: [],
      splitCohorts: 0,
    };
  }

  // A cohort larger than the roomiest station cannot stay whole anywhere.
  const largestCapacity = ordered.reduce(
    (max, s) =>
      s.maxStudents == null
        ? Number.POSITIVE_INFINITY
        : Math.max(max, s.maxStudents),
    0
  );

  const present = new Set(roster);
  const claimed = new Set<string>();
  const units: string[][] = [];
  let splitCohorts = 0;

  for (const cohort of constraints.keepTogether ?? []) {
    // First cohort wins a student two groups both claim, matching
    // `makeGroupsWithLockedCohorts` in the Randomizer.
    const members = cohort.filter((id) => present.has(id) && !claimed.has(id));
    if (members.length === 0) continue;
    for (const id of members) claimed.add(id);
    if (members.length > largestCapacity) {
      splitCohorts++;
      for (const id of members) units.push([id]);
    } else {
      units.push(members);
    }
  }
  for (const id of roster) {
    if (!claimed.has(id)) units.push([id]);
  }

  const shuffled = shuffleArray(units, rng);
  const next: Assignments = {};
  const counts = new Map<string, number>(ordered.map((s) => [s.id, 0]));
  const occupants = new Map<string, string[]>(ordered.map((s) => [s.id, []]));
  const overflow: string[] = [];
  const apartConflicts: string[] = [];
  const apart = constraints.keepApart;

  // Read both directions: a roster that recorded the restriction on only one
  // of the pair still keeps them apart.
  const clash = (a: string, b: string): boolean =>
    (apart?.get(a)?.has(b) ?? false) || (apart?.get(b)?.has(a) ?? false);

  /**
   * Members of `unit` who would sit next to someone they are kept apart from —
   * counting the rest of their own cohort, since the commonest conflict is a
   * locked group that already contains a restricted pair.
   */
  const conflictsAt = (stationId: string, unit: string[]): string[] => {
    if (!apart) return [];
    const seated = occupants.get(stationId) ?? [];
    return unit.filter(
      (id) =>
        seated.some((other) => clash(id, other)) ||
        unit.some((other) => other !== id && clash(id, other))
    );
  };

  let cursor = 0;
  for (const unit of shuffled) {
    let chosen: Station | null = null;
    let chosenAttempt = 0;
    let chosenConflicts: string[] = [];
    for (let attempt = 0; attempt < ordered.length; attempt++) {
      const candidate = ordered[(cursor + attempt) % ordered.length];
      const limit = candidate.maxStudents;
      const used = counts.get(candidate.id) ?? 0;
      if (limit != null && used + unit.length > limit) continue;
      const conflicts = conflictsAt(candidate.id, unit);
      if (chosen === null || conflicts.length < chosenConflicts.length) {
        chosen = candidate;
        chosenAttempt = attempt;
        chosenConflicts = conflicts;
      }
      if (chosenConflicts.length === 0) break;
    }
    if (!chosen) {
      for (const id of unit) {
        next[id] = null;
        overflow.push(id);
      }
      continue;
    }
    const seated = occupants.get(chosen.id) ?? [];
    for (const id of unit) {
      next[id] = chosen.id;
      seated.push(id);
    }
    occupants.set(chosen.id, seated);
    counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + unit.length);
    apartConflicts.push(...chosenConflicts);
    cursor = (cursor + chosenAttempt + 1) % ordered.length;
  }

  return {
    assignments: next,
    overflowStudents: overflow,
    apartConflicts,
    splitCohorts,
  };
}

/** Reset every student back to unassigned. */
export function resetAllAssignments(roster: string[]): Assignments {
  const next: Assignments = {};
  for (const name of roster) next[name] = null;
  return next;
}

/** Clear only students currently in `stationId`. Other assignments untouched. */
export function resetStation(
  assignments: Assignments,
  stationId: string
): Assignments {
  const next: Assignments = {};
  for (const [name, value] of Object.entries(assignments)) {
    next[name] = value === stationId ? null : value;
  }
  return next;
}

export { stationCount };

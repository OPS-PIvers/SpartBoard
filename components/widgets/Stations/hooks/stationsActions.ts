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
 */
export function shuffleStudentsIntoStations(
  stations: Station[],
  roster: string[],
  rng: () => number = Math.random
): ShuffleResult {
  const ordered = sortByOrder(stations);
  if (ordered.length === 0) {
    const next: Assignments = {};
    for (const name of roster) next[name] = null;
    return { assignments: next, overflowStudents: roster.slice() };
  }

  const shuffled = shuffleArray(roster, rng);
  const next: Assignments = {};
  const counts = new Map<string, number>(ordered.map((s) => [s.id, 0]));
  const overflow: string[] = [];

  let cursor = 0;
  for (const name of shuffled) {
    let placed = false;
    for (let attempt = 0; attempt < ordered.length; attempt++) {
      const candidate = ordered[(cursor + attempt) % ordered.length];
      const limit = candidate.maxStudents;
      const used = counts.get(candidate.id) ?? 0;
      if (limit == null || used < limit) {
        next[name] = candidate.id;
        counts.set(candidate.id, used + 1);
        cursor = (cursor + attempt + 1) % ordered.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      next[name] = null;
      overflow.push(name);
    }
  }

  return { assignments: next, overflowStudents: overflow };
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

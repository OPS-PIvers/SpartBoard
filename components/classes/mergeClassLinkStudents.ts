import { Student, ClassLinkStudent } from '@/types';

export interface MergeClassLinkResult {
  /** Merged roster students (pass directly to updateRoster). */
  students: Student[];
  /** Students newly appended from ClassLink. */
  addedCount: number;
  /** Students matched to an existing local entry (by sourcedId OR name). */
  matchedCount: number;
  /** Subset of matchedCount matched via stable classLinkSourcedId. */
  alreadySourcedCount: number;
}

const normalizeNameKey = (first: string, last: string): string =>
  `${first.trim()}|${last.trim()}`.toLowerCase();

/**
 * Additive-only merge of ClassLink students into an existing local roster.
 *
 * Dedup algorithm (two-tier, stable):
 *   1. Primary — match by `classLinkSourcedId`. Handles upstream renames.
 *   2. Secondary — match by normalized first+last name. On match, stamp the
 *      existing student with `classLinkSourcedId` (upgrade to stable link).
 *      Each existing student can only be consumed once per merge run, which
 *      avoids collisions when two ClassLink students share a name.
 *   3. Else — append a new student with empty pin (useRosters auto-assigns).
 *
 * Preserves local `id` and `pin` for all matched students. Never removes
 * local-only students (teacher aides / kids not in SIS stay untouched).
 */
export function mergeClassLinkStudents(
  existing: Student[],
  classLinkStudents: ClassLinkStudent[]
): MergeClassLinkResult {
  const result: Student[] = existing.map((s) => ({ ...s }));

  // Index existing students for fast lookup.
  const bySourcedId = new Map<string, number>();
  result.forEach((s, i) => {
    if (s.classLinkSourcedId) bySourcedId.set(s.classLinkSourcedId, i);
  });

  // Name index — each key maps to a queue of indices so we can "consume" one
  // per merge call (prevents two incoming students with identical names from
  // both matching the same local row).
  const byName = new Map<string, number[]>();
  result.forEach((s, i) => {
    const key = normalizeNameKey(s.firstName, s.lastName);
    const queue = byName.get(key);
    if (queue) queue.push(i);
    else byName.set(key, [i]);
  });

  // Track consumed indices so name-lookup never returns an already-matched row.
  const consumed = new Set<number>();

  let addedCount = 0;
  let matchedCount = 0;
  let alreadySourcedCount = 0;

  for (const cls of classLinkStudents) {
    // 1. Match by sourcedId
    const sourcedIndex = bySourcedId.get(cls.sourcedId);
    if (sourcedIndex !== undefined && !consumed.has(sourcedIndex)) {
      consumed.add(sourcedIndex);
      matchedCount += 1;
      alreadySourcedCount += 1;
      // Backfill email on re-sync: rosters imported before email was
      // captured won't have it, so stamp the upstream value when present.
      if (cls.email && !result[sourcedIndex].email) {
        result[sourcedIndex] = { ...result[sourcedIndex], email: cls.email };
      }
      continue;
    }

    // 2. Match by normalized name
    const key = normalizeNameKey(cls.givenName, cls.familyName);
    const queue = byName.get(key);
    let nameMatchIndex: number | undefined;
    if (queue) {
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (candidate !== undefined && !consumed.has(candidate)) {
          nameMatchIndex = candidate;
          break;
        }
      }
    }
    if (nameMatchIndex !== undefined) {
      consumed.add(nameMatchIndex);
      matchedCount += 1;
      // Stamp the sourcedId onto the existing row (preserve id + pin).
      // Also backfill email if this is the first time we've seen it.
      result[nameMatchIndex] = {
        ...result[nameMatchIndex],
        classLinkSourcedId: cls.sourcedId,
        ...(cls.email && !result[nameMatchIndex].email
          ? { email: cls.email }
          : {}),
      };
      continue;
    }

    // 3. Append
    result.push({
      id: crypto.randomUUID(),
      firstName: cls.givenName,
      lastName: cls.familyName,
      pin: '',
      classLinkSourcedId: cls.sourcedId,
      ...(cls.email ? { email: cls.email } : {}),
    });
    addedCount += 1;
  }

  return {
    students: result,
    addedCount,
    matchedCount,
    alreadySourcedCount,
  };
}

import type { ClassRoster } from '@/types';

/** Per-roster due dates keyed by class id, for the student-readable session doc. */
export function dueAtByClassIdFromRosters(
  dueAtByRosterId: Record<string, number>,
  rosters: readonly ClassRoster[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rosters) {
    const due = dueAtByRosterId[r.id];
    if (typeof due !== 'number') continue;
    for (const classId of [r.classlinkClassId, r.testClassId]) {
      if (classId && !(classId in out)) out[classId] = due;
    }
  }
  return out;
}

/** Earliest date in the map, or null when it has none. */
export function earliestDueAt(
  dueAtByRosterId: Record<string, number>
): number | null {
  const values = Object.values(dueAtByRosterId).filter(
    (v) => typeof v === 'number'
  );
  return values.length > 0 ? Math.min(...values) : null;
}

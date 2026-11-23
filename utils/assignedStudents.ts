import type { ClassRoster, Student, StudentTargetRef } from '@/types';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';

/** The targeting fields every assignment kind shares. */
export interface PickedTargetFields {
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[];
  rosterIds?: string[];
}

export interface PickedClass {
  rosterId: string;
  label: string;
  names: string[];
}

/** The students a picked-only run reaches, named from the teacher's class lists. */
export interface PickedStudents {
  count: number;
  /** The run's classes with picked students, in run order; names "Last, First" by last name. */
  classes: PickedClass[];
  /** Picked students whose class list is not one of the run's classes now. */
  elsewhere: string[];
  /** Picked students no class list names any more. */
  unnamed: number;
}

/** "Last, First", or the one name a roster row has. */
export const lastFirst = (s: Pick<Student, 'firstName' | 'lastName'>) => {
  const first = s.firstName?.trim() ?? '';
  const last = s.lastName?.trim() ?? '';
  return last && first ? `${last}, ${first}` : last || first;
};

const byLastName = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortNames = (rows: Student[]): string[] =>
  rows
    .slice()
    .sort((a, b) => byLastName.compare(lastFirst(a), lastFirst(b)))
    .map(lastFirst);

/** Null unless the run went to picked students; each one is listed once, under the first run class that has them. */
export function pickedStudents(
  a: PickedTargetFields,
  rosters: readonly ClassRoster[]
): PickedStudents | null {
  if (a.targetMode !== 'students' || !a.targetStudents?.length) return null;
  const wanted = new Set(a.targetStudents.map(studentTargetRefKey));
  const runIds = a.rosterIds ?? [];
  const ordered = [
    ...runIds
      .map((id) => rosters.find((r) => r.id === id))
      .filter((r): r is ClassRoster => !!r),
    ...rosters.filter((r) => !runIds.includes(r.id)),
  ];
  const found = new Set<string>();
  const inRun = new Map<string, Student[]>();
  const other: Student[] = [];
  for (const roster of ordered) {
    const run = runIds.includes(roster.id);
    for (const s of roster.students) {
      const ref = resolveStudentTargetRef(s, roster);
      if (!ref) continue;
      const key = studentTargetRefKey(ref);
      if (!wanted.has(key) || found.has(key)) continue;
      found.add(key);
      if (!run) other.push(s);
      else inRun.set(roster.id, [...(inRun.get(roster.id) ?? []), s]);
    }
  }
  const classes = ordered
    .filter((r) => inRun.has(r.id))
    .map((r) => ({
      rosterId: r.id,
      label: r.name,
      names: sortNames(inRun.get(r.id) ?? []),
    }));
  return {
    count: wanted.size,
    classes,
    elsewhere: sortNames(other),
    unnamed: wanted.size - found.size,
  };
}

/** "1 student" or "N students". */
export const studentCountLabel = (n: number): string =>
  n === 1 ? '1 student' : `${n} students`;

export const ELSEWHERE_LABEL = 'Not in these classes';

/** Every group to list: the run's classes, then picks outside them. */
export function pickedGroups(
  picked: PickedStudents
): { label: string; names: string[] }[] {
  return picked.elsewhere.length > 0
    ? [...picked.classes, { label: ELSEWHERE_LABEL, names: picked.elsewhere }]
    : picked.classes;
}

/** "2 students not on your class lists", for picks no roster names. */
export const unnamedLabel = (n: number): string =>
  `${studentCountLabel(n)} not on your class lists`;

/** Picked names per Assigned-tab class key; a single-line run lists everyone under ''. */
export function namesByClassKey(
  picked: PickedStudents,
  periodAccess: Record<string, { rosterId?: string }> | undefined
): Record<string, string[]> {
  const entries = Object.entries(periodAccess ?? {});
  if (entries.length === 0) {
    const all = picked.classes.flatMap((c) => c.names);
    return { '': [...new Set(all)].sort(byLastName.compare) };
  }
  const out: Record<string, string[]> = {};
  for (const [key, row] of entries) {
    const c = picked.classes.find((x) => x.rosterId === (row.rosterId ?? key));
    if (c) out[key] = c.names;
  }
  return out;
}

/** Class sizes for a picked-only run: the picks placed in each class, or every pick on a single line. */
export function pickedClassSizes(
  picked: PickedStudents,
  periodAccess: Record<string, { rosterId?: string }> | undefined
): Record<string, number> {
  const out: Record<string, number> = { '': picked.count };
  for (const [key, names] of Object.entries(
    namesByClassKey(picked, periodAccess)
  ))
    if (key) out[key] = names.length;
  return out;
}

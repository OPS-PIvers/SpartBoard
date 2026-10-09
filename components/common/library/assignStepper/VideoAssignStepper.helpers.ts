import type { ClassRoster, StudentTargetRef } from '@/types';
import {
  classStudentRows,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';
import type { AssignClassesValue } from './assignClassesValue';

/** Sorts pre-picked students into the picked classes they belong to. */
export function initialClassesValue(
  rosters: ClassRoster[],
  classIds: string[],
  students: StudentTargetRef[] = []
): AssignClassesValue {
  const visible = new Set(rosters.filter((r) => !r.loadError).map((r) => r.id));
  const ids = classIds.filter((id) => visible.has(id));
  if (students.length === 0) return { classIds: ids, studentsByClass: {} };
  const byKey = new Map(
    classStudentRows({ rosters, selectedRosterIds: ids }).map((r) => [r.key, r])
  );
  const studentsByClass: Record<string, StudentTargetRef[]> = {};
  for (const ref of students) {
    const row = byKey.get(studentTargetRefKey(ref));
    if (row) (studentsByClass[row.rosterId] ??= []).push(row.ref);
  }
  // Keep only classes with a matched pick; an empty pick list would mean the whole class.
  return {
    classIds: ids.filter((id) => id in studentsByClass),
    studentsByClass,
  };
}

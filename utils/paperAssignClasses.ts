// Assign on paper: the stepper's class and student picks as the students who get a sheet.
import type { ClassRoster, Student, StudentTargetRef } from '@/types';
import type { AssignClassesValue } from '@/components/common/library/assignStepper/assignClassesValue';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from './studentTargetRef';

/** Paper needs no sign-in, so a student without one still gets a local-only ref. */
export const paperStudentRef = (
  student: Student,
  roster: ClassRoster
): StudentTargetRef =>
  resolveStudentTargetRef(student, roster) ?? {
    kind: 'test',
    email: `paper:${roster.id}:${student.id}`,
  };

/** Picked classes that loaded, in roster order. */
export const pickedPaperRosters = (
  value: AssignClassesValue,
  rosters: readonly ClassRoster[]
): ClassRoster[] =>
  rosters.filter((r) => !r.loadError && value.classIds.includes(r.id));

/** Student ids per picked class; a class with no student picks sends every student. */
export function paperSelectedStudentIds(
  value: AssignClassesValue,
  rosters: readonly ClassRoster[]
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const roster of pickedPaperRosters(value, rosters)) {
    const refs = value.studentsByClass[roster.id];
    if (!refs || refs.length === 0) {
      out[roster.id] = new Set(roster.students.map((s) => s.id));
      continue;
    }
    const keys = new Set(refs.map(studentTargetRefKey));
    out[roster.id] = new Set(
      roster.students
        .filter((s) =>
          keys.has(studentTargetRefKey(paperStudentRef(s, roster)))
        )
        .map((s) => s.id)
    );
  }
  return out;
}

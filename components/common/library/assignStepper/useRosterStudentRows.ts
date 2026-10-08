import { useMemo } from 'react';
import type {
  ClassRoster,
  RosterGroup,
  Student,
  StudentTargetRef,
} from '@/types';
import { resolveStudentTargetRef } from '@/utils/studentTargetRef';

/** One roster student as an assign picker lists it; `ref` is null without a school sign-in. */
export interface RosterStudentRow {
  studentId: string;
  name: string;
  ref: StudentTargetRef | null;
}

export type TargetableStudentRow = RosterStudentRow & { ref: StudentTargetRef };

export const studentDisplayName = (s: Student): string =>
  `${s.firstName} ${s.lastName}`.trim();

export function rosterStudentRows(
  roster: ClassRoster | null,
  search: string
): RosterStudentRow[] {
  if (!roster) return [];
  const query = search.trim().toLowerCase();
  return roster.students
    .map((s) => ({
      studentId: s.id,
      name: studentDisplayName(s),
      ref: resolveStudentTargetRef(s, roster),
    }))
    .filter((row) => (query ? row.name.toLowerCase().includes(query) : true));
}

export const isTargetableRow = (
  row: RosterStudentRow
): row is TargetableStudentRow => row.ref !== null;

/** A saved group's members split into those with a school sign-in and those without. */
export function rosterGroupMembers(
  roster: ClassRoster,
  group: RosterGroup
): {
  members: Student[];
  targetable: TargetableStudentRow[];
  skipped: Student[];
} {
  const ids = new Set(group.studentIds);
  const members = roster.students.filter((s) => ids.has(s.id));
  const targetable: TargetableStudentRow[] = [];
  const skipped: Student[] = [];
  for (const s of members) {
    const ref = resolveStudentTargetRef(s, roster);
    if (ref)
      targetable.push({ studentId: s.id, name: studentDisplayName(s), ref });
    else skipped.push(s);
  }
  return { members, targetable, skipped };
}

/** Search-filtered student rows for one roster, shared by the assign student pickers. */
export function useRosterStudentRows(
  roster: ClassRoster | null,
  search: string
): RosterStudentRow[] {
  return useMemo(() => rosterStudentRows(roster, search), [roster, search]);
}

import type { TFunction } from 'i18next';
import type { ClassRoster, StudentTargetRef } from '@/types';
import {
  classStudentRows,
  effectiveClassOverride,
  resolveStudentTargetRef,
  studentTargetRefKey,
  type AssignTargetingValue,
  type ClassStudentRow,
} from '@/utils/studentTargetRef';

export interface ModificationsScope {
  rosters: ClassRoster[];
  /** Ids of the checked classes; omitted = every roster. */
  selectedRosterIds?: string[];
  /** False on a re-edit: standing roster accommodations must not apply retroactively. */
  useRosterDefaults?: boolean;
}

export interface ModificationCounts {
  modified: number;
  skipped: number;
}

export const effectiveRosterIdsFor = ({
  rosters,
  selectedRosterIds,
}: ModificationsScope): string[] =>
  selectedRosterIds ?? rosters.map((r) => r.id);

/** Individually targetable students in the checked classes, standing defaults dropped on a re-edit. */
export function modificationRows(scope: ModificationsScope): ClassStudentRow[] {
  const rows = classStudentRows({
    rosters: scope.rosters,
    selectedRosterIds: effectiveRosterIdsFor(scope),
  });
  if (scope.useRosterDefaults ?? true) return rows;
  return rows.map(
    ({ defaultOverride: _ignored, ...rest }): ClassStudentRow => rest
  );
}

/** Students in the checked classes with no school sign-in: the class channel still reaches them. */
export function countUnresolvableStudents(scope: ModificationsScope): number {
  const selected = new Set(effectiveRosterIdsFor(scope));
  let count = 0;
  for (const roster of scope.rosters) {
    if (!selected.has(roster.id)) continue;
    for (const student of roster.students) {
      if (!resolveStudentTargetRef(student, roster)) count += 1;
    }
  }
  return count;
}

/** Skips pruned to the listed rows, so an unchecked class never keeps one. */
export function skippedInScope(
  excluded: StudentTargetRef[] | undefined,
  rows: ClassStudentRow[]
): StudentTargetRef[] {
  const rowKeys = new Set(rows.map((row) => row.key));
  return (excluded ?? []).filter((ref) =>
    rowKeys.has(studentTargetRefKey(ref))
  );
}

export function countModifications(
  rows: ClassStudentRow[],
  value: Pick<AssignTargetingValue, 'overridesByKey' | 'excludedStudents'>
): ModificationCounts {
  const skipped = skippedInScope(value.excludedStudents, rows);
  const skippedKeys = new Set(skipped.map(studentTargetRefKey));
  const modified = rows.filter(
    (row) =>
      !skippedKeys.has(row.key) &&
      !!effectiveClassOverride(row, value.overridesByKey)
  ).length;
  return { modified, skipped: skipped.length };
}

/** The value with every edit and skip this dialog made dropped. */
export const clearedModifications = (
  value: AssignTargetingValue
): AssignTargetingValue => ({
  ...value,
  targetStudents: [],
  overridesByKey: {},
  excludedStudents: [],
});

/** Collapsed value for the Modifications link: "None", "1 modified", "1 modified, 2 skipped". */
export function formatModificationsValue(
  counts: ModificationCounts,
  t: TFunction
): string {
  const parts = [
    counts.modified > 0
      ? t('assignTargeting.summaryModified', '{{count}} modified', {
          count: counts.modified,
        })
      : null,
    counts.skipped > 0
      ? t('assignTargeting.summarySkipped', '{{count}} skipped', {
          count: counts.skipped,
        })
      : null,
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(', ')
    : t('assignTargeting.modificationsNone', 'None');
}

/** A saved class group offered in the Modifications Students menu. */
export interface ModificationClassGroup {
  id: string;
  name: string;
  rosterName: string;
  /** Row keys of its members who are among the listed rows. */
  keys: string[];
}

/** Saved groups of the checked classes, each mapped to the listed rows it covers. */
export function modificationClassGroups(
  rosters: ClassRoster[],
  selectedRosterIds: string[],
  rows: ClassStudentRow[]
): ModificationClassGroup[] {
  const listed = new Set(rows.map((r) => r.key));
  const selected = new Set(selectedRosterIds);
  const out: ModificationClassGroup[] = [];
  for (const roster of rosters) {
    if (!selected.has(roster.id)) continue;
    const byId = new Map(roster.students.map((s) => [s.id, s] as const));
    for (const group of roster.groups ?? []) {
      const keys: string[] = [];
      for (const id of group.studentIds) {
        const student = byId.get(id);
        const ref = student ? resolveStudentTargetRef(student, roster) : null;
        const key = ref ? studentTargetRefKey(ref) : null;
        if (key && listed.has(key) && !keys.includes(key)) keys.push(key);
      }
      out.push({
        id: `${roster.id}:${group.id}`,
        name: group.name,
        rosterName: roster.name,
        keys,
      });
    }
  }
  return out;
}

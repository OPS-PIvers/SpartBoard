/** Turns the assign stepper's Classes value into `setAssignmentTargetsV1` input (D5b). */

import type { ClassRoster, StudentOverride, StudentTargetRef } from '@/types';
import {
  buildSetAssignmentTargetsPayload,
  classStudentRows,
  effectiveClassOverride,
  expandClassTargeting,
  studentTargetRefKey,
  type AssignTargetingValue,
  type ExpandClassTargetingOptions,
  type SetAssignmentTargetsPayload,
} from '@/utils/studentTargetRef';
import { isEmptyStudentOverride } from '@/utils/rosterDefaultOverrides';

/** The Classes step value: picked roster ids, and per-roster student picks (missing key = all students). */
export interface AssignClassesValue {
  classIds: string[];
  studentsByClass: Record<string, StudentTargetRef[]>;
}

/** The expanded targets plus the session classes narrowed to their picked students. */
export interface MixedTargeting {
  targeting: AssignTargetingValue;
  /** Session class ids (`classlinkClassId` / `testClassId`) that only picked students receive. */
  studentTargetClassIds: string[];
}

/** Roster ids the teacher narrowed to individual students. */
export function partialRosterIds(value: AssignClassesValue): string[] {
  return value.classIds.filter(
    (id) => (value.studentsByClass[id]?.length ?? 0) > 0
  );
}

/** Every session class id a roster contributes (ClassLink and test), none for a hand-built one. */
function sessionClassIdsFor(roster: ClassRoster): string[] {
  return [roster.classlinkClassId, roster.testClassId]
    .map((id) => id?.trim() ?? '')
    .filter((id) => id.length > 0);
}

/** Whole classes expand as today; partial classes target only their picked students. */
export function expandMixedTargeting(
  value: AssignTargetingValue,
  classes: AssignClassesValue,
  rosters: ClassRoster[],
  options: ExpandClassTargetingOptions = {}
): MixedTargeting {
  const useRosterDefaults = options.useRosterDefaults !== false;
  const partial = new Set(partialRosterIds(classes));
  const whole = classes.classIds.filter((id) => !partial.has(id));

  const partialRows = classStudentRows({
    rosters,
    selectedRosterIds: [...partial],
  });
  const partialRowByKey = new Map(partialRows.map((row) => [row.key, row]));
  // Partial-class students are decided by the picks, never by a stored target.
  const wholeExpanded = expandClassTargeting(
    {
      ...value,
      targetMode: 'class',
      targetStudents: value.targetStudents.filter(
        (ref) => !partialRowByKey.has(studentTargetRefKey(ref))
      ),
    },
    { rosters, selectedRosterIds: whole },
    options
  );

  const targetByKey = new Map<string, StudentTargetRef>();
  for (const ref of wholeExpanded.targetStudents)
    targetByKey.set(studentTargetRefKey(ref), ref);
  const overridesByKey: Record<string, StudentOverride> = {
    ...wholeExpanded.overridesByKey,
  };
  for (const rosterId of partial) {
    for (const ref of classes.studentsByClass[rosterId] ?? []) {
      const key = studentTargetRefKey(ref);
      targetByKey.set(key, ref);
      const row = partialRowByKey.get(key);
      const override = row
        ? effectiveClassOverride(row, value.overridesByKey, useRosterDefaults)
        : value.overridesByKey[key];
      if (override && !isEmptyStudentOverride(override)) {
        overridesByKey[key] = override;
      }
    }
  }

  // A class id a whole roster also maps to stays whole, or that roster's students would lose it.
  const wholeIds = new Set(whole);
  const wholeClassIds = new Set(
    rosters.filter((r) => wholeIds.has(r.id)).flatMap(sessionClassIdsFor)
  );
  const studentTargetClassIds = [
    ...new Set(
      rosters
        .filter((roster) => partial.has(roster.id))
        .flatMap(sessionClassIdsFor)
        .filter((id) => !wholeClassIds.has(id))
    ),
  ];

  return {
    targeting: {
      ...wholeExpanded,
      targetMode: 'class',
      targetStudents: [...targetByKey.values()],
      overridesByKey,
      excludedStudents: (wholeExpanded.excludedStudents ?? []).filter(
        (ref) => !targetByKey.has(studentTargetRefKey(ref))
      ),
    },
    studentTargetClassIds,
  };
}

/** Callable payload; `previous` is the last saved value, undefined on first assign. */
export function buildMixedTargetsPayload(
  previous: MixedTargeting | undefined,
  current: MixedTargeting
): SetAssignmentTargetsPayload {
  const payload = buildSetAssignmentTargetsPayload(
    previous?.targeting,
    current.targeting
  );
  // Sent whenever either side narrows, so un-narrowing a class reaches the server.
  const narrowingChanged =
    current.studentTargetClassIds.length > 0 ||
    (previous?.studentTargetClassIds.length ?? 0) > 0;
  return {
    ...payload,
    targetMode: 'class',
    ...(narrowingChanged
      ? { studentTargetClassIds: current.studentTargetClassIds }
      : {}),
  };
}

/** Shared `StudentTargetRef` derivation + key formatting (M17 spec §2a/§5 B1). */

import type {
  ClassRoster,
  Student,
  StudentOverride,
  StudentTargetRef,
} from '@/types';

/** Default 'class'-mode value for `AssignTargetingSection` (spec §5 B3). */
export interface AssignTargetingValue {
  targetMode: 'class' | 'students';
  targetStudents: StudentTargetRef[];
  targetGroupIds: string[];
  overridesByKey: Record<string, StudentOverride>;
  openAt?: number;
  closeAt?: number;
  dueAt?: number;
}

export const EMPTY_ASSIGN_TARGETING_VALUE: AssignTargetingValue = {
  targetMode: 'class',
  targetStudents: [],
  targetGroupIds: [],
  overridesByKey: {},
};

/**
 * Resolve a roster student to a `StudentTargetRef`, or `null` if the student
 * has no SSO identity and cannot be individually targeted (manually-created
 * roster row — `classLinkSourcedId` and roster `testClassId` both absent).
 */
export function resolveStudentTargetRef(
  student: Student,
  roster: Pick<ClassRoster, 'testClassId'>
): StudentTargetRef | null {
  if (student.classLinkSourcedId) {
    return { kind: 'classlink', sourcedId: student.classLinkSourcedId };
  }
  if (roster.testClassId && student.email) {
    return { kind: 'test', email: student.email };
  }
  return null;
}

/**
 * Namespaced key for a `StudentTargetRef`, matching the format the
 * `setAssignmentTargetsV1` Cloud Function expects on `overridesBySourcedId`:
 * `classlink:{sourcedId}` (case preserved) or `test:{emailLower}`.
 */
export function studentTargetRefKey(ref: StudentTargetRef): string {
  return ref.kind === 'classlink'
    ? `classlink:${ref.sourcedId}`
    : `test:${ref.email.toLowerCase()}`;
}

/** Structural equality for two `StudentTargetRef`s (used for selection toggles). */
export function studentTargetRefEquals(
  a: StudentTargetRef,
  b: StudentTargetRef
): boolean {
  return studentTargetRefKey(a) === studentTargetRefKey(b);
}

import type { ClassRoster, ClassRosterMeta, Student } from '@/types';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';

/** One row of `getGradebookRosterV1`: a namespaced ref key and the student's stable uid. */
export interface GradebookRosterEntry {
  refKey: string;
  studentUid: string;
}

export interface GradebookRosterJoin {
  /** Drive `Student.id` → stable uid. */
  studentUidByStudentId: Map<string, string>;
  /** Stable uid → the Drive roster student, for names. */
  studentByUid: Map<string, Student>;
  /** Roster students the server did not map (no SSO identity, or no longer enrolled). */
  unmatchedStudentIds: string[];
  /** Uids enrolled in the class but missing from the Drive roster file. */
  unrosteredUids: string[];
}

/** D8: only ClassLink and test-class rosters match work by a stable uid. */
export function isGradebookRoster(
  roster: Pick<ClassRosterMeta, 'classlinkClassId' | 'testClassId'>
): boolean {
  return Boolean(roster.classlinkClassId) || Boolean(roster.testClassId);
}

/** Join the server's ref → uid rows onto the Drive roster students. */
export function joinGradebookRoster(
  roster: Pick<ClassRoster, 'students' | 'testClassId'>,
  entries: readonly GradebookRosterEntry[]
): GradebookRosterJoin {
  const uidByRefKey = new Map<string, string>();
  for (const e of entries) uidByRefKey.set(e.refKey, e.studentUid);

  const studentUidByStudentId = new Map<string, string>();
  const studentByUid = new Map<string, Student>();
  const unmatchedStudentIds: string[] = [];
  for (const student of roster.students) {
    const ref = resolveStudentTargetRef(student, roster);
    const uid = ref ? uidByRefKey.get(studentTargetRefKey(ref)) : undefined;
    if (!uid || studentByUid.has(uid)) {
      unmatchedStudentIds.push(student.id);
      continue;
    }
    studentUidByStudentId.set(student.id, uid);
    studentByUid.set(uid, student);
  }
  const unrosteredUids = entries
    .map((e) => e.studentUid)
    .filter((uid) => !studentByUid.has(uid));
  return {
    studentUidByStudentId,
    studentByUid,
    unmatchedStudentIds,
    unrosteredUids,
  };
}

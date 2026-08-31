import type { StudentOverride } from '@/types';
import { useStudentAssignmentPointer } from './useStudentAssignmentPointer';

/**
 * Subscribes to a student's own pointer doc at
 * `/student_assignments/{studentUid}/items/{assignmentId}` and returns its
 * `override`, if any (M17 C3). Firestore rules gate reads to the student's
 * own uid plus the `studentRole` custom claim (see firestore.rules) — pass
 * `enabled: false` for anonymous/PIN joiners, who never hold that claim and
 * whose read would just be denied.
 *
 * Thin wrapper over `useStudentAssignmentPointer` (M17 E2 F4 consolidation)
 * — kept as a separate export for callers that only need `override`.
 */
export function useStudentAssignmentOverride(
  studentUid: string | null,
  assignmentId: string | null,
  enabled: boolean
): StudentOverride | undefined {
  const pointer = useStudentAssignmentPointer(
    studentUid,
    assignmentId,
    enabled
  );
  return pointer?.override;
}

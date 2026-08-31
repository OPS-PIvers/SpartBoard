import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentOverride } from '@/types';

/**
 * Subscribes to a student's own pointer doc at
 * `/student_assignments/{studentUid}/items/{assignmentId}` and returns its
 * `override`, if any (M17 C3). Firestore rules gate reads to the student's
 * own uid plus the `studentRole` custom claim (see firestore.rules) — pass
 * `enabled: false` for anonymous/PIN joiners, who never hold that claim and
 * whose read would just be denied.
 */
export function useStudentAssignmentOverride(
  studentUid: string | null,
  assignmentId: string | null,
  enabled: boolean
): StudentOverride | undefined {
  const [override, setOverride] = useState<StudentOverride | undefined>(
    undefined
  );
  const active = enabled && !!studentUid && !!assignmentId;
  // Adjust-state-during-render (CLAUDE.md pattern) instead of an effect, so
  // flipping to disabled clears stale data without an extra render pass.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setOverride(undefined);
  }

  useEffect(() => {
    if (!enabled || !studentUid || !assignmentId) {
      return;
    }
    const ref = doc(
      db,
      'student_assignments',
      studentUid,
      'items',
      assignmentId
    );
    return onSnapshot(
      ref,
      (snap) => {
        setOverride(snap.data()?.override as StudentOverride | undefined);
      },
      () => setOverride(undefined)
    );
  }, [enabled, studentUid, assignmentId]);

  return override;
}

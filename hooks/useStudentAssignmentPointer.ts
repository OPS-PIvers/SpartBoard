/**
 * useStudentAssignmentPointer — reads a single student's own pointer doc at
 * `/student_assignments/{studentUid}/items/{assignmentId}` (M17 spec §2a/C3).
 *
 * Used by student apps entered directly by session URL (e.g. `/quiz?code=`)
 * rather than via `/my-assignments` — `useStudentAssignments` already
 * delivers the same pointer data for the hub list, but a direct-session
 * visit never mounts that hook, so the quiz/VA/GL/mini-app student apps
 * read their own pointer here to materialize `override`.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentAssignmentPointer } from '@/types';
import { logError } from '@/utils/logError';

export function useStudentAssignmentPointer(
  studentUid: string | null | undefined,
  assignmentId: string | null | undefined
): StudentAssignmentPointer | null {
  const [pointer, setPointer] = useState<StudentAssignmentPointer | null>(null);
  // Adjusting state while rendering (no setState-in-effect): reset to null
  // the moment the identity changes, in the same render that observes the
  // change, rather than in a subsequent effect pass.
  const identity = `${studentUid ?? ''}#${assignmentId ?? ''}`;
  const [seenIdentity, setSeenIdentity] = useState(identity);
  if (seenIdentity !== identity) {
    setSeenIdentity(identity);
    setPointer(null);
  }

  useEffect(() => {
    if (!studentUid || !assignmentId) return;
    const ref = doc(
      db,
      'student_assignments',
      studentUid,
      'items',
      assignmentId
    );
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setPointer(
          snap.exists() ? (snap.data() as StudentAssignmentPointer) : null
        );
      },
      (err) => {
        logError('[useStudentAssignmentPointer] snapshot failed', err);
        setPointer(null);
      }
    );
    return unsubscribe;
  }, [studentUid, assignmentId]);

  return pointer;
}

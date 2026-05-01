/**
 * useMiniAppAssignments — per-teacher archive of MiniApp assignments.
 *
 * An "assignment" here is a thin archive row pointing at an underlying
 * MiniAppSession (see `hooks/useMiniAppSession.ts`). The session doc under
 * `/mini_app_sessions/{sessionId}` owns the live student link; this
 * collection gives the library's Archive/In-Progress tabs a stable, sortable
 * per-teacher history that survives session cleanup.
 *
 * Firestore path:
 *   /users/{teacherUid}/miniapp_assignments/{assignmentId}
 *
 * The hook is intentionally minimal: create, end (== mark inactive), delete,
 * and real-time list. Renames are pushed through to the underlying session
 * via `renameAssignment` so both documents stay in sync.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { AssignmentMode, MiniAppAssignment, MiniAppItem } from '@/types';

const ASSIGNMENTS_COLLECTION = 'miniapp_assignments';
const SESSIONS_COLLECTION = 'mini_app_sessions';

export interface CreateMiniAppAssignmentInput {
  sessionId: string;
  app: Pick<MiniAppItem, 'id' | 'title'>;
  assignmentName: string;
  /** Roster IDs the teacher targeted (unified picker output). Mirrored onto
   *  the assignment doc to match the Quiz/VA/GL shape so any future filtering
   *  in the Library shell can key off the assignment list without a
   *  session-doc join. */
  rosterIds?: string[];
  /** Frozen at creation from the org-wide `assignment-modes` admin setting.
   *  Mirrors MiniAppSession.mode. The `submissionsEnabled` field on the
   *  assignment doc is derived from this — callers don't pass it directly. */
  mode?: AssignmentMode;
}

export interface UseMiniAppAssignmentsResult {
  assignments: MiniAppAssignment[];
  loading: boolean;
  error: string | null;
  /** Create an archive row for a freshly-created session. Returns the assignmentId. */
  createAssignment: (input: CreateMiniAppAssignmentInput) => Promise<string>;
  /** Rename the assignment and mirror the rename into the underlying session doc. */
  renameAssignment: (assignmentId: string, name: string) => Promise<void>;
  /** Mark the assignment inactive and end the underlying session. */
  endAssignment: (assignmentId: string) => Promise<void>;
  /** Permanently remove the archive row (the session doc is left as-is). */
  deleteAssignment: (assignmentId: string) => Promise<void>;
}

export const useMiniAppAssignments = (
  userId: string | undefined
): UseMiniAppAssignmentsResult => {
  const [assignments, setAssignments] = useState<MiniAppAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Adjust state during render when userId transitions — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data on
  // sign-out.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setAssignments([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, ASSIGNMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAssignments(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MiniAppAssignment)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useMiniAppAssignments] Firestore error:', err);
        setError('Failed to load assignments');
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  const createAssignment = useCallback<
    UseMiniAppAssignmentsResult['createAssignment']
  >(
    async (input) => {
      if (!userId) throw new Error('Not authenticated');

      const assignmentId = crypto.randomUUID();
      const now = Date.now();
      const trimmedName = input.assignmentName.trim();

      const cleanedRosterIds = (input.rosterIds ?? []).filter(
        (r): r is string => typeof r === 'string' && r.length > 0
      );

      // Intentionally do NOT mirror `classIds` onto the assignment doc.
      // The student SSO gate reads `classIds[]` from the MiniAppSession (see
      // `mini_app_sessions` Firestore rules); the assignment archive only
      // needs targeting metadata that teacher-side code actually reads back,
      // and no caller reads `assignment.classIds`. Matches the Quiz/VA/GL
      // shape (their assignment docs also store `rosterIds` only).
      const mode: AssignmentMode = input.mode ?? 'submissions';
      const assignment: MiniAppAssignment = {
        id: assignmentId,
        sessionId: input.sessionId,
        appId: input.app.id,
        appTitle: input.app.title,
        assignmentName:
          trimmedName.length > 0
            ? trimmedName
            : `${input.app.title} — ${new Date(now).toLocaleString()}`,
        teacherUid: userId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...(cleanedRosterIds.length > 0 ? { rosterIds: cleanedRosterIds } : {}),
        // Derived from `mode` so the two fields can never diverge.
        submissionsEnabled: mode === 'submissions',
        mode,
      };

      await setDoc(
        doc(db, 'users', userId, ASSIGNMENTS_COLLECTION, assignmentId),
        assignment
      );
      return assignmentId;
    },
    [userId]
  );

  const renameAssignment = useCallback<
    UseMiniAppAssignmentsResult['renameAssignment']
  >(
    async (assignmentId, name) => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = name.trim();
      const now = Date.now();

      // Look up the sessionId so we can mirror the rename.
      const assignment = assignments.find((a) => a.id === assignmentId);

      await updateDoc(
        doc(db, 'users', userId, ASSIGNMENTS_COLLECTION, assignmentId),
        { assignmentName: trimmed, updatedAt: now }
      );

      if (assignment?.sessionId) {
        try {
          await updateDoc(doc(db, SESSIONS_COLLECTION, assignment.sessionId), {
            assignmentName: trimmed,
          });
        } catch (err) {
          // Session may have been deleted; don't block the rename.
          console.warn(
            '[useMiniAppAssignments] session rename mirror failed',
            err
          );
        }
      }
    },
    [userId, assignments]
  );

  const endAssignment = useCallback<
    UseMiniAppAssignmentsResult['endAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const assignment = assignments.find((a) => a.id === assignmentId);

      await updateDoc(
        doc(db, 'users', userId, ASSIGNMENTS_COLLECTION, assignmentId),
        { status: 'inactive', updatedAt: now }
      );

      if (assignment?.sessionId) {
        try {
          await updateDoc(doc(db, SESSIONS_COLLECTION, assignment.sessionId), {
            status: 'ended',
            endedAt: now,
          });
        } catch (err) {
          console.warn(
            '[useMiniAppAssignments] session end mirror failed',
            err
          );
        }
      }
    },
    [userId, assignments]
  );

  const deleteAssignment = useCallback<
    UseMiniAppAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      await deleteDoc(
        doc(db, 'users', userId, ASSIGNMENTS_COLLECTION, assignmentId)
      );
    },
    [userId]
  );

  return {
    assignments,
    loading,
    error,
    createAssignment,
    renameAssignment,
    endAssignment,
    deleteAssignment,
  };
};

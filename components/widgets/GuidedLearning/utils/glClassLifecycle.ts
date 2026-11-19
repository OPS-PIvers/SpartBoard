import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { GuidedLearningAssignment } from '@/types';
import { END_TURN_IN_DELAY_MS } from '@/utils/quizFinalizeOpenResponses';
import { invalidateSessionViewCount } from '@/hooks/useSessionViewCount';
import type { UseGuidedLearningAssignmentsResult } from '@/hooks/useGuidedLearningAssignments';
import type {
  AssignmentClassCollections,
  AssignmentLifecycle,
  AssignmentRun,
} from '@/hooks/useAssignmentClassActions';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import { hasStudentPointers } from '@/utils/studentTargetRef';
import {
  finalizeClassGuidedLearningResponses,
  finalizeOpenGuidedLearningResponses,
} from './glTurnIn';

const SESSIONS = 'guided_learning_sessions';
const ASSIGNMENTS = 'guided_learning_assignments';

export const GL_CLASS_COLLECTIONS = {
  sessionCollection: SESSIONS,
  assignmentCollection: ASSIGNMENTS,
  refreshIdle: false,
} as const satisfies AssignmentClassCollections;

/** The whole-run writes the Assigned tab's class actions drive for one Guided Learning assignment. */
export interface GuidedLearningLifecycle extends AssignmentLifecycle {
  end: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  turnInClass: (
    sessionId: string,
    classKey: string,
    closedAt: number
  ) => Promise<void>;
  turnInDelayMs: number;
  endTurnsIn: true;
  isEnded: (a: Pick<AssignmentRun, 'status' | 'closeAt'>) => boolean;
  /** Keeps each targeted student's own pointer window in step with a cleared run window. */
  onWindowCleared: (
    id: string,
    patch: { openAt?: null; closeAt?: null }
  ) => Promise<void>;
}

/** An archived run, or a single-line run whose own close time has passed. */
export function isGuidedLearningEnded(
  a: Pick<AssignmentRun, 'status' | 'closeAt'>,
  now: number = Date.now()
): boolean {
  return a.status === 'archived' || (a.closeAt != null && a.closeAt <= now);
}

/** GL has no session status: End archives and stamps closeAt, Reopen clears it so students get back in at once (D9). */
export function guidedLearningLifecycle(
  uid: string,
  actions: Pick<UseGuidedLearningAssignmentsResult, 'archiveAssignment'> &
    Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'>
): GuidedLearningLifecycle {
  const scheduleTurnIn = (id: string, closeAt: number) => {
    const wait = Math.max(0, closeAt + END_TURN_IN_DELAY_MS - Date.now());
    setTimeout(() => {
      finalizeOpenGuidedLearningResponses(id, closeAt).catch((err: unknown) =>
        console.error('[guidedLearningLifecycle] End turn-in failed:', err)
      );
    }, wait);
  };

  const syncPointers = async (
    id: string,
    row: Partial<GuidedLearningAssignment> | undefined,
    window: { openAt?: number | null; closeAt?: number | null }
  ) => {
    if (!row || !hasStudentPointers(row)) return;
    try {
      await actions.setAssignmentTargets({
        assignmentId: id,
        kind: 'guided-learning',
        sessionId: id,
        targetMode: row.targetMode,
        add: [],
        remove: [],
        overridesBySourcedId: {},
        window,
      });
    } catch (err) {
      // A failed pointer sync must not stop Open.
      console.error('[guidedLearningLifecycle] Pointer sync failed:', err);
    }
  };

  return {
    async end(id) {
      const sessionRef = doc(db, SESSIONS, id);
      const rowRef = doc(db, 'users', uid, ASSIGNMENTS, id);
      const before: unknown = (await getDoc(sessionRef)).data()?.closeAt;
      const marked: unknown = (await getDoc(rowRef)).data()?.closedAt;
      await actions.archiveAssignment(id);
      const now = Date.now();
      // The close mark keeps a row closed here findable past the archive page (D24); a future close is kept for Reopen.
      const patch = {
        ...(typeof marked === 'number' ? {} : { closedAt: now }),
        ...(typeof before === 'number' && before > now
          ? { closeAtBeforeEnd: before }
          : {}),
      };
      if (Object.keys(patch).length > 0) await updateDoc(rowRef, patch);
      // Archive keeps an earlier close, so turn in against whatever closeAt now stands.
      const closeAt: unknown = (await getDoc(sessionRef)).data()?.closeAt;
      if (typeof closeAt === 'number') scheduleTurnIn(id, closeAt);
    },
    async reopen(id) {
      const now = Date.now();
      const sessionRef = doc(db, SESSIONS, id);
      const rowRef = doc(db, 'users', uid, ASSIGNMENTS, id);
      const passed = (v: unknown) => typeof v === 'number' && v <= now;
      const [sessionSnap, rowSnap] = await Promise.all([
        getDoc(sessionRef),
        getDoc(rowRef),
      ]);
      const row = rowSnap.data() as
        Partial<GuidedLearningAssignment> | undefined;
      // Each doc is checked on its own, so a row that drifted from its session still reopens.
      const sessionClosed = passed(sessionSnap.data()?.closeAt);
      const rowClosed = passed(row?.closeAt);
      const kept = row?.closeAtBeforeEnd;
      const next = typeof kept === 'number' && kept > now ? kept : null;
      const batch = writeBatch(db);
      batch.update(rowRef, {
        status: 'active',
        updatedAt: now,
        archivedAt: null,
        closeAtBeforeEnd: null,
        ...(sessionClosed || rowClosed ? { closeAt: next } : {}),
      });
      if (sessionClosed) batch.update(sessionRef, { closeAt: next });
      await batch.commit();
      invalidateSessionViewCount(SESSIONS, id);
      // Accommodated and skipped students read the close off their own pointer doc.
      if (sessionClosed || rowClosed)
        await syncPointers(id, row, { closeAt: next });
    },
    async onWindowCleared(id, patch) {
      const row = (
        await getDoc(doc(db, 'users', uid, ASSIGNMENTS, id))
      ).data() as Partial<GuidedLearningAssignment> | undefined;
      await syncPointers(id, row, patch);
    },
    turnInClass: (sessionId, classKey, closedAt) =>
      finalizeClassGuidedLearningResponses(sessionId, classKey, closedAt),
    turnInDelayMs: END_TURN_IN_DELAY_MS,
    endTurnsIn: true,
    isEnded: (a) => isGuidedLearningEnded(a),
  };
}

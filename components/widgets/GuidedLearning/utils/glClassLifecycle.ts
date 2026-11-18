import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { GuidedLearningAssignment } from '@/types';
import { END_TURN_IN_DELAY_MS } from '@/utils/quizFinalizeOpenResponses';
import { invalidateSessionViewCount } from '@/hooks/useSessionViewCount';
import type { UseGuidedLearningAssignmentsResult } from '@/hooks/useGuidedLearningAssignments';
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
} as const;

/** The whole-run writes the Assigned tab's class actions drive for one Guided Learning assignment. */
export interface GuidedLearningLifecycle {
  end: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  turnInClass: (
    sessionId: string,
    classKey: string,
    closedAt: number
  ) => Promise<void>;
  turnInDelayMs: number;
  endTurnsIn: true;
  isEnded: (a: Pick<GuidedLearningAssignment, 'status' | 'closeAt'>) => boolean;
}

/** An archived run, or a single-line run whose own close time has passed. */
export function isGuidedLearningEnded(
  a: Pick<GuidedLearningAssignment, 'status' | 'closeAt'>,
  now: number = Date.now()
): boolean {
  return a.status === 'archived' || (a.closeAt != null && a.closeAt <= now);
}

/** GL has no session status: End archives and stamps closeAt, Reopen clears it so students get back in at once (D9). */
export function guidedLearningLifecycle(
  uid: string,
  actions: Pick<UseGuidedLearningAssignmentsResult, 'archiveAssignment'>
): GuidedLearningLifecycle {
  const scheduleTurnIn = (id: string, closeAt: number) => {
    const wait = Math.max(0, closeAt + END_TURN_IN_DELAY_MS - Date.now());
    setTimeout(() => {
      finalizeOpenGuidedLearningResponses(id, closeAt).catch((err: unknown) =>
        console.error('[guidedLearningLifecycle] End turn-in failed:', err)
      );
    }, wait);
  };

  return {
    async end(id) {
      await actions.archiveAssignment(id);
      // Archive keeps an earlier close, so turn in against whatever closeAt now stands.
      const closeAt: unknown = (await getDoc(doc(db, SESSIONS, id))).data()
        ?.closeAt;
      if (typeof closeAt === 'number') scheduleTurnIn(id, closeAt);
    },
    async reopen(id) {
      const now = Date.now();
      const sessionRef = doc(db, SESSIONS, id);
      const closeAt: unknown = (await getDoc(sessionRef)).data()?.closeAt;
      const closed = typeof closeAt === 'number' && closeAt <= now;
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', uid, ASSIGNMENTS, id), {
        status: 'active',
        updatedAt: now,
        archivedAt: null,
        ...(closed ? { closeAt: null } : {}),
      });
      if (closed) batch.update(sessionRef, { closeAt: null });
      await batch.commit();
      invalidateSessionViewCount(SESSIONS, id);
    },
    turnInClass: (sessionId, classKey, closedAt) =>
      finalizeClassGuidedLearningResponses(sessionId, classKey, closedAt),
    turnInDelayMs: END_TURN_IN_DELAY_MS,
    endTurnsIn: true,
    isEnded: (a) => isGuidedLearningEnded(a),
  };
}

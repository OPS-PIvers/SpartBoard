import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { UseVideoActivityAssignmentsResult } from '@/hooks/useVideoActivityAssignments';
import { END_TURN_IN_DELAY_MS } from '@/utils/quizFinalizeOpenResponses';
import { finalizeClassVideoResponses } from './videoClassTurnIn';

/** Where Video Activity keeps its run docs, for the per-class actions hook. */
export const VIDEO_ACTIVITY_RUN_COLLECTIONS = {
  sessionCollection: 'video_activity_sessions',
  assignmentCollection: 'video_activity_assignments',
} as const;

/** The whole-assignment writes a per-class actions hook drives for Video Activity (ASSIGNED_TAB D21). */
export interface VideoActivityLifecycle {
  pause: (assignmentId: string) => Promise<void>;
  /** Paused to active; a no-op on an ended run. */
  resume: (assignmentId: string) => Promise<void>;
  end: (assignmentId: string) => Promise<void>;
  /** D9: an ended run comes back active at once, with no Paused step. */
  reopen: (assignmentId: string) => Promise<void>;
  /** D6: turns in one closed class's open attempts, unless it was reopened or closed again since `closedAt`. */
  turnInClass: (
    sessionId: string,
    classKey: string,
    closedAt: number
  ) => Promise<void>;
  /** Waits out a Close the teacher undoes quickly, as Quiz does. */
  turnInDelayMs: number;
  /** End leaves attempts open, so the last class's Close still turns its own in. */
  endTurnsIn: false;
}

export const LIVE_REOPEN_REASON =
  'A live video run cannot be reopened. Assign it again.';
export const LIVE_PAUSE_REASON = 'A live video run cannot be paused.';

/** A board-paced run: rules keep it ended once ended, and a VA Pause ends the session. */
async function isLiveRun(
  assignmentId: string
): Promise<{ live: boolean; ended: boolean }> {
  const snap = await getDoc(
    doc(db, VIDEO_ACTIVITY_RUN_COLLECTIONS.sessionCollection, assignmentId)
  );
  const s = snap.data() as
    { sessionMode?: unknown; status?: unknown } | undefined;
  return { live: s?.sessionMode === 'teacher', ended: s?.status === 'ended' };
}

/** Builds the Video Activity lifecycle from the assignments hook's existing writes. */
export function videoActivityLifecycle(
  hook: Pick<
    UseVideoActivityAssignmentsResult,
    | 'pauseAssignment'
    | 'resumeAssignment'
    | 'deactivateAssignment'
    | 'reactivateAssignment'
  >
): VideoActivityLifecycle {
  return {
    pause: async (assignmentId) => {
      if ((await isLiveRun(assignmentId)).live)
        throw new Error(LIVE_PAUSE_REASON);
      await hook.pauseAssignment(assignmentId);
    },
    resume: hook.resumeAssignment,
    end: hook.deactivateAssignment,
    reopen: async (assignmentId) => {
      const run = await isLiveRun(assignmentId);
      if (run.live && run.ended) throw new Error(LIVE_REOPEN_REASON);
      await hook.reactivateAssignment(assignmentId);
    },
    turnInClass: (sessionId, classKey, closedAt) =>
      finalizeClassVideoResponses(sessionId, classKey, closedAt),
    turnInDelayMs: END_TURN_IN_DELAY_MS,
    endTurnsIn: false,
  };
}

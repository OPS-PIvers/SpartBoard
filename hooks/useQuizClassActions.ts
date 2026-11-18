import { useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { ClassRoster, QuizAssignment } from '@/types';
import { usePeriodAccess } from '@/hooks/usePeriodAccess';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import { isClassClosed } from '@/utils/assignedStatus';

/** The whole-assignment writes `useQuizAssignments` already owns; D21 drives them. */
export type QuizLifecycle = Pick<
  UseQuizAssignmentsResult,
  | 'pauseAssignment'
  | 'resumeAssignment'
  | 'deactivateAssignment'
  | 'reopenAssignment'
>;

/** Per-class actions for the Assigned tab; a null key is the whole single-line assignment (D15). */
export interface QuizClassActions {
  /** Opens a Ready, Scheduled or Paused class; resolves to assessment classes left with no end bell. */
  openClass: (key: string | null) => Promise<string[]>;
  pauseClass: (key: string | null) => Promise<void>;
  closeClass: (key: string | null) => Promise<void>;
  /** D9: lets a closed class back in at once. */
  reopenClass: (key: string | null) => Promise<string[]>;
  /** D10 "Close for all classes". */
  closeAll: () => Promise<void>;
  /** D5/D10: closes every class and marks the row Done whatever its grading. */
  moveToDone: () => Promise<void>;
}

/** Quiz class actions that keep the stored overall status in step (ASSIGNED_TAB.md D21). */
export function useQuizClassActions(
  assignment: QuizAssignment | null,
  lifecycle: QuizLifecycle,
  rosters: readonly Pick<ClassRoster, 'id' | 'bellPeriod'>[] | undefined
): QuizClassActions {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const pa = assignment?.periodAccess;
  const perClass = !!pa && Object.keys(pa).length > 0;
  const periods = usePeriodAccess(
    perClass ? assignment : null,
    {
      sessionCollection: 'quiz_sessions',
      assignmentCollection: 'quiz_assignments',
    },
    rosters
  );
  const {
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reopenAssignment,
  } = lifecycle;
  const id = assignment?.id ?? null;
  const status = assignment?.status;

  const mark = useCallback(
    async (fields: Partial<Pick<QuizAssignment, 'closedAt' | 'doneAt'>>) => {
      if (!uid || !id || uid !== assignment?.teacherUid) return;
      await updateDoc(doc(db, 'users', uid, 'quiz_assignments', id), fields);
    },
    [uid, id, assignment?.teacherUid]
  );

  // D21: any class opening makes the assignment active; an ended run reopens first.
  const ensureActive = useCallback(async () => {
    if (!id || status === 'active') return;
    if (status === 'inactive') await reopenAssignment(id);
    await resumeAssignment(id);
  }, [id, status, reopenAssignment, resumeAssignment]);

  const end = useCallback(async () => {
    if (id && status !== 'inactive') await deactivateAssignment(id);
  }, [id, status, deactivateAssignment]);

  const open = useCallback(
    async (key: string | null, reopen: boolean): Promise<string[]> => {
      if (!id) return [];
      if (!perClass || key == null) {
        if (assignment?.closedAt != null || assignment?.doneAt != null)
          await mark({ closedAt: null, doneAt: null });
        await ensureActive();
        return [];
      }
      // An ended run's other classes were Closed (D20); they stay closed when this one reopens.
      if (status === 'inactive')
        for (const [k, access] of Object.entries(pa ?? {}))
          if (k !== key && access.state !== 'closed')
            await periods.closePeriod(k);
      const untimed = reopen
        ? await periods.reopenPeriod(key)
        : await periods.startPeriod(key);
      if (assignment?.doneAt != null) await mark({ doneAt: null });
      await ensureActive();
      return untimed;
    },
    [id, perClass, pa, status, assignment, mark, ensureActive, periods]
  );

  const closeClass = useCallback(
    async (key: string | null) => {
      if (!id) return;
      if (!perClass || key == null) {
        await mark({ closedAt: Date.now() });
        await end();
        return;
      }
      const now = Date.now();
      const othersClosed = Object.entries(pa ?? {}).every(
        ([k, access]) => k === key || isClassClosed(access, now)
      );
      await periods.closePeriod(key);
      if (othersClosed) await end();
    },
    [id, perClass, pa, periods, mark, end]
  );

  const closeAll = useCallback(async () => {
    if (!id) return;
    if (perClass) await periods.closeAllPeriods();
    else await mark({ closedAt: Date.now() });
    await end();
  }, [id, perClass, periods, mark, end]);

  const moveToDone = useCallback(async () => {
    if (!id) return;
    if (perClass) await periods.closeAllPeriods();
    await mark({
      doneAt: Date.now(),
      ...(perClass || assignment?.closedAt != null
        ? {}
        : { closedAt: Date.now() }),
    });
    await end();
  }, [id, perClass, periods, mark, end, assignment?.closedAt]);

  const pauseClass = useCallback(
    async (key: string | null) => {
      if (!id) return;
      if (!perClass || key == null) await pauseAssignment(id);
      else await periods.pausePeriod(key);
    },
    [id, perClass, periods, pauseAssignment]
  );

  return {
    openClass: (key) => open(key, false),
    pauseClass,
    closeClass,
    reopenClass: (key) => open(key, true),
    closeAll,
    moveToDone,
  };
}

import { useCallback, useMemo } from 'react';
import {
  doc,
  FieldPath,
  getDoc,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { ClassRoster, QuizAssignment } from '@/types';
import { closedRow, usePeriodAccess } from '@/hooks/usePeriodAccess';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import { isClassClosed } from '@/utils/assignedStatus';
import { effectivePeriodState } from '@/utils/periodAccess';
import {
  END_TURN_IN_DELAY_MS,
  finalizeClassQuizResponses,
} from '@/utils/quizFinalizeOpenResponses';

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
  const keys = useMemo(() => Object.keys(pa ?? {}), [pa]);
  const perClass = keys.length > 0;
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
  const teacherUid = assignment?.teacherUid;

  const refs = useMemo(() => {
    if (!id || !uid || uid !== teacherUid) return null;
    return {
      session: doc(db, 'quiz_sessions', id),
      assignment: doc(db, 'users', uid, 'quiz_assignments', id),
    };
  }, [id, uid, teacherUid]);

  const owned = useCallback(() => {
    if (!refs) throw new Error('Only the assigning teacher can change this.');
    return refs;
  }, [refs]);

  // Decisions read the stored doc, never this render's snapshot, so a second tab or a quick double click can't race.
  const fresh = useCallback(async () => {
    const snap = await getDoc(owned().assignment);
    return snap.data() as QuizAssignment | undefined;
  }, [owned]);

  /** A perClass row key; a null key means the sole class (D15). */
  const classKey = useCallback(
    (key: string | null): string | null => {
      if (!perClass) return null;
      if (key != null) {
        if (!keys.includes(key))
          throw new Error(`This assignment has no class "${key}".`);
        return key;
      }
      if (keys.length === 1) return keys[0];
      throw new Error('Pick a class: this assignment has more than one.');
    },
    [perClass, keys]
  );

  const mark = useCallback(
    async (fields: Partial<Pick<QuizAssignment, 'closedAt' | 'doneAt'>>) => {
      await updateDoc(owned().assignment, fields);
    },
    [owned]
  );

  // D21: any class opening makes the assignment active.
  const ensureActive = useCallback(
    async (opened: string | null) => {
      if (!id) return;
      const a = await fresh();
      if (!a || a.status === 'active') return;
      if (a.status === 'inactive') {
        // An ended run's other classes were Closed (D20); stamp them so they stay closed, not Ready.
        const now = Date.now();
        for (const [k, row] of Object.entries(a.periodAccess ?? {}))
          if (k !== opened && !isClassClosed(row, now))
            await periods.closePeriod(k);
        await reopenAssignment(id);
      } else {
        // A whole-run pause froze every open class; only the one opened comes back. Scheduled and clock-closed classes stay as they are.
        const now = Date.now();
        for (const [k, row] of Object.entries(a.periodAccess ?? {}))
          if (k !== opened && effectivePeriodState(row, now) === 'open')
            await periods.pausePeriod(k);
      }
      await resumeAssignment(id);
    },
    [id, fresh, periods, reopenAssignment, resumeAssignment]
  );

  const endIfLive = useCallback(async () => {
    if (!id) return;
    const a = await fresh();
    if (a && a.status !== 'inactive') await deactivateAssignment(id);
  }, [id, fresh, deactivateAssignment]);

  // A single line's own clock must not hold students out once the teacher opens it.
  const clearSingleGate = useCallback(async () => {
    const a = await fresh();
    const now = Date.now();
    const patch: Record<string, null> = {};
    if (a?.openAt != null && a.openAt > now) patch.openAt = null;
    if (a?.closeAt != null && a.closeAt <= now) patch.closeAt = null;
    if (Object.keys(patch).length === 0) return;
    const { session, assignment: assignmentRef } = owned();
    const batch = writeBatch(db);
    batch.update(session, patch);
    batch.update(assignmentRef, patch);
    await batch.commit();
  }, [fresh, owned]);

  const open = useCallback(
    async (key: string | null, reopen: boolean): Promise<string[]> => {
      if (!id) return [];
      owned();
      const k = classKey(key);
      if (k == null) {
        await clearSingleGate();
        await ensureActive(null);
        return [];
      }
      const untimed = reopen
        ? await periods.reopenPeriod(k)
        : await periods.startPeriod(k);
      await ensureActive(k);
      return untimed;
    },
    [id, classKey, owned, clearSingleGate, ensureActive, periods]
  );

  // Closes one class and reports, from the same transaction, whether it was the last one open (D21).
  const closeOne = useCallback(
    async (
      key: string
    ): Promise<{ last: boolean; closedAt: number } | null> => {
      const { session, assignment: assignmentRef } = owned();
      return runTransaction(db, async (tx) => {
        const a = (await tx.get(assignmentRef)).data() as
          QuizAssignment | undefined;
        const rows = a?.periodAccess ?? {};
        if (!rows[key]) return null;
        const now = Date.now();
        const [first, firstValue, ...rest] = Object.entries(
          closedRow(now)
        ).flatMap(([f, v]) => [new FieldPath('periodAccess', key, f), v]);
        for (const ref of [session, assignmentRef])
          tx.update(ref, first as FieldPath, firstValue, ...rest);
        const othersClosed = Object.entries(rows).every(
          ([k, row]) => k === key || isClassClosed(row, now)
        );
        return {
          last: othersClosed && a?.status !== 'inactive',
          closedAt: now,
        };
      });
    },
    [owned]
  );

  const closeClass = useCallback(
    async (key: string | null) => {
      if (!id) return;
      owned();
      const k = classKey(key);
      if (k == null) {
        await mark({ closedAt: Date.now() });
        await endIfLive();
        return;
      }
      const closed = await closeOne(k);
      if (!closed) return;
      if (closed.last) {
        await deactivateAssignment(id);
        return;
      }
      // Close means that class is finished: turn its open attempts in once their write grace runs out.
      setTimeout(() => {
        finalizeClassQuizResponses(id, k, closed.closedAt).catch(
          (err: unknown) =>
            console.error('[useQuizClassActions] Close turn-in failed:', err)
        );
      }, END_TURN_IN_DELAY_MS);
    },
    [id, owned, classKey, mark, endIfLive, closeOne, deactivateAssignment]
  );

  const closeAll = useCallback(async () => {
    if (!id) return;
    owned();
    if (perClass) await periods.closeAllPeriods();
    else await mark({ closedAt: Date.now() });
    await endIfLive();
  }, [id, owned, perClass, periods, mark, endIfLive]);

  const moveToDone = useCallback(async () => {
    if (!id) return;
    owned();
    if (perClass) await periods.closeAllPeriods();
    const a = await fresh();
    const now = Date.now();
    await mark({
      doneAt: now,
      ...(perClass || a?.closedAt != null ? {} : { closedAt: now }),
    });
    await endIfLive();
  }, [id, owned, perClass, periods, fresh, mark, endIfLive]);

  const pauseClass = useCallback(
    async (key: string | null) => {
      if (!id) return;
      owned();
      const k = classKey(key);
      if (k == null) await pauseAssignment(id);
      else await periods.pausePeriod(k);
    },
    [id, owned, classKey, periods, pauseAssignment]
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

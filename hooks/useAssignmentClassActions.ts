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
import type { ClassRoster, PeriodAccessSessionFields } from '@/types';
import { closedRow, usePeriodAccess } from '@/hooks/usePeriodAccess';
import { isClassClosed, runStatus } from '@/utils/assignedStatus';
import { effectivePeriodState } from '@/utils/periodAccess';

/** The assignment doc fields the class actions read, common to every kind whose teacher writes its session. */
export interface AssignmentRun extends PeriodAccessSessionFields {
  id: string;
  teacherUid: string;
  /** The kind's stored status; `runStatus` reads ended, archived and inactive as ended. */
  status: string;
  /** The session doc id, when it is not the assignment id (Mini Apps). */
  sessionId?: string;
  openAt?: number | null;
  closeAt?: number | null;
  /** D24 single-line close mark and D5 Move to Done mark. */
  closedAt?: number | null;
  doneAt?: number | null;
  /** D11: when a single line was last opened from the Assigned tab. */
  openedAt?: number | null;
}

/** Where a kind keeps its session and the teacher's assignment doc. */
export interface AssignmentClassCollections {
  sessionCollection: string;
  /** Under `users/{teacherUid}`. */
  assignmentCollection: string;
  /** False for kinds with no idle finalizer, as `usePeriodAccess` takes it. */
  refreshIdle?: boolean;
}

/** A kind's whole-assignment writes, each taking the assignment id (not the session id); D21 drives them. */
export interface AssignmentLifecycle {
  /** Freezes a single-line run; absent where the kind has no whole-run pause. */
  pause?: (assignmentId: string) => Promise<void>;
  /** Makes a paused run active; absent where reopen alone leaves it active. */
  resume?: (assignmentId: string) => Promise<void>;
  /** Ends the run, as the kind's End or Archive does. */
  end: (assignmentId: string) => Promise<void>;
  /** Brings an ended run back; `resume` follows when given. */
  reopen: (assignmentId: string) => Promise<void>;
  /** Turns in one closed class's open attempts; gate on the class still closed at `closedAt`. */
  turnInClass?: (
    sessionId: string,
    classKey: string,
    closedAt: number
  ) => Promise<void>;
  /** The write grace before `turnInClass` runs. */
  turnInDelayMs?: number;
  /** The kind's `end` turns in open attempts itself, so the last class's Close leaves it to `end`. */
  endTurnsIn?: boolean;
  /** Rewrites student pointers after a single-line Open clears a passed window on the session and row. */
  onWindowCleared?: (
    assignmentId: string,
    patch: { openAt?: null; closeAt?: null }
  ) => Promise<void>;
  /** The kind's `reopen` already clears the assignment's closedAt and doneAt marks. */
  reopenClearsMarks?: boolean;
  /** Reads the stored doc as ended; defaults to `runStatus(status) === 'inactive'`. */
  isEnded?: (doc: AssignmentRun) => boolean;
}

/** Per-class actions for the Assigned tab; a null key is the whole single-line assignment (D15). */
export interface AssignmentClassActions {
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

/** Class actions for any kind whose teacher writes its session directly (not Writing) that keep its status in step (D21). */
export function useAssignmentClassActions(
  assignment: AssignmentRun | null,
  collections: AssignmentClassCollections,
  lifecycle: AssignmentLifecycle,
  rosters: readonly Pick<ClassRoster, 'id' | 'bellPeriod'>[] | undefined
): AssignmentClassActions {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const pa = assignment?.periodAccess;
  const keys = useMemo(() => Object.keys(pa ?? {}), [pa]);
  const perClass = keys.length > 0;
  const { sessionCollection, assignmentCollection, refreshIdle } = collections;
  const id = assignment?.id ?? null;
  const sessionId = assignment ? (assignment.sessionId ?? assignment.id) : null;
  const periodSession = useMemo(
    () =>
      perClass && assignment && sessionId
        ? { ...assignment, id: sessionId }
        : null,
    [perClass, assignment, sessionId]
  );
  const periods = usePeriodAccess(
    periodSession,
    {
      sessionCollection,
      assignmentCollection,
      refreshIdle,
      ...(id ? { assignmentId: id } : {}),
    },
    rosters
  );
  const {
    pause,
    resume,
    end,
    reopen,
    turnInClass,
    turnInDelayMs,
    endTurnsIn,
    reopenClearsMarks,
    onWindowCleared,
    isEnded,
  } = lifecycle;
  const ended = useCallback(
    (a: AssignmentRun) =>
      isEnded ? isEnded(a) : runStatus(a.status) === 'inactive',
    [isEnded]
  );
  const teacherUid = assignment?.teacherUid;

  const refs = useMemo(() => {
    if (!id || !sessionId || !uid || uid !== teacherUid) return null;
    return {
      session: doc(db, sessionCollection, sessionId),
      assignment: doc(db, 'users', uid, assignmentCollection, id),
    };
  }, [id, sessionId, uid, teacherUid, sessionCollection, assignmentCollection]);

  const owned = useCallback(() => {
    if (!refs) throw new Error('Only the assigning teacher can change this.');
    return refs;
  }, [refs]);

  // Decisions read the stored doc, never this render's snapshot, so a second tab or a quick double click can't race.
  const fresh = useCallback(async () => {
    const snap = await getDoc(owned().assignment);
    return snap.data() as AssignmentRun | undefined;
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
    async (
      fields: Partial<Pick<AssignmentRun, 'closedAt' | 'doneAt' | 'openedAt'>>
    ) => {
      await updateDoc(owned().assignment, fields);
    },
    [owned]
  );

  // Turns a closed class's open attempts in once the write grace after its closedAt runs out.
  const scheduleTurnIn = useCallback(
    (key: string, closedAt: number) => {
      if (!sessionId || !turnInClass) return;
      const wait = Math.max(0, closedAt + (turnInDelayMs ?? 0) - Date.now());
      setTimeout(() => {
        turnInClass(sessionId, key, closedAt).catch((err: unknown) =>
          console.error(
            '[useAssignmentClassActions] Close turn-in failed:',
            err
          )
        );
      }, wait);
    },
    [sessionId, turnInClass, turnInDelayMs]
  );

  // D21: any class opening makes the assignment active.
  const ensureActive = useCallback(
    async (opened: string | null) => {
      if (!id) return;
      const a = await fresh();
      if (!a) return;
      if (ended(a)) {
        // An ended run's other classes were Closed (D20); stamp them, clock-closed ones too, so they stay closed.
        const now = Date.now();
        const stays: Array<[string, number]> = [];
        for (const [k, row] of Object.entries(a.periodAccess ?? {})) {
          if (k === opened) continue;
          if (row.state === 'closed' && row.closedAt != null) {
            stays.push([k, row.closedAt]);
          } else {
            await periods.closePeriod(k, now);
            stays.push([k, now]);
          }
        }
        await reopen(id);
        // A Done or closed mark left on a reopened run would drop it into Done at the next End (D5).
        if (!reopenClearsMarks && (a.closedAt != null || a.doneAt != null))
          await mark({ closedAt: null, doneAt: null });
        // The reopen voids End's pending turn-in, so each class that stays closed turns its own in.
        for (const [k, closedAt] of stays) scheduleTurnIn(k, closedAt);
      } else if (runStatus(a.status) === 'paused') {
        // A whole-run pause froze every open class; only the one opened comes back. Scheduled and clock-closed classes stay as they are.
        const now = Date.now();
        for (const [k, row] of Object.entries(a.periodAccess ?? {}))
          if (k !== opened && effectivePeriodState(row, now) === 'open')
            await periods.pausePeriod(k);
      } else return;
      if (resume) await resume(id);
    },
    [
      id,
      fresh,
      ended,
      periods,
      reopen,
      reopenClearsMarks,
      mark,
      resume,
      scheduleTurnIn,
    ]
  );

  const endIfLive = useCallback(async () => {
    if (!id) return;
    const a = await fresh();
    if (a && !ended(a)) await end(id);
  }, [id, fresh, ended, end]);

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
    if (id && onWindowCleared) await onWindowCleared(id, patch);
  }, [id, fresh, owned, onWindowCleared]);

  const open = useCallback(
    async (key: string | null, isReopen: boolean): Promise<string[]> => {
      if (!id) return [];
      owned();
      const k = classKey(key);
      if (k == null) {
        await clearSingleGate();
        await ensureActive(null);
        await mark({ openedAt: Date.now() });
        return [];
      }
      const untimed = isReopen
        ? await periods.reopenPeriod(k)
        : await periods.startPeriod(k);
      await ensureActive(k);
      return untimed;
    },
    [id, classKey, owned, clearSingleGate, ensureActive, mark, periods]
  );

  // Closes one class and reports, from the same transaction, whether it was the last one open (D21).
  const closeOne = useCallback(
    async (
      key: string
    ): Promise<{ last: boolean; closedAt: number } | null> => {
      const { session, assignment: assignmentRef } = owned();
      return runTransaction(db, async (tx) => {
        const a = (await tx.get(assignmentRef)).data() as
          AssignmentRun | undefined;
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
          last: othersClosed && !!a && !ended(a),
          closedAt: now,
        };
      });
    },
    [owned, ended]
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
        await end(id);
        if (endTurnsIn) return;
      }
      // Close means that class is finished: turn its open attempts in once their write grace runs out.
      scheduleTurnIn(k, closed.closedAt);
    },
    [
      id,
      owned,
      classKey,
      mark,
      endIfLive,
      closeOne,
      end,
      endTurnsIn,
      scheduleTurnIn,
    ]
  );

  // When End leaves work open, a bulk close turns in each closed class itself, as one-at-a-time Close does.
  const turnInClosed = useCallback(async () => {
    if (endTurnsIn || !turnInClass) return;
    const a = await fresh();
    for (const [k, row] of Object.entries(a?.periodAccess ?? {}))
      if (row.state === 'closed' && row.closedAt != null)
        scheduleTurnIn(k, row.closedAt);
  }, [endTurnsIn, turnInClass, fresh, scheduleTurnIn]);

  const closeAll = useCallback(async () => {
    if (!id) return;
    owned();
    if (perClass) await periods.closeAllPeriods();
    else await mark({ closedAt: Date.now() });
    await endIfLive();
    if (perClass) await turnInClosed();
  }, [id, owned, perClass, periods, mark, endIfLive, turnInClosed]);

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
    if (perClass) await turnInClosed();
  }, [id, owned, perClass, periods, fresh, mark, endIfLive, turnInClosed]);

  const pauseClass = useCallback(
    async (key: string | null) => {
      if (!id) return;
      owned();
      const k = classKey(key);
      if (k != null) {
        await periods.pausePeriod(k);
        return;
      }
      if (!pause) throw new Error('This assignment cannot be paused.');
      await pause(id);
    },
    [id, owned, classKey, periods, pause]
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

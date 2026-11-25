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
import type { ClassRoster, PassHold, PeriodAccessSessionFields } from '@/types';
import {
  closedRow,
  usePeriodAccess,
  type PeriodAccessPatch,
} from '@/hooks/usePeriodAccess';
import { isClassClosed, runStatus } from '@/utils/assignedStatus';
import { effectivePeriodState, pendingPasses } from '@/utils/periodAccess';

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
  /** D24 single-line close mark and D5 Move to Finished mark. */
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
  /** Set for a kind whose session only the server writes (Writing); every class-action write goes through it. */
  writer?: AssignmentWriter;
}

/** The server writes for a kind no client may write; each takes the assignment id. */
export interface AssignmentWriter {
  /** Per-class rows and Let in passes, as `usePeriodAccess` commits them. */
  commit: (assignmentId: string, patch: PeriodAccessPatch) => Promise<void>;
  /** The assignment's closedAt and doneAt marks; writer kinds keep no openedAt. */
  mark: (
    assignmentId: string,
    fields: Partial<Pick<AssignmentRun, 'closedAt' | 'doneAt'>>
  ) => Promise<void>;
  /** Clears a passed single-line window on the session and the assignment. */
  clearWindow: (
    assignmentId: string,
    patch: { openAt?: null; closeAt?: null }
  ) => Promise<void>;
  /** Closes one class and, when it was the last one open, ends the run in the same write. */
  closeClass: (
    assignmentId: string,
    key: string,
    closedAt: number
  ) => Promise<void>;
  /** Puts back a run's classes, status and marks as they were before a Close or Move to Finished. */
  restore: (prev: AssignmentRun, wasEnded: boolean) => Promise<void>;
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
  /** Runs after one class row opens or reopens, so per-student windows can follow it. */
  onClassOpened?: (assignmentId: string, key: string) => Promise<void>;
  /** The kind's `reopen` already clears the assignment's closedAt and doneAt marks. */
  reopenClearsMarks?: boolean;
  /** Reads the stored doc as ended; defaults to `runStatus(status) === 'inactive'`. */
  isEnded?: (doc: AssignmentRun) => boolean;
  /** Closing every class leaves the run live while Let in or Schedule passes have time left; a server sweep ends it. */
  keepLiveForPasses?: boolean;
  /** Told which passes kept the run live after a Close; the key is the class closed, null for every class. */
  onHeld?: (hold: PassHold, classKey: string | null) => void;
}

/** Per-class actions for the Assigned tab; a null key is the whole single-line assignment (D15). */
export interface AssignmentClassActions {
  /** Opens a Ready, Scheduled or Paused class. */
  openClass: (key: string | null) => Promise<void>;
  pauseClass: (key: string | null) => Promise<void>;
  closeClass: (key: string | null) => Promise<void>;
  /** D9: lets a closed class back in at once. */
  reopenClass: (key: string | null) => Promise<void>;
  /** D10 "Close for all classes". */
  closeAll: () => Promise<void>;
  /** D5/D10: closes every class and marks the row Done whatever its grading. */
  moveToDone: () => Promise<void>;
}

/** Class actions for every kind that keep its status in step (D21); a `writer` routes the writes through the server. */
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
  const { sessionCollection, assignmentCollection, refreshIdle, writer } =
    collections;
  const id = assignment?.id ?? null;
  const sessionId = assignment ? (assignment.sessionId ?? assignment.id) : null;
  const periodSession = useMemo(
    () =>
      perClass && assignment && sessionId
        ? { ...assignment, id: sessionId }
        : null,
    [perClass, assignment, sessionId]
  );
  const commit = useMemo(
    () =>
      writer && id
        ? (patch: PeriodAccessPatch) => writer.commit(id, patch)
        : undefined,
    [writer, id]
  );
  const periods = usePeriodAccess(
    periodSession,
    {
      sessionCollection,
      assignmentCollection,
      refreshIdle,
      ...(id ? { assignmentId: id } : {}),
      ...(commit ? { commit } : {}),
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
    onClassOpened,
    isEnded,
    keepLiveForPasses,
    onHeld,
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
      const ref = owned().assignment;
      if (!writer) {
        await updateDoc(ref, fields);
        return;
      }
      const marks: Partial<Pick<AssignmentRun, 'closedAt' | 'doneAt'>> = {};
      if ('closedAt' in fields) marks.closedAt = fields.closedAt;
      if ('doneAt' in fields) marks.doneAt = fields.doneAt;
      if (id && Object.keys(marks).length > 0) await writer.mark(id, marks);
    },
    [owned, writer, id]
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
        const stamp: string[] = [];
        for (const [k, row] of Object.entries(a.periodAccess ?? {})) {
          if (k === opened) continue;
          if (row.state === 'closed' && row.closedAt != null) {
            stays.push([k, row.closedAt]);
          } else {
            stamp.push(k);
            stays.push([k, now]);
          }
        }
        await periods.closePeriods(stamp, now);
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

  // Marks a fully closed run as waiting on passes on the session and assignment, for the sweep and the Assigned row.
  const writeHold = useCallback(
    async (hold: PassHold) => {
      if (writer) throw new Error('This assignment cannot wait on passes.');
      const { session, assignment: assignmentRef } = owned();
      const batch = writeBatch(db);
      batch.update(session, { passHold: hold });
      batch.update(assignmentRef, { passHold: hold });
      await batch.commit();
    },
    [owned, writer]
  );

  // Every class is closed: end the run, unless students still hold passes.
  const endOrHold = useCallback(async (): Promise<PassHold | null> => {
    if (keepLiveForPasses && id) {
      const a = await fresh();
      if (a && !ended(a)) {
        const snap = await getDoc(owned().session);
        const hold = pendingPasses(snap.data(), Date.now());
        if (hold) {
          await writeHold(hold);
          return hold;
        }
      }
    }
    await endIfLive();
    return null;
  }, [keepLiveForPasses, id, fresh, ended, owned, writeHold, endIfLive]);

  // A single line's own clock must not hold students out once the teacher opens it.
  const clearSingleGate = useCallback(async () => {
    const a = await fresh();
    const now = Date.now();
    const patch: Record<string, null> = {};
    if (a?.openAt != null && a.openAt > now) patch.openAt = null;
    if (a?.closeAt != null && a.closeAt <= now) patch.closeAt = null;
    if (Object.keys(patch).length === 0) return;
    const { session, assignment: assignmentRef } = owned();
    if (writer && id) await writer.clearWindow(id, patch);
    else {
      const batch = writeBatch(db);
      batch.update(session, patch);
      batch.update(assignmentRef, patch);
      await batch.commit();
    }
    if (id && onWindowCleared) await onWindowCleared(id, patch);
  }, [id, fresh, owned, writer, onWindowCleared]);

  const open = useCallback(
    async (key: string | null, isReopen: boolean): Promise<void> => {
      if (!id) return;
      owned();
      const k = classKey(key);
      if (k == null) {
        await clearSingleGate();
        await ensureActive(null);
        await mark({ openedAt: Date.now() });
        return;
      }
      if (isReopen) await periods.reopenPeriod(k);
      else await periods.startPeriod(k);
      await ensureActive(k);
      if (onClassOpened) await onClassOpened(id, k);
    },
    [
      id,
      classKey,
      owned,
      clearSingleGate,
      ensureActive,
      mark,
      periods,
      onClassOpened,
    ]
  );

  // Closes one class and reports, from the same transaction, whether it was the last one open (D21).
  const closeOne = useCallback(
    async (
      key: string
    ): Promise<{
      last: boolean;
      closedAt: number;
      held: PassHold | null;
    } | null> => {
      const { session, assignment: assignmentRef } = owned();
      if (writer && id) {
        // The server ends the run in the same write when this was the last class.
        const now = Date.now();
        await writer.closeClass(id, key, now);
        return { last: false, closedAt: now, held: null };
      }
      return runTransaction(db, async (tx) => {
        const a = (await tx.get(assignmentRef)).data() as
          AssignmentRun | undefined;
        const s = keepLiveForPasses
          ? ((await tx.get(session)).data() as
              PeriodAccessSessionFields | undefined)
          : undefined;
        const rows = a?.periodAccess ?? {};
        if (!rows[key]) return null;
        const now = Date.now();
        const othersClosed = Object.entries(rows).every(
          ([k, row]) => k === key || isClassClosed(row, now)
        );
        const last = othersClosed && !!a && !ended(a);
        const hold = last ? pendingPasses(s, now) : null;
        const [first, firstValue, ...rest] = [
          ...Object.entries(closedRow(now)).flatMap(([f, v]) => [
            new FieldPath('periodAccess', key, f),
            v,
          ]),
          ...(hold ? [new FieldPath('passHold'), hold] : []),
        ];
        for (const ref of [session, assignmentRef])
          tx.update(ref, first as FieldPath, firstValue, ...rest);
        return {
          last: last && !hold,
          closedAt: now,
          held: hold,
        };
      });
    },
    [owned, writer, id, ended, keepLiveForPasses]
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
      if (closed.held) onHeld?.(closed.held, k);
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
      onHeld,
    ]
  );

  // When End leaves work open, or the run stays live for passes, a bulk close turns in each closed class itself.
  const turnInClosed = useCallback(
    async (held = false) => {
      if ((endTurnsIn && !held) || !turnInClass) return;
      const a = await fresh();
      for (const [k, row] of Object.entries(a?.periodAccess ?? {}))
        if (row.state === 'closed' && row.closedAt != null)
          scheduleTurnIn(k, row.closedAt);
    },
    [endTurnsIn, turnInClass, fresh, scheduleTurnIn]
  );

  const closeAll = useCallback(async () => {
    if (!id) return;
    owned();
    if (perClass) await periods.closeAllPeriods();
    else await mark({ closedAt: Date.now() });
    let held: PassHold | null = null;
    if (perClass) held = await endOrHold();
    else await endIfLive();
    if (perClass) await turnInClosed(held != null);
    if (held) onHeld?.(held, null);
  }, [
    id,
    owned,
    perClass,
    periods,
    mark,
    endOrHold,
    endIfLive,
    turnInClosed,
    onHeld,
  ]);

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

/** Puts back what Close for all classes or Move to Finished changed, for any kind (D10 Undo). */
export async function restoreRun(
  prev: AssignmentRun,
  uid: string,
  collections: AssignmentClassCollections,
  lifecycle: AssignmentLifecycle
): Promise<void> {
  const wasEnded = lifecycle.isEnded
    ? lifecycle.isEnded(prev)
    : runStatus(prev.status) === 'inactive';
  if (collections.writer) {
    await collections.writer.restore(prev, wasEnded);
    return;
  }
  const assignmentRef = doc(
    db,
    'users',
    uid,
    collections.assignmentCollection,
    prev.id
  );
  if (!wasEnded) {
    await lifecycle.reopen(prev.id);
    if (runStatus(prev.status) === 'active' && lifecycle.resume)
      await lifecycle.resume(prev.id);
  }
  // Every class row goes back exactly as it was, times and marks included.
  const rows = Object.entries(prev.periodAccess ?? {});
  if (rows.length > 0) {
    const sessionRef = doc(
      db,
      collections.sessionCollection,
      prev.sessionId ?? prev.id
    );
    const batch = writeBatch(db);
    for (const ref of [sessionRef, assignmentRef])
      for (const [key, row] of rows)
        batch.update(ref, new FieldPath('periodAccess', key), row);
    await batch.commit();
  }
  await updateDoc(assignmentRef, {
    doneAt: prev.doneAt ?? null,
    closedAt: prev.closedAt ?? null,
  });
}

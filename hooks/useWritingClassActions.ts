import { useCallback, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type {
  ClassRoster,
  PeriodAccess,
  WritingAssignmentRecord,
} from '@/types';
import type { AssignmentClassActions } from '@/hooks/useAssignmentClassActions';
import {
  closedRow,
  usePeriodAccess,
  type PeriodAccessPatch,
} from '@/hooks/usePeriodAccess';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import {
  updateWritingSession,
  WRITING_RECORDS_COLLECTION,
  type UpdateWritingSessionInput,
} from '@/hooks/useWritingAssignmentSessions';
import { hasStudentPointers } from '@/utils/studentTargetRef';

/** Rows of every class not already closed by hand, closed now; earlier closedAt marks stand. */
function closeRows(
  rows: Record<string, PeriodAccess> | undefined,
  now: number
): Record<string, Partial<PeriodAccess>> {
  const out: Record<string, Partial<PeriodAccess>> = {};
  for (const [k, row] of Object.entries(rows ?? {}))
    if (row.state !== 'closed' || row.closedAt == null) out[k] = closedRow(now);
  return out;
}

/** Puts back a Writing record's classes and marks exactly as they were (D10 Undo). */
export async function undoWritingClose(
  prev: WritingAssignmentRecord
): Promise<void> {
  const rows: Record<string, Partial<PeriodAccess>> = {};
  for (const [k, row] of Object.entries(prev.periodAccess ?? {}))
    rows[k] = {
      state: row.state,
      openAt: row.openAt ?? null,
      closeAt: row.closeAt ?? null,
      ...(row.pausedAt != null ? { pausedAt: row.pausedAt } : {}),
      closedAt: row.closedAt ?? null,
    };
  await updateWritingSession({
    sessionId: prev.id,
    ...(Object.keys(rows).length > 0 ? { periodAccess: rows } : {}),
    ...(prev.status !== 'ended' ? { reopen: true } : {}),
    marks: { closedAt: prev.closedAt ?? null, doneAt: prev.doneAt ?? null },
  });
}

/** Assigned tab class actions for Writing, whose session only the server writes (ASSIGNED_TAB.md D6, D21). */
export function useWritingClassActions(
  record: WritingAssignmentRecord | null,
  rosters: readonly Pick<ClassRoster, 'id' | 'bellPeriod'>[] | undefined
): AssignmentClassActions {
  const { user } = useAuth();
  const { setAssignmentTargets } = useSetAssignmentTargets();
  const uid = user?.uid ?? null;
  const sid = record?.id ?? null;
  const pa = record?.periodAccess;
  const keys = useMemo(() => Object.keys(pa ?? {}), [pa]);
  const perClass = keys.length > 0;
  const owner = !!record && !!uid && uid === record.teacherUid;

  const commit = useCallback(
    async (patch: PeriodAccessPatch) => {
      if (!sid) return;
      await updateWritingSession({ sessionId: sid, ...patch });
    },
    [sid]
  );
  const periods = usePeriodAccess(
    perClass && record ? record : null,
    {
      sessionCollection: 'writing_assignment_sessions',
      assignmentCollection: WRITING_RECORDS_COLLECTION,
      refreshIdle: false,
      commit,
    },
    rosters
  );

  const owned = useCallback((): string => {
    if (!owner || !sid || !uid)
      throw new Error('Only the assigning teacher can change this.');
    return sid;
  }, [owner, sid, uid]);

  const send = useCallback(
    async (patch: Omit<UpdateWritingSessionInput, 'sessionId'>) => {
      await updateWritingSession({ sessionId: owned(), ...patch });
    },
    [owned]
  );

  // Decisions read the stored record, never this render's snapshot.
  const fresh = useCallback(async () => {
    const id = owned();
    const snap = await getDoc(
      doc(db, 'users', uid ?? '', WRITING_RECORDS_COLLECTION, id)
    );
    return snap.data() as WritingAssignmentRecord | undefined;
  }, [owned, uid]);

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

  // D21: opening a class of an ended run brings it back; its other classes stay Closed (D20).
  const ensureActive = useCallback(
    async (opened: string) => {
      const a = await fresh();
      if (!a || a.status !== 'ended') return;
      const others = closeRows(a.periodAccess, Date.now());
      delete others[opened];
      await send({ periodAccess: others, reopen: true });
    },
    [fresh, send]
  );

  const open = useCallback(
    async (key: string | null, isReopen: boolean): Promise<string[]> => {
      owned();
      const k = classKey(key);
      if (k == null) {
        // A single line's own clock must not hold students out once the teacher opens it.
        const a = await fresh();
        if (!a) return [];
        const now = Date.now();
        const window: { openAt?: null; closeAt?: null } = {};
        if (a.openAt != null && a.openAt > now) window.openAt = null;
        if (a.closeAt != null && a.closeAt <= now) window.closeAt = null;
        const cleared = Object.keys(window).length > 0;
        if (!cleared && a.status !== 'ended') return [];
        await send({
          ...(cleared ? { window } : {}),
          ...(a.status === 'ended' ? { reopen: true } : {}),
        });
        if (cleared && hasStudentPointers(a)) {
          // A failed pointer sync must not stop Open from letting the class in.
          try {
            await setAssignmentTargets({
              assignmentId: a.id,
              kind: 'writing',
              sessionId: a.id,
              targetMode: a.targetMode,
              add: [],
              remove: [],
              overridesBySourcedId: {},
              window,
            });
          } catch (err) {
            console.error('Pointer window sync failed', err);
          }
        }
        return [];
      }
      const untimed = isReopen
        ? await periods.reopenPeriod(k)
        : await periods.startPeriod(k);
      await ensureActive(k);
      return untimed;
    },
    [owned, classKey, fresh, send, setAssignmentTargets, periods, ensureActive]
  );

  const closeClass = useCallback(
    async (key: string | null) => {
      owned();
      const k = classKey(key);
      const now = Date.now();
      if (k == null) {
        await send({ marks: { closedAt: now }, end: true });
        return;
      }
      // The server ends the session in the same write when this was the last class.
      await send({
        periodAccess: { [k]: closedRow(now) },
        endIfAllClosed: true,
      });
    },
    [owned, classKey, send]
  );

  const closeAll = useCallback(async () => {
    owned();
    const now = Date.now();
    if (!perClass) {
      await send({ marks: { closedAt: now }, end: true });
      return;
    }
    const a = await fresh();
    await send({ periodAccess: closeRows(a?.periodAccess, now), end: true });
  }, [owned, perClass, fresh, send]);

  const moveToDone = useCallback(async () => {
    owned();
    const now = Date.now();
    const a = await fresh();
    await send({
      ...(perClass ? { periodAccess: closeRows(a?.periodAccess, now) } : {}),
      marks: {
        doneAt: now,
        ...(perClass || a?.closedAt != null ? {} : { closedAt: now }),
      },
      end: true,
    });
  }, [owned, perClass, fresh, send]);

  const pauseClass = useCallback(
    async (key: string | null) => {
      owned();
      const k = classKey(key);
      if (k == null) throw new Error('This assignment cannot be paused.');
      await periods.pausePeriod(k);
    },
    [owned, classKey, periods]
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

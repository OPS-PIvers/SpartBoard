import { useCallback, useMemo } from 'react';
import {
  collection,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type {
  ClassRoster,
  FeaturePermission,
  PeriodAccess,
  PeriodAccessSessionFields,
} from '@/types';
import {
  readBuildingScheduleDefaults,
  resolveBellWindow,
} from '@/utils/bellSchedule';
import { BELL_CLOSE_CUSHION_MS } from '@/utils/periodPlan';
import { dueLockAt } from '@/utils/periodAccess';

/** Stale in-progress responses get a fresh `lastWriteAt` on start, inside the idle finalizer's 90-minute window. */
const IDLE_REFRESH_CUTOFF_MS = 80 * 60 * 1000;
export const EXTEND_MS = 10 * 60 * 1000;
export const LET_IN_FALLBACK_MS = 30 * 60 * 1000;

export interface PeriodAccessCollections {
  /** e.g. `quiz_sessions`; responses live at `{sessionCollection}/{id}/responses`. */
  sessionCollection: string;
  /** e.g. `quiz_assignments` under `users/{teacherUid}`, mirrored for the hub. */
  assignmentCollection: string;
  /** False for kinds with no idle finalizer, whose responses carry no `lastWriteAt`. */
  refreshIdle?: boolean;
  /** The hub mirror's doc id, for kinds whose assignment id is not the session id. */
  assignmentId?: string;
  /** Kinds whose session no client writes (Writing) send the period and Let in patches through this instead. */
  commit?: (patch: PeriodAccessPatch) => Promise<void>;
}

/** Per-period field patches and Let in passes, for a kind that saves them through a callable. */
export interface PeriodAccessPatch {
  periodAccess?: Record<string, Partial<PeriodAccess>>;
  studentAccess?: Record<string, number>;
}

type PeriodSession = PeriodAccessSessionFields & {
  id: string;
  teacherUid: string;
  dueAt?: number | null;
};

/** Where a period's close is held: only a Manual due (`dueLocks`); a Scheduled close never caps Start or Extend. */
const lockAt = (session: PeriodSession | null): number | null =>
  session ? dueLockAt(session) : null;

/** A close held to the Manual due while it is ahead. */
export function capAtDue(
  closeAt: number | null,
  dueAt: number | null,
  nowMs: number
): number | null {
  if (dueAt == null || dueAt <= nowMs) return closeAt;
  return closeAt == null ? dueAt : Math.min(closeAt, dueAt);
}

type BellRoster = Pick<ClassRoster, 'id' | 'bellPeriod'>;

/** Today's bell window for the period's roster, end cushion included; null without a tagged bell. */
export function todaysBell(
  access: Pick<PeriodAccess, 'rosterId'>,
  rosters: readonly BellRoster[],
  permissions: readonly FeaturePermission[] | undefined,
  nowMs: number
): { openAt: number; closeAt: number } | null {
  const roster = rosters.find((r) => r.id === access.rosterId);
  if (!roster?.bellPeriod) return null;
  const window = resolveBellWindow(
    readBuildingScheduleDefaults(permissions, roster.bellPeriod.buildingId),
    roster.bellPeriod,
    new Date(nowMs)
  );
  return window
    ? { ...window, closeAt: window.closeAt + BELL_CLOSE_CUSHION_MS }
    : null;
}

/** When a Let in now pass runs out: the end of whichever targeted period is in session now, else 30 minutes. */
export function letInUntil(
  periodAccess: Record<string, PeriodAccess>,
  rosters: readonly BellRoster[],
  permissions: readonly FeaturePermission[] | undefined,
  nowMs: number
): number {
  for (const access of Object.values(periodAccess)) {
    const window = todaysBell(access, rosters, permissions, nowMs);
    if (window && window.openAt <= nowMs && nowMs < window.closeAt)
      return window.closeAt;
  }
  return nowMs + LET_IN_FALLBACK_MS;
}

/** The close time a Start writes: Manual stays open until paused or its due, a scheduled window keeps its end. */
export function startCloseAt(
  session: PeriodAccessSessionFields & {
    dueLocks?: boolean;
    dueAt?: number | null;
  },
  access: PeriodAccess,
  nowMs: number
): number | null {
  const due = dueLockAt(session);
  if (session.accessMode === 'assessment')
    return due != null && due > nowMs ? due : null;
  return capAtDue(
    access.closeAt != null && access.closeAt > nowMs ? access.closeAt : null,
    due,
    nowMs
  );
}

/** D24's Close patch: closedAt marks it apart from Ready, pausedAt keeps a just-flushed draft. */
export const closedRow = (now: number): Partial<PeriodAccess> => ({
  state: 'closed',
  closedAt: now,
  pausedAt: now,
});

/** Teacher writes for the per-period chips and Let in now, generic over the session collection. */
export function usePeriodAccess(
  session: PeriodSession | null,
  {
    sessionCollection,
    assignmentCollection,
    refreshIdle = true,
    assignmentId,
    commit,
  }: PeriodAccessCollections,
  rosters: readonly BellRoster[] | undefined
) {
  const { user, featurePermissions } = useAuth();
  const sessionId = session?.id ?? null;
  const periodAccess = session?.periodAccess;
  const uid = user?.uid ?? null;
  const ownerUid = uid && uid === session?.teacherUid ? uid : null;

  const refs = useMemo(() => {
    if (!sessionId) return null;
    return {
      session: doc(db, sessionCollection, sessionId),
      assignment: ownerUid
        ? doc(
            db,
            'users',
            ownerUid,
            assignmentCollection,
            assignmentId ?? sessionId
          )
        : null,
    };
  }, [
    sessionId,
    sessionCollection,
    assignmentCollection,
    ownerUid,
    assignmentId,
  ]);

  const stage = useCallback(
    (batch: WriteBatch, key: string, patch: Partial<PeriodAccess>) => {
      if (!refs) return;
      const pairs = Object.entries(patch).flatMap(([field, value]) => [
        new FieldPath('periodAccess', key, field),
        value,
      ]);
      const [first, firstValue, ...rest] = pairs;
      for (const ref of [refs.session, refs.assignment]) {
        if (ref) batch.update(ref, first as FieldPath, firstValue, ...rest);
      }
    },
    [refs]
  );

  const write = useCallback(
    async (rows: Record<string, Partial<PeriodAccess>>) => {
      if (Object.keys(rows).length === 0) return;
      if (commit) {
        await commit({ periodAccess: rows });
        return;
      }
      const batch = writeBatch(db);
      for (const [key, patch] of Object.entries(rows)) stage(batch, key, patch);
      await batch.commit();
    },
    [commit, stage]
  );

  // Mirrors resumeAssignment: a period that sat frozen must not finalize the moment it opens.
  const refreshStaleResponses = useCallback(
    async (keys: readonly string[]) => {
      if (!sessionId || !refreshIdle) return;
      const snap = await getDocs(
        query(
          collection(db, sessionCollection, sessionId, 'responses'),
          where('status', 'in', ['joined', 'in-progress']),
          where(
            'lastWriteAt',
            '<',
            Timestamp.fromMillis(Date.now() - IDLE_REFRESH_CUTOFF_MS)
          )
        )
      );
      const stale = snap.docs.filter((d) => {
        const classId: unknown = d.get('classId');
        return typeof classId === 'string' && keys.includes(classId);
      });
      for (let i = 0; i < stale.length; i += 450) {
        const batch = writeBatch(db);
        for (const d of stale.slice(i, i + 450))
          batch.update(d.ref, { lastWriteAt: serverTimestamp() });
        await batch.commit();
      }
    },
    [sessionId, sessionCollection, refreshIdle]
  );

  const start = useCallback(
    async (keys: readonly string[], reopen = false): Promise<void> => {
      if (!session || !periodAccess || keys.length === 0) return;
      await refreshStaleResponses(keys);
      const now = Date.now();
      const rows: Record<string, Partial<PeriodAccess>> = {};
      for (const key of keys) {
        const access = periodAccess[key];
        if (!access) continue;
        rows[key] = {
          state: 'open',
          openAt: null,
          closeAt: startCloseAt(session, access, now),
          ...(reopen || access.closedAt != null ? { closedAt: null } : {}),
          openedAt: now,
        };
      }
      await write(rows);
    },
    [session, periodAccess, refreshStaleResponses, write]
  );

  const pause = useCallback(
    async (keys: readonly string[]) => {
      if (!periodAccess || keys.length === 0) return;
      const now = Date.now();
      const rows: Record<string, Partial<PeriodAccess>> = {};
      for (const key of keys)
        if (periodAccess[key]) rows[key] = { state: 'paused', pausedAt: now };
      await write(rows);
    },
    [periodAccess, write]
  );

  const close = useCallback(
    async (keys: readonly string[], now = Date.now()) => {
      if (!periodAccess || keys.length === 0) return;
      const rows: Record<string, Partial<PeriodAccess>> = {};
      for (const key of keys) if (periodAccess[key]) rows[key] = closedRow(now);
      await write(rows);
    },
    [periodAccess, write]
  );

  const extend = useCallback(
    async (key: string, by: number | null) => {
      const access = periodAccess?.[key];
      if (!access) return;
      await write({
        [key]: {
          closeAt: capAtDue(
            by == null
              ? null
              : Math.max(access.closeAt ?? Date.now(), Date.now()) + by,
            lockAt(session),
            Date.now()
          ),
        },
      });
    },
    [periodAccess, write, session]
  );

  const letIn = useCallback(
    async (uid: string) => {
      if (!refs || !periodAccess) return;
      const until = letInUntil(
        periodAccess,
        rosters ?? [],
        featurePermissions,
        Date.now()
      );
      if (commit) await commit({ studentAccess: { [uid]: until } });
      else
        await updateDoc(
          refs.session,
          new FieldPath('studentAccess', uid),
          until,
          // A Let in now replaces any time set for later.
          new FieldPath('studentAccessFrom', uid),
          deleteField()
        );
    },
    [refs, periodAccess, rosters, featurePermissions, commit]
  );

  /** "Set a time": one student's pass from `from` to `until`; null removes it. */
  const setStudentTime = useCallback(
    async (uid: string, time: { from: number; until: number } | null) => {
      if (!refs || !periodAccess || commit) return;
      await updateDoc(
        refs.session,
        new FieldPath('studentAccess', uid),
        time ? time.until : deleteField(),
        new FieldPath('studentAccessFrom', uid),
        time ? time.from : deleteField()
      );
    },
    [refs, periodAccess, commit]
  );

  const keys = useMemo(() => Object.keys(periodAccess ?? {}), [periodAccess]);
  return {
    startPeriod: (key: string) => start([key]),
    pausePeriod: (key: string) => pause([key]),
    extendPeriod: extend,
    startAll: () => start(keys),
    pauseAll: () => pause(keys),
    /** `at` stamps a known closedAt, for a caller that schedules work against it. */
    closePeriod: (key: string, at?: number) => close([key], at),
    /** D9: lets the class back in at once, exactly like Start, and clears closedAt. */
    reopenPeriod: (key: string) => start([key], true),
    /** Closes every class not already closed by hand, so earlier closedAt marks stand. */
    closeAllPeriods: () =>
      close(
        keys.filter(
          (k) =>
            periodAccess?.[k]?.state !== 'closed' ||
            periodAccess[k].closedAt == null
        )
      ),
    letIn,
    setStudentTime,
  };
}

export type PeriodAccessActions = ReturnType<typeof usePeriodAccess>;

import { useCallback, useMemo } from 'react';
import {
  collection,
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

/** Stale in-progress responses get a fresh `lastWriteAt` on start, inside the idle finalizer's 90-minute window. */
const IDLE_REFRESH_CUTOFF_MS = 80 * 60 * 1000;
export const EXTEND_MS = 10 * 60 * 1000;
export const LET_IN_FALLBACK_MS = 30 * 60 * 1000;

export interface PeriodAccessCollections {
  /** e.g. `quiz_sessions`; responses live at `{sessionCollection}/{id}/responses`. */
  sessionCollection: string;
  /** e.g. `quiz_assignments` under `users/{teacherUid}`, mirrored for the hub. */
  assignmentCollection: string;
}

type PeriodSession = PeriodAccessSessionFields & {
  id: string;
  teacherUid: string;
};

type BellRoster = Pick<ClassRoster, 'id' | 'bellPeriod'>;

function todaysBell(
  access: Pick<PeriodAccess, 'rosterId'>,
  rosters: readonly BellRoster[],
  permissions: readonly FeaturePermission[] | undefined,
  nowMs: number
): { openAt: number; closeAt: number } | null {
  const roster = rosters.find((r) => r.id === access.rosterId);
  if (!roster?.bellPeriod) return null;
  return resolveBellWindow(
    readBuildingScheduleDefaults(permissions, roster.bellPeriod.buildingId),
    roster.bellPeriod,
    new Date(nowMs)
  );
}

/** Today's end bell for the period's roster, when it is still ahead. */
export function bellCloseFor(
  access: Pick<PeriodAccess, 'rosterId'>,
  rosters: readonly BellRoster[],
  permissions: readonly FeaturePermission[] | undefined,
  nowMs: number
): number | null {
  const window = todaysBell(access, rosters, permissions, nowMs);
  return window && window.closeAt > nowMs ? window.closeAt : null;
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

/** The close time a Start writes: the end bell in assessment mode, a still-future window end otherwise. */
export function startCloseAt(
  session: PeriodAccessSessionFields,
  access: PeriodAccess,
  bellClose: number | null,
  nowMs: number
): number | null {
  if (session.accessMode === 'assessment') return bellClose;
  return access.closeAt != null && access.closeAt > nowMs
    ? access.closeAt
    : null;
}

/** Teacher writes for the per-period chips and Let in now, generic over the session collection. */
export function usePeriodAccess(
  session: PeriodSession | null,
  { sessionCollection, assignmentCollection }: PeriodAccessCollections,
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
        ? doc(db, 'users', ownerUid, assignmentCollection, sessionId)
        : null,
    };
  }, [sessionId, sessionCollection, assignmentCollection, ownerUid]);

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

  // Mirrors resumeAssignment: a period that sat frozen must not finalize the moment it opens.
  const refreshStaleResponses = useCallback(
    async (keys: readonly string[]) => {
      if (!sessionId) return;
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
    [sessionId, sessionCollection]
  );

  /** Resolves to the assessment periods that opened with no end bell to close them. */
  const start = useCallback(
    async (keys: readonly string[]): Promise<string[]> => {
      if (!session || !periodAccess || keys.length === 0) return [];
      await refreshStaleResponses(keys);
      const now = Date.now();
      const untimed: string[] = [];
      const batch = writeBatch(db);
      for (const key of keys) {
        const access = periodAccess[key];
        if (!access) continue;
        const bell = bellCloseFor(
          access,
          rosters ?? [],
          featurePermissions,
          now
        );
        if (session.accessMode === 'assessment' && bell == null)
          untimed.push(key);
        stage(batch, key, {
          state: 'open',
          openAt: null,
          closeAt: startCloseAt(session, access, bell, now),
        });
      }
      await batch.commit();
      return untimed;
    },
    [
      session,
      periodAccess,
      refreshStaleResponses,
      rosters,
      featurePermissions,
      stage,
    ]
  );

  const pause = useCallback(
    async (keys: readonly string[]) => {
      if (!periodAccess || keys.length === 0) return;
      const now = Date.now();
      const batch = writeBatch(db);
      for (const key of keys)
        if (periodAccess[key])
          stage(batch, key, { state: 'paused', pausedAt: now });
      await batch.commit();
    },
    [periodAccess, stage]
  );

  const extend = useCallback(
    async (key: string, by: number | null) => {
      const access = periodAccess?.[key];
      if (!access) return;
      const batch = writeBatch(db);
      stage(batch, key, {
        closeAt:
          by == null
            ? null
            : Math.max(access.closeAt ?? Date.now(), Date.now()) + by,
      });
      await batch.commit();
    },
    [periodAccess, stage]
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
      await updateDoc(refs.session, new FieldPath('studentAccess', uid), until);
    },
    [refs, periodAccess, rosters, featurePermissions]
  );

  const keys = useMemo(() => Object.keys(periodAccess ?? {}), [periodAccess]);
  return {
    startPeriod: (key: string) => start([key]),
    pausePeriod: (key: string) => pause([key]),
    extendPeriod: extend,
    startAll: () => start(keys),
    pauseAll: () => pause(keys),
    letIn,
  };
}

export type PeriodAccessActions = ReturnType<typeof usePeriodAccess>;

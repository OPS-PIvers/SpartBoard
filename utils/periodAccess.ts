import type {
  PassHold,
  PeriodAccess,
  PeriodAccessSessionFields,
} from '@/types';

/** Chip/student view of one period: the stored state resolved against the clock. */
export type EffectivePeriodState =
  'open' | 'paused' | 'closed' | 'scheduled' | 'ended';

export function effectivePeriodState(
  access: Pick<PeriodAccess, 'state' | 'openAt' | 'closeAt'>,
  nowMs: number
): EffectivePeriodState {
  if (access.state === 'paused') return 'paused';
  if (access.state === 'closed') return 'closed';
  if (access.openAt != null && nowMs < access.openAt) return 'scheduled';
  if (access.closeAt != null && nowMs >= access.closeAt) return 'ended';
  return 'open';
}

export function hasPeriodAccess(
  session: PeriodAccessSessionFields | null | undefined
): session is PeriodAccessSessionFields & {
  periodAccess: Record<string, PeriodAccess>;
} {
  return !!session?.periodAccess && typeof session.periodAccess === 'object';
}

export function isLetIn(
  session: PeriodAccessSessionFields | null | undefined,
  uid: string | null | undefined,
  nowMs: number
): boolean {
  if (!uid) return false;
  const until = session?.studentAccess?.[uid];
  if (typeof until !== 'number' || until <= nowMs) return false;
  const from = session?.studentAccessFrom?.[uid];
  return typeof from !== 'number' || from <= nowMs;
}

/** When this student's running Let in or Schedule pass ends, or null with none running. */
export function runningPassUntil(
  session: PeriodAccessSessionFields | null | undefined,
  uid: string | null | undefined,
  nowMs: number
): number | null {
  return uid && isLetIn(session, uid, nowMs)
    ? (session?.studentAccess?.[uid] ?? null)
    : null;
}

/** A close the running pass outlasts moves to the pass end; no close stays no close. */
export function closeWithPass(
  closeAt: number | null | undefined,
  passUntil: number | null
): number | null | undefined {
  if (passUntil == null || closeAt == null) return closeAt;
  return Math.max(closeAt, passUntil);
}

/** The quiz as one student sees it while their pass runs: open now, past any whole-quiz pause, open time or close. */
export function withStudentPass<
  T extends PeriodAccessSessionFields & {
    status?: string;
    openAt?: number | null;
    closeAt?: number | null;
  },
>(session: T, passUntil: number | null): T {
  if (passUntil == null || session.status === 'ended') return session;
  return {
    ...session,
    status:
      session.status === 'paused' || session.status === 'waiting'
        ? 'active'
        : session.status,
    openAt: null,
    closeAt: closeWithPass(session.closeAt, passUntil),
  };
}

/** Let in and Schedule passes that still have time left, or null when none do. */
export function pendingPasses(
  session: PeriodAccessSessionFields | null | undefined,
  nowMs: number
): PassHold | null {
  const students: PassHold['students'] = {};
  let until = 0;
  for (const [uid, v] of Object.entries(session?.studentAccess ?? {})) {
    if (typeof v !== 'number' || v <= nowMs) continue;
    const from = session?.studentAccessFrom?.[uid];
    students[uid] = {
      from: typeof from === 'number' && from > nowMs ? from : null,
      until: v,
    };
    until = Math.max(until, v);
  }
  return until > 0 ? { until, students } : null;
}

/** A time the teacher set for one student ("Set a time"), or null for none or a plain Let in. */
export function studentSetTime(
  session: PeriodAccessSessionFields | null | undefined,
  uid: string | null | undefined
): { from: number; until: number } | null {
  if (!uid) return null;
  const from = session?.studentAccessFrom?.[uid];
  const until = session?.studentAccess?.[uid];
  return typeof from === 'number' && typeof until === 'number' && until > from
    ? { from, until }
    : null;
}

/** The session's period keys this student belongs to (claim classes, or the picked period's label). */
export function studentPeriodKeys(
  session: PeriodAccessSessionFields,
  claimClassIds: readonly string[],
  classPeriod?: string | null
): string[] {
  const pa = session.periodAccess ?? {};
  const keys = Object.keys(pa);
  const byClaim = keys.filter((k) => claimClassIds.includes(k));
  if (byClaim.length > 0) return byClaim;
  if (classPeriod) return keys.filter((k) => pa[k].label === classPeriod);
  return [];
}

/** Mirrors the `periodOpen || studentLetIn` rule, without the rules' clock-skew grace. */
export function studentCanEnter(
  session: PeriodAccessSessionFields | null | undefined,
  periodKeys: readonly string[],
  uid: string | null | undefined,
  nowMs: number
): boolean {
  if (!hasPeriodAccess(session)) return true;
  if (isLetIn(session, uid, nowMs)) return true;
  return periodKeys.some((k) => {
    const access = session.periodAccess[k];
    return !!access && effectivePeriodState(access, nowMs) === 'open';
  });
}

/** Whether a student can work now on any quiz: per-class gates, else the whole-quiz pause and window, with their pass. */
export function studentCanEnterQuiz(
  session: PeriodAccessSessionFields & {
    status?: string;
    openAt?: number | null;
    closeAt?: number | null;
  },
  periodKeys: readonly string[],
  uid: string | null | undefined,
  nowMs: number
): boolean {
  if (hasPeriodAccess(session))
    return studentCanEnter(session, periodKeys, uid, nowMs);
  if (isLetIn(session, uid, nowMs)) return true;
  if (session.status === 'paused' || session.status === 'waiting') return false;
  if (session.openAt != null && nowMs < session.openAt) return false;
  return session.closeAt == null || nowMs < session.closeAt;
}

/** Of the student's periods, the one to write as `classId`: an open one first. */
export function pickPeriodKey(
  session: PeriodAccessSessionFields,
  periodKeys: readonly string[],
  nowMs: number
): string | null {
  const pa = session.periodAccess ?? {};
  const open = periodKeys.find(
    (k) => pa[k] && effectivePeriodState(pa[k], nowMs) === 'open'
  );
  return open ?? periodKeys[0] ?? null;
}

/** Earliest scheduled open among the student's periods, for "Opens Tue 10:40". */
export function nextScheduledOpen(
  session: PeriodAccessSessionFields,
  periodKeys: readonly string[],
  nowMs: number,
  /** Also counts a time the teacher set for this student. */
  uid?: string | null
): number | null {
  const pa = session.periodAccess ?? {};
  const own = studentSetTime(session, uid);
  let next: number | null =
    own && own.from > nowMs && own.until > own.from ? own.from : null;
  for (const k of periodKeys) {
    const access = pa[k];
    if (!access || effectivePeriodState(access, nowMs) !== 'scheduled')
      continue;
    if (access.openAt != null && (next == null || access.openAt < next)) {
      next = access.openAt;
    }
  }
  return next;
}

/** "2 of 4 periods live" for the assignments hub. */
export function summarizePeriods(
  session: PeriodAccessSessionFields | null | undefined,
  nowMs: number
): { live: number; total: number } | null {
  if (!hasPeriodAccess(session)) return null;
  const all = Object.values(session.periodAccess);
  return {
    live: all.filter((a) => effectivePeriodState(a, nowMs) === 'open').length,
    total: all.length,
  };
}

/** The Manual due date every period locks at, when the session has one. */
export function dueLockAt(session: {
  dueLocks?: boolean;
  dueAt?: number | null;
}): number | null {
  return session.dueLocks === true && typeof session.dueAt === 'number'
    ? session.dueAt
    : null;
}

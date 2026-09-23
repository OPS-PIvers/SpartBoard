import type { PeriodAccess, PeriodAccessSessionFields } from '@/types';

/** Chip/student view of one period: the stored state resolved against the clock. */
export type EffectivePeriodState =
  | 'open'
  | 'paused'
  | 'closed'
  | 'scheduled'
  | 'ended';

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
  return typeof until === 'number' && until > nowMs;
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
  nowMs: number
): number | null {
  const pa = session.periodAccess ?? {};
  let next: number | null = null;
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

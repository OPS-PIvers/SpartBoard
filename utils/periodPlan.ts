import type { AccessMode, ClassRoster, PeriodAccess } from '@/types';

/** Where one period's window comes from in assignment mode. */
export type PeriodWindowSource = 'same' | 'bell' | 'custom';

export interface PeriodPlanRow {
  source: PeriodWindowSource;
  openAt?: number;
  closeAt?: number;
}

/** The assign modal's per-period choice; rows are keyed by roster id and default to the shared window. */
export interface PeriodPlan {
  mode: AccessMode;
  rows?: Record<string, PeriodPlanRow>;
}

export type PeriodRoster = Pick<
  ClassRoster,
  'id' | 'name' | 'classlinkClassId' | 'testClassId' | 'bellPeriod'
>;

export interface EpochWindow {
  openAt: number;
  closeAt: number;
}

/** The `periodAccess` key a roster's students match on: their class claim, else the roster itself. */
export function periodKeyForRoster(roster: PeriodRoster): string {
  if (roster.classlinkClassId) return roster.classlinkClassId;
  if (roster.testClassId) return roster.testClassId;
  return `roster:${roster.id}`;
}

/** SSO or the ClassLink PIN bridge gives this roster's students a class claim. */
export function rosterIsVerified(roster: PeriodRoster): boolean {
  return !!roster.classlinkClassId || !!roster.testClassId;
}

/** One `PeriodAccess` per targeted roster, first roster winning a shared key. */
export function buildPeriodAccess({
  plan,
  rosters,
  sharedWindow,
  bellWindow,
}: {
  plan: PeriodPlan;
  rosters: readonly PeriodRoster[];
  sharedWindow: { openAt?: number | null; closeAt?: number | null };
  bellWindow: (roster: PeriodRoster) => EpochWindow | null;
}): Record<string, PeriodAccess> {
  const out: Record<string, PeriodAccess> = {};
  for (const roster of rosters) {
    const key = periodKeyForRoster(roster);
    if (key in out) continue;
    const base = {
      bellPeriodId: roster.bellPeriod?.periodId ?? null,
      verified: rosterIsVerified(roster),
      label: roster.name,
      rosterId: roster.id,
    };
    if (plan.mode === 'assessment') {
      out[key] = { ...base, state: 'closed', openAt: null, closeAt: null };
      continue;
    }
    const window = resolveRowWindow(plan.rows?.[roster.id], sharedWindow, () =>
      bellWindow(roster)
    );
    out[key] = { ...base, state: 'open', ...window };
  }
  return out;
}

/** A row's window; a bell row with no bell that day falls back to the shared window. */
export function resolveRowWindow(
  row: PeriodPlanRow | undefined,
  sharedWindow: { openAt?: number | null; closeAt?: number | null },
  bell: () => EpochWindow | null
): { openAt: number | null; closeAt: number | null } {
  const shared = {
    openAt: sharedWindow.openAt ?? null,
    closeAt: sharedWindow.closeAt ?? null,
  };
  if (!row || row.source === 'same') return shared;
  if (row.source === 'bell') return bell() ?? shared;
  return { openAt: row.openAt ?? null, closeAt: row.closeAt ?? null };
}

/** A multi-period assign's gate, or undefined when it stays a legacy session (flag off, one period). */
export function buildPeriodGate({
  plan,
  rosters,
  sharedWindow,
  bellWindow,
}: {
  plan: PeriodPlan | undefined;
  rosters: readonly PeriodRoster[];
  sharedWindow: { openAt?: number | null; closeAt?: number | null };
  bellWindow:
    | ((roster: PeriodRoster, date: Date) => EpochWindow | null)
    | undefined;
}):
  | { accessMode: AccessMode; periodAccess: Record<string, PeriodAccess> }
  | undefined {
  if (!bellWindow || rosters.length < 2) return undefined;
  const resolved = plan ?? { mode: 'assignment' };
  const periodAccess = buildPeriodAccess({
    plan: resolved,
    rosters,
    sharedWindow,
    bellWindow: (roster) =>
      bellWindow(roster, new Date(sharedWindow.openAt ?? Date.now())),
  });
  // Two rosters on one class id share a gate, so they are one period.
  return Object.keys(periodAccess).length > 1
    ? { accessMode: resolved.mode, periodAccess }
    : undefined;
}

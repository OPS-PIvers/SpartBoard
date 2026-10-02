import type { BuildingScheduleDefaults, RosterBellPeriod } from '@/types';
import {
  listBellPeriods,
  normalizePeriodKey,
  periodFamily,
  resolveBellWindow,
} from '@/utils/bellSchedule';

export type ScheduleLookup = (
  buildingId: string
) => BuildingScheduleDefaults | null;

interface BellClass {
  classId: string;
  name: string;
  bellPeriod?: RosterBellPeriod;
}

/** A class counts as in session this long before its bell. */
export const IN_SESSION_LEAD_MS = 5 * 60 * 1000;

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Position of the class's period in its building's schedule; a bare "5" lands on 5A. */
function periodRank(
  bell: RosterBellPeriod,
  scheduleFor: ScheduleLookup
): number | null {
  const options = listBellPeriods(scheduleFor(bell.buildingId));
  const key = normalizePeriodKey(bell.periodId);
  const exact = options.findIndex(
    (o) => normalizePeriodKey(o.periodId) === key
  );
  const index =
    exact !== -1
      ? exact
      : options.findIndex(
          (o) => periodFamily(o.periodId) === periodFamily(key)
        );
  return index === -1 ? null : index;
}

/** Bell period first, then name; classes with no bell period go last. Ignores the clock, so the order holds all day. */
export function sortClassesByBell<T extends BellClass>(
  classes: readonly T[],
  scheduleFor: ScheduleLookup
): T[] {
  const keyed = classes.map((c) => {
    const rank = c.bellPeriod ? periodRank(c.bellPeriod, scheduleFor) : null;
    const periodId = c.bellPeriod?.periodId ?? '';
    return {
      c,
      rank,
      periodId,
      tier: !c.bellPeriod ? 2 : rank === null ? 1 : 0,
    };
  });
  return keyed
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.rank ?? 0) - (b.rank ?? 0) ||
        collator.compare(a.periodId, b.periodId) ||
        collator.compare(a.c.name, b.c.name) ||
        a.c.classId.localeCompare(b.c.classId)
    )
    .map((k) => k.c);
}

/** Ids of the classes whose bell window is open now, from 5 minutes before the start until the end. */
export function classIdsInSession(
  classes: readonly BellClass[],
  scheduleFor: ScheduleLookup,
  nowMs: number
): string[] {
  const now = new Date(nowMs);
  return classes
    .filter((c) => {
      if (!c.bellPeriod) return false;
      const window = resolveBellWindow(
        scheduleFor(c.bellPeriod.buildingId),
        c.bellPeriod,
        now
      );
      return (
        !!window &&
        nowMs >= window.openAt - IN_SESSION_LEAD_MS &&
        nowMs < window.closeAt
      );
    })
    .map((c) => c.classId);
}

/** The one class in session, or null when none or several are (the page then opens the Overview). */
export function pickClassInSession(
  classes: readonly BellClass[],
  scheduleFor: ScheduleLookup,
  nowMs: number
): string | null {
  const ids = classIdsInSession(classes, scheduleFor, nowMs);
  return ids.length === 1 ? ids[0] : null;
}

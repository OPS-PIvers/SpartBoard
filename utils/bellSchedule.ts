import type {
  BuildingScheduleDefaults,
  DailySchedule,
  FeaturePermission,
  RosterBellPeriod,
  ScheduleGlobalConfig,
} from '@/types';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import {
  computeEffectiveTimes,
  resolveActiveSchedule,
} from '@/components/widgets/Schedule/utils';

/** Local-date key, `YYYY-MM-DD`, as used by `dateOverrides`. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The building schedule that runs on `date`: a special-day override first, then the weekday pick. */
export function resolveBuildingSchedule(
  defaults: BuildingScheduleDefaults | null | undefined,
  date: Date
): DailySchedule | null {
  if (!defaults) return null;
  const schedules = defaults.schedules ?? [];
  const overrideId = defaults.dateOverrides?.[dateKey(date)];
  const override = overrideId
    ? schedules.find((s) => s.id === overrideId)
    : undefined;
  if (override) return override;
  return (
    resolveActiveSchedule(schedules, defaults.items ?? [], date.getDay())
      ?.schedule ?? null
  );
}

export interface BellPeriodOption {
  periodId: string;
  /** The item's task text on the first schedule that names the period. */
  label: string;
}

/** Every class period a building defines, across all of its schedules, in first-seen order. */
export function listBellPeriods(
  defaults: BuildingScheduleDefaults | null | undefined
): BellPeriodOption[] {
  if (!defaults) return [];
  const all = [
    ...(defaults.items ?? []),
    ...(defaults.schedules ?? []).flatMap((s) => s.items),
  ];
  const seen = new Map<string, BellPeriodOption>();
  for (const item of all) {
    const periodId = item.periodId?.trim();
    if (!item.isClassPeriod || !periodId || seen.has(periodId)) continue;
    seen.set(periodId, { periodId, label: item.task || periodId });
  }
  return [...seen.values()];
}

/**
 * The epoch-ms window a bell period runs on `date`, from the browser's local
 * clock, or null when that day's schedule has no such period.
 */
export function resolveBellWindow(
  defaults: BuildingScheduleDefaults | null | undefined,
  bellPeriod: Pick<RosterBellPeriod, 'periodId'> | null | undefined,
  date: Date
): { openAt: number; closeAt: number } | null {
  if (!bellPeriod) return null;
  const schedule = resolveBuildingSchedule(defaults, date);
  if (!schedule) return null;
  const exact = schedule.items.findIndex(
    (item) => item.isClassPeriod && item.periodId === bellPeriod.periodId
  );
  // A bare "5" tag spans every section of that period (5A, 5B, ...).
  const family = /^\d+$/.test(normalizePeriodKey(bellPeriod.periodId))
    ? normalizePeriodKey(bellPeriod.periodId)
    : null;
  const indexes =
    exact !== -1
      ? [exact]
      : family
        ? schedule.items.flatMap((item, i) =>
            item.isClassPeriod &&
            item.periodId &&
            periodFamily(item.periodId) === family
              ? [i]
              : []
          )
        : [];
  const times = computeEffectiveTimes(schedule.items);
  const spans = indexes
    .map((i) => times[i])
    .filter((t) => t && !t.isIdle && t.startSec >= 0 && t.endSec > t.startSec);
  if (spans.length === 0) return null;
  // Local-field arithmetic, so a DST change that day still lands on the bell.
  const at = (sec: number): number => {
    const d = new Date(date);
    d.setHours(0, 0, sec, 0);
    return d.getTime();
  };
  return {
    openAt: at(Math.min(...spans.map((t) => t.startSec))),
    closeAt: at(Math.max(...spans.map((t) => t.endSec))),
  };
}

/** A building's bell schedule from the admin's Schedule widget defaults, legacy building keys included. */
export function readBuildingScheduleDefaults(
  permissions: readonly FeaturePermission[] | null | undefined,
  buildingId: string | null | undefined
): BuildingScheduleDefaults | null {
  if (!buildingId) return null;
  const config = permissions?.find((p) => p.widgetType === 'schedule')
    ?.config as Partial<ScheduleGlobalConfig> | undefined;
  if (!config?.buildingDefaults) return null;
  return (
    canonicalizeBuildingKeyedRecord(config.buildingDefaults)[
      canonicalBuildingId(buildingId)
    ] ?? null
  );
}

export interface BuildingBellPeriodOption
  extends RosterBellPeriod, BellPeriodOption {}

/** Every class period across the teacher's buildings, for the roster's "Bell period" pick. */
export function listTeacherBellPeriods(
  permissions: readonly FeaturePermission[] | null | undefined,
  buildingIds: readonly string[]
): BuildingBellPeriodOption[] {
  const seen = new Set<string>();
  const out: BuildingBellPeriodOption[] = [];
  for (const raw of buildingIds) {
    const buildingId = canonicalBuildingId(raw);
    if (seen.has(buildingId)) continue;
    seen.add(buildingId);
    const defaults = readBuildingScheduleDefaults(permissions, buildingId);
    for (const option of listBellPeriods(defaults)) {
      out.push({ buildingId, ...option });
    }
  }
  return out;
}

/** Folds "Period 05", "P5" and "5" to one key so OneRoster periods can match building period ids. */
export function normalizePeriodKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(period|per|p)\s*(?=\d)/, '')
    .replace(/^0+(?=\w)/, '');
}

/** The period number a section id belongs to: "5A" and "P5b" are both "5". */
export function periodFamily(raw: string): string {
  return normalizePeriodKey(raw).replace(/^(\d+)[a-z]*$/, '$1');
}

/** The teacher bell period a ClassLink class's OneRoster periods name, or null when none or several match. */
export function matchBellPeriod(
  periods: readonly string[] | undefined,
  options: readonly BuildingBellPeriodOption[] | undefined
): RosterBellPeriod | null {
  if (!periods?.length || !options?.length) return null;
  const wanted = new Set(periods.map(normalizePeriodKey).filter(Boolean));
  const hits = options.filter((o) =>
    wanted.has(normalizePeriodKey(o.periodId))
  );
  if (hits.length === 1)
    return { buildingId: hits[0].buildingId, periodId: hits[0].periodId };
  if (hits.length > 1) return null;
  // No exact id: a bare "5" tags the whole period when its sections share one building.
  const families = [...wanted].filter((k) => /^\d+$/.test(k));
  const sections = options.filter((o) =>
    families.includes(periodFamily(o.periodId))
  );
  const buildings = new Set(sections.map((o) => o.buildingId));
  const matched = new Set(sections.map((o) => periodFamily(o.periodId)));
  if (buildings.size !== 1 || matched.size !== 1) return null;
  return { buildingId: sections[0].buildingId, periodId: [...matched][0] };
}

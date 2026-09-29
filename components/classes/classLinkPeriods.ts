import type { ClassLinkClass, ClassRoster } from '@/types';
import {
  matchBellPeriod,
  type BuildingBellPeriodOption,
} from '@/utils/bellSchedule';

/** OneRoster `periods` is a string array by spec; some tenants send one comma-separated string. */
export const readClassPeriods = (cls: ClassLinkClass): string[] => {
  const raw: unknown = cls.periods;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return list
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);
};

/** Metadata to refresh on an already-imported roster: new OneRoster periods, and a bell tag when it has none. */
export const classLinkBackfillPatch = (
  roster: Pick<ClassRoster, 'classlinkPeriods' | 'bellPeriod'>,
  cls: ClassLinkClass,
  bellOptions: readonly BuildingBellPeriodOption[] | undefined
): Partial<ClassRoster> | null => {
  const periods = readClassPeriods(cls);
  const patch: Partial<ClassRoster> = {};
  if (
    periods.length > 0 &&
    periods.join('|') !== (roster.classlinkPeriods ?? []).join('|')
  )
    patch.classlinkPeriods = periods;
  if (!roster.bellPeriod) {
    const bell = matchBellPeriod(periods, bellOptions);
    if (bell) patch.bellPeriod = bell;
  }
  return Object.keys(patch).length > 0 ? patch : null;
};

/** Refreshes periods and bell tags on rosters already imported from these classes, while per-period access is on. */
export const backfillRosters = async (
  classes: readonly ClassLinkClass[],
  {
    rosters,
    updateRoster,
    bellOptions,
  }: {
    rosters: readonly ClassRoster[];
    updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
    bellOptions: readonly BuildingBellPeriodOption[] | undefined;
  }
): Promise<void> => {
  if (!bellOptions) return;
  const byId = new Map(classes.map((c) => [c.sourcedId, c]));
  for (const roster of rosters) {
    const cls = roster.classlinkClassId
      ? byId.get(roster.classlinkClassId)
      : undefined;
    const patch = cls && classLinkBackfillPatch(roster, cls, bellOptions);
    if (!patch) continue;
    try {
      await updateRoster(roster.id, patch);
    } catch (err) {
      console.warn('[ClassLinkImportDialog] roster backfill failed', err);
    }
  }
};

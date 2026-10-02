import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { FeaturePermission, ScheduleGlobalConfig } from '@/types';
import { readBuildingScheduleDefaults } from '@/utils/bellSchedule';
import type { ScheduleLookup } from '@/utils/studentClassOrder';

type ScheduleConfig = Partial<ScheduleGlobalConfig> | null;

// Module cache so a remount doesn't refetch; the schedule is org-wide, not per student.
let cached: ScheduleConfig | undefined;

export interface StudentBellSchedules {
  status: 'loading' | 'ready' | 'error';
  scheduleFor: ScheduleLookup;
}

const lookupFrom =
  (config: ScheduleConfig): ScheduleLookup =>
  (buildingId) =>
    config
      ? readBuildingScheduleDefaults(
          [
            { widgetType: 'schedule', config },
          ] as unknown as FeaturePermission[],
          buildingId
        )
      : null;

const NO_SCHEDULES = lookupFrom(null);

/** The admin's building bell schedules, read once; idle until `enabled`. */
export function useStudentBellSchedules(
  enabled: boolean
): StudentBellSchedules {
  const [fetched, setFetched] = useState<{
    status: 'ready' | 'error';
    config: ScheduleConfig;
  } | null>(null);

  useEffect(() => {
    if (!enabled || isAuthBypass || cached !== undefined) return;
    let cancelled = false;
    getDoc(doc(db, 'feature_permissions', 'schedule'))
      .then((snap) => {
        const raw: unknown = snap.data()?.config;
        const config =
          raw && typeof raw === 'object' ? (raw as ScheduleConfig) : null;
        cached = config;
        if (!cancelled) setFetched({ status: 'ready', config });
      })
      .catch(() => {
        if (!cancelled) setFetched({ status: 'error', config: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const config = cached !== undefined ? cached : (fetched?.config ?? null);
  const scheduleFor = useMemo(() => lookupFrom(config), [config]);

  if (!enabled || isAuthBypass) {
    return { status: 'ready', scheduleFor: NO_SCHEDULES };
  }
  if (cached !== undefined) return { status: 'ready', scheduleFor };
  return { status: fetched?.status ?? 'loading', scheduleFor };
}

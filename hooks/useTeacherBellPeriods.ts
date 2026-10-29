import { useMemo } from 'react';
import type { ClassRoster, RosterBellPeriod } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  listTeacherBellPeriods,
  readBuildingScheduleDefaults,
  resolveBellWindow,
  type BuildingBellPeriodOption,
} from '@/utils/bellSchedule';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';

/** The teacher's bell periods for the per-period pickers. */
export function useTeacherBellPeriodOptions(): BuildingBellPeriodOption[] {
  const { selectedBuildings, featurePermissions } = useAuth();
  const buildings = useAdminBuildings();
  return useMemo(() => {
    const options = listTeacherBellPeriods(
      featurePermissions,
      selectedBuildings
    );
    const multiBuilding = new Set(options.map((o) => o.buildingId)).size > 1;
    if (!multiBuilding) return options;
    return options.map((o) => ({
      ...o,
      label: `${buildings.find((b) => b.id === o.buildingId)?.name ?? o.buildingId} · ${o.label}`,
    }));
  }, [featurePermissions, selectedBuildings, buildings]);
}

/** The assign modal's per-period context. */
export function useAssignPeriodAccess(
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>
): AssignPeriodAccessContext {
  const { featurePermissions } = useAuth();
  const bellOptions = useTeacherBellPeriodOptions();
  return useMemo(() => {
    return {
      bellOptions,
      bellWindow: (roster, date) =>
        resolveBellWindow(
          readBuildingScheduleDefaults(
            featurePermissions,
            roster.bellPeriod?.buildingId
          ),
          roster.bellPeriod,
          date
        ),
      onTagRoster: (rosterId: string, bellPeriod: RosterBellPeriod) =>
        updateRoster(rosterId, { bellPeriod }),
    };
  }, [bellOptions, featurePermissions, updateRoster]);
}

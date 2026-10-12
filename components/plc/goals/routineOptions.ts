// Routine Guide routines a group goal practice can link to, A to Z.

import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { resolveRoutineGuideLibrary } from '@/config/routineGuide';
import { getBuildingGradeLevels } from '@/config/buildings';
import type {
  GradeLevel,
  Plc,
  PlcGoalPractice,
  RoutineGuideGlobalConfig,
  RoutineGuideRoutine,
} from '@/types';

export function useGoalRoutineOptions(): RoutineGuideRoutine[] {
  const { featurePermissions } = useAuth();
  const config = featurePermissions.find((p) => p.widgetType === 'routineGuide')
    ?.config as RoutineGuideGlobalConfig | undefined;
  return useMemo(
    () =>
      [...resolveRoutineGuideLibrary(config)].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [config]
  );
}

export function routineFor(
  options: readonly RoutineGuideRoutine[],
  routineId: string
): RoutineGuideRoutine | null {
  return options.find((o) => o.id === routineId) ?? null;
}

/** Routine practices read "using X" in the goal sentence. */
export function practiceWording(
  p: PlcGoalPractice,
  options: readonly RoutineGuideRoutine[]
): string {
  const routine = p.routineId ? routineFor(options, p.routineId) : null;
  return routine ? `using ${routine.name}` : p.text;
}

/** The group's building grades, else the teacher's own. */
export function useGoalGradeLevels(plc: Pick<Plc, 'buildingId'>): GradeLevel[] {
  const { userGradeLevels } = useAuth();
  return useMemo(() => {
    const building = plc.buildingId
      ? getBuildingGradeLevels([plc.buildingId])
      : [];
    return building.length ? building : userGradeLevels;
  }, [plc.buildingId, userGradeLevels]);
}

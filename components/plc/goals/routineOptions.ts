// Routine Guide routines a group goal practice can link to, A to Z.

import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { resolveRoutineGuideLibrary } from '@/config/routineGuide';
import type { RoutineGuideGlobalConfig, RoutineGuideRoutine } from '@/types';

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

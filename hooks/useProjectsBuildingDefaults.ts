import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import type { BuildingProjectsDefaults, ProjectsGlobalConfig } from '@/types';

/** The `projects` feature permission's per-building defaults, set in the admin panel. */
export function useProjectsBuildingDefaults(
  buildingId: string | undefined
): BuildingProjectsDefaults {
  const { featurePermissions = [] } = useAuth();
  return useMemo(() => {
    const canonicalId = canonicalBuildingId(buildingId ?? '');
    const fallback: BuildingProjectsDefaults = { buildingId: canonicalId };
    if (!buildingId) return fallback;
    const config = featurePermissions.find((p) => p.widgetType === 'projects')
      ?.config as Partial<ProjectsGlobalConfig> | undefined;
    const defaults = canonicalizeBuildingKeyedRecord(
      config?.buildingDefaults ?? {}
    );
    return defaults[canonicalId] ?? fallback;
  }, [buildingId, featurePermissions]);
}

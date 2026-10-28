import { canonicalizeBuildingIds } from '@/config/buildings';
import { useAuth } from '@/context/useAuth';
import type { GlobalFeature } from '@/types';

/** Details need the release flag and one of the teacher's buildings on the admin's allow list. */
export function weatherDetailsAllowed(input: {
  canAccessFeature: (id: GlobalFeature) => boolean;
  adminConfig: Record<string, unknown> | undefined;
  selectedBuildings: readonly string[] | undefined;
}): boolean {
  if (!input.canAccessFeature('weather-details')) return false;
  const ids = input.adminConfig?.detailsBuildingIds;
  const allowed = new Set(
    canonicalizeBuildingIds(
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : []
    )
  );
  return canonicalizeBuildingIds(input.selectedBuildings ?? []).some((id) =>
    allowed.has(id)
  );
}

export function useWeatherDetailsAllowed(): boolean {
  const { canAccessFeature, featurePermissions, selectedBuildings } = useAuth();
  return weatherDetailsAllowed({
    canAccessFeature,
    adminConfig: featurePermissions.find((p) => p.widgetType === 'weather')
      ?.config,
    selectedBuildings,
  });
}

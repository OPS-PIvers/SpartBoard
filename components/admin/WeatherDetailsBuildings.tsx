import React from 'react';
import { Toggle } from '@/components/common/Toggle';
import { tourFieldAttr } from '@/config/tourAnchors';
import { canonicalBuildingId } from '@/config/buildings';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import type { WeatherGlobalConfig } from '@/types';

/** Which buildings' teachers may turn on weather details. */
export const WeatherDetailsBuildings: React.FC<{
  config: WeatherGlobalConfig;
  onChange: (config: WeatherGlobalConfig) => void;
}> = ({ config, onChange }) => {
  const { canAccessFeature } = useAuth();
  const buildings = useAdminBuildings();
  if (!canAccessFeature('weather-details')) return null;

  const allowed = new Set(
    (config.detailsBuildingIds ?? []).map(canonicalBuildingId)
  );
  const setAllowed = (buildingId: string, on: boolean) => {
    const next = new Set(allowed);
    if (on) next.add(buildingId);
    else next.delete(buildingId);
    onChange({
      ...config,
      detailsBuildingIds: buildings
        .map((b) => canonicalBuildingId(b.id))
        .filter((id) => next.has(id)),
    });
  };

  return (
    <div>
      <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
        Weather Details
      </label>
      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {buildings.map((building) => {
          const id = canonicalBuildingId(building.id);
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-3 px-2 py-1.5"
            >
              <span className="text-xs font-semibold text-slate-700">
                {building.name}
                <span className="ml-1.5 font-normal text-slate-500">
                  {building.gradeLabel}
                </span>
              </span>
              <Toggle
                label={`Weather details at ${building.name}`}
                checked={allowed.has(id)}
                onChange={(on) => setAllowed(id, on)}
                size="xs"
                showLabels={false}
                anchor={tourFieldAttr(
                  'admin.widget-config.field',
                  'weather',
                  `detailsBuilding-${id}`
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

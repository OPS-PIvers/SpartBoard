import React, { useState } from 'react';
import { ClassesGlobalConfig, BuildingClassesDefaults } from '@/types';
import { BUILDINGS } from '@/config/buildings';
import { Toggle } from '../common/Toggle';

interface ClassesConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ClassesConfigurationPanel: React.FC<
  ClassesConfigurationPanelProps
> = ({ config, onChange }) => {
  const [activeBuildingId, setActiveBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const globalConfig = config as unknown as ClassesGlobalConfig;
  const buildingDefaults = globalConfig.buildingDefaults ?? {};
  const activeBuildingConfig = buildingDefaults[activeBuildingId] ?? {};

  const updateBuildingConfig = (updates: Partial<BuildingClassesDefaults>) => {
    onChange({
      ...globalConfig,
      buildingDefaults: {
        ...buildingDefaults,
        [activeBuildingId]: {
          ...activeBuildingConfig,
          ...updates,
        },
      },
    } as unknown as Record<string, unknown>);
  };

  return (
    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest flex-1">
          Classes
        </h3>
      </div>

      <div className="flex bg-white rounded-lg border border-slate-200 p-1 mb-4">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveBuildingId(building.id)}
            className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
              activeBuildingId === building.id
                ? 'bg-brand-blue-primary text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
          <div>
            <span className="text-xxs font-bold text-slate-500 uppercase block">
              Enable ClassLink Sync
            </span>
            <p className="text-xxs text-slate-400 mt-0.5">
              Allow teachers to sync rosters directly from ClassLink.
            </p>
          </div>
          <Toggle
            checked={activeBuildingConfig.classLinkSyncEnabled ?? true}
            onChange={(checked) =>
              updateBuildingConfig({ classLinkSyncEnabled: checked })
            }
            size="sm"
            showLabels={false}
          />
        </div>
      </div>
    </div>
  );
};

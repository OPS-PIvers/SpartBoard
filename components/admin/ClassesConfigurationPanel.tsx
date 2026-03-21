import React from 'react';
import { BuildingClassesDefaults } from '@/types';
import { BUILDINGS } from '@/config/buildings';

interface Props {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ClassesConfigurationPanel: React.FC<Props> = ({
  config,
  onChange,
}) => {
  const buildingDefaults =
    (config?.buildingDefaults as Record<string, BuildingClassesDefaults>) ?? {};

  const handleUpdateBuilding = (
    buildingId: string,
    updates: Partial<BuildingClassesDefaults>
  ) => {
    const currentBuildingConfig = buildingDefaults[buildingId] || {
      buildingId,
    };

    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [buildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
          Building Defaults
        </h3>

        <div className="space-y-6">
          {BUILDINGS.map((building) => {
            const bConfig = buildingDefaults[building.id] || {
              buildingId: building.id,
            };

            return (
              <div
                key={building.id}
                className="pt-4 first:pt-0 border-t first:border-t-0 border-slate-200"
              >
                <h4 className="text-xs font-bold text-slate-800 mb-3">
                  {building.name}
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                      Default Roster Source
                    </label>
                    <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                      <button
                        onClick={() =>
                          handleUpdateBuilding(building.id, {
                            defaultRosterSource: 'classlink',
                          })
                        }
                        className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                          bConfig.defaultRosterSource === 'classlink' ||
                          !bConfig.defaultRosterSource
                            ? 'bg-brand-blue-primary text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        ClassLink Integration
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateBuilding(building.id, {
                            defaultRosterSource: 'manual',
                          })
                        }
                        className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                          bConfig.defaultRosterSource === 'manual'
                            ? 'bg-brand-blue-primary text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        Manual Lists
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

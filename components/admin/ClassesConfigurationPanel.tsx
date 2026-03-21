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
  const [activeTab, setActiveTab] = useState(BUILDINGS[0].id);

  const globalConfig = config as unknown as ClassesGlobalConfig;
  const buildingDefaults = globalConfig.buildingDefaults || {};
  const activeConfig: BuildingClassesDefaults = buildingDefaults[activeTab] || {
    buildingId: activeTab,
    classLinkEnabled: true,
  };

  const handleUpdate = (updates: Partial<BuildingClassesDefaults>) => {
    const newBuildingDefaults = {
      ...buildingDefaults,
      [activeTab]: {
        ...activeConfig,
        ...updates,
      },
    };
    onChange({
      ...config,
      buildingDefaults: newBuildingDefaults,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto custom-scrollbar">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveTab(building.id)}
            className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === building.id
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
        <div>
          <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            ClassLink Integration
          </h4>
          <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div>
              <span className="text-sm font-bold text-slate-700 block mb-1">
                Enable ClassLink Sync
              </span>
              <span className="text-xs text-slate-500 block">
                Allow teachers in this building to import their class rosters
                directly from ClassLink.
              </span>
            </div>
            <Toggle
              checked={activeConfig.classLinkEnabled !== false}
              onChange={(checked) =>
                handleUpdate({ classLinkEnabled: checked })
              }
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

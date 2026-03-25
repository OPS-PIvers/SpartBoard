import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  TrafficLightGlobalConfig,
  BuildingTrafficLightDefaults,
} from '@/types';

interface TrafficLightConfigurationPanelProps {
  config: TrafficLightGlobalConfig;
  onChange: (newConfig: TrafficLightGlobalConfig) => void;
}

const LIGHT_OPTIONS: {
  value: BuildingTrafficLightDefaults['active'];
  label: string;
  description: string;
  activeClass: string;
  inactiveClass: string;
  dotClass: string;
}[] = [
  {
    value: null,
    label: 'Off',
    description: 'All lights unlit on load',
    activeClass: 'bg-slate-700 text-white border-slate-700',
    inactiveClass: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    dotClass: 'bg-slate-400',
  },
  {
    value: 'green',
    label: 'Green',
    description: 'Ready to work',
    activeClass: 'bg-green-500 text-white border-green-500',
    inactiveClass: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    dotClass: 'bg-green-500',
  },
  {
    value: 'yellow',
    label: 'Yellow',
    description: 'Caution / settling in',
    activeClass: 'bg-yellow-400 text-white border-yellow-400',
    inactiveClass: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    dotClass: 'bg-yellow-400',
  },
  {
    value: 'red',
    label: 'Red',
    description: 'Stop / silent',
    activeClass: 'bg-red-500 text-white border-red-500',
    inactiveClass: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    dotClass: 'bg-red-500',
  },
];

export const TrafficLightConfigurationPanel: React.FC<
  TrafficLightConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingTrafficLightDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    active: null,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingTrafficLightDefaults>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Traffic Light Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          Sets the default active light state when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          the Traffic Light widget. Starting on Green immediately establishes a
          visual baseline without requiring a manual click.
        </p>

        {/* Default Active Light */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Active State on Load
          </label>
          <div className="grid grid-cols-2 gap-2">
            {LIGHT_OPTIONS.map((opt) => {
              const isSelected = currentBuildingConfig.active === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => handleUpdateBuilding({ active: opt.value })}
                  className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${
                    isSelected ? opt.activeClass : opt.inactiveClass
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full shrink-0 ${opt.dotClass} ${
                      isSelected ? 'opacity-100' : 'opacity-40'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div
                      className={`text-xxs ${isSelected ? 'opacity-80' : 'text-slate-400'}`}
                    >
                      {opt.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

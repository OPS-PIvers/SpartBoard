import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { RandomGlobalConfig, BuildingRandomDefaults } from '@/types';
import { Toggle } from '../common/Toggle';

interface RandomConfigurationPanelProps {
  config: RandomGlobalConfig;
  onChange: (newConfig: RandomGlobalConfig) => void;
}

const VISUAL_STYLE_OPTIONS: {
  value: BuildingRandomDefaults['visualStyle'];
  label: string;
  description: string;
}[] = [
  { value: 'wheel', label: 'Wheel', description: 'Spinning prize wheel' },
  { value: 'slots', label: 'Slots', description: 'Slot machine spin' },
  { value: 'flash', label: 'Flash', description: 'Rapid text generator' },
];

export const RandomConfigurationPanel: React.FC<
  RandomConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingRandomDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingRandomDefaults>) => {
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
          Configure Building Random Picker Defaults
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
                selectedBuildingId === building.id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Random Picker widget when a
          teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Visual Style */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Visual Style
          </label>
          <div className="flex gap-1.5">
            {VISUAL_STYLE_OPTIONS.map((opt) => {
              const isSelected =
                (currentBuildingConfig.visualStyle ?? 'flash') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() =>
                    handleUpdateBuilding({ visualStyle: opt.value })
                  }
                  className={`flex-1 p-2 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div
                    className={`text-xxs mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}
                  >
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sound Enabled */}
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
          <div>
            <span className="text-xxs font-bold text-slate-700 block">
              Sound Effects
            </span>
            <span className="text-xxs text-slate-400">
              Play audio during the random selection animation
            </span>
          </div>
          <Toggle
            checked={currentBuildingConfig.soundEnabled ?? true}
            onChange={(checked) =>
              handleUpdateBuilding({ soundEnabled: checked })
            }
            size="xs"
            showLabels={false}
          />
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import {
  BreathingGlobalConfig,
  BuildingBreathingDefaults,
  BreathingConfig,
} from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Card } from '@/components/common/Card';

interface BreathingConfigurationPanelProps {
  config: BreathingGlobalConfig;
  onChange: (newConfig: BreathingGlobalConfig) => void;
}

const PATTERNS: {
  value: BreathingConfig['pattern'] | 'global';
  label: string;
}[] = [
  { value: 'global', label: 'Inherit (Default)' },
  { value: '4-4-4-4', label: 'Box Breathing' },
  { value: '4-7-8', label: 'Relaxing Breath' },
  { value: '5-5', label: 'Coherent Breath' },
];

const VISUALS: {
  value: BreathingConfig['visual'] | 'global';
  label: string;
}[] = [
  { value: 'global', label: 'Inherit (Default)' },
  { value: 'circle', label: 'Sphere' },
  { value: 'lotus', label: 'Lotus' },
  { value: 'wave', label: 'Ripple' },
];

export const BreathingConfigurationPanel: React.FC<
  BreathingConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingBreathingDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingBreathingDefaults>
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
        <SettingsLabel>Configure Building Breathing Defaults</SettingsLabel>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Breathing widget when a teacher
          in <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
          adds it to their dashboard.
        </p>

        {/* Pattern Selection */}
        <div>
          <SettingsLabel className="mb-1">Default Pattern</SettingsLabel>
          <div className="flex flex-wrap bg-white rounded-lg border border-slate-200 p-1 gap-1">
            {PATTERNS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  handleUpdateBuilding({
                    pattern: opt.value === 'global' ? undefined : opt.value,
                  })
                }
                className={`flex-1 py-1.5 px-2 text-xxs font-bold rounded transition-colors whitespace-nowrap ${
                  (currentBuildingConfig.pattern ?? 'global') === opt.value
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Selection */}
        <div>
          <SettingsLabel className="mb-1">Default Visual Style</SettingsLabel>
          <div className="flex flex-wrap bg-white rounded-lg border border-slate-200 p-1 gap-1">
            {VISUALS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  handleUpdateBuilding({
                    visual: opt.value === 'global' ? undefined : opt.value,
                  })
                }
                className={`flex-1 py-1.5 px-2 text-xxs font-bold rounded transition-colors whitespace-nowrap ${
                  (currentBuildingConfig.visual ?? 'global') === opt.value
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color Theme */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <SettingsLabel className="mb-0">Default Color Theme</SettingsLabel>
            {!currentBuildingConfig.color ? (
              <span className="text-xxs text-slate-400 italic">
                Inherit (Default)
              </span>
            ) : (
              <button
                onClick={() => handleUpdateBuilding({ color: undefined })}
                className="text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
              >
                Clear Override
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 p-2 bg-white rounded-lg border border-slate-200">
            {WIDGET_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => handleUpdateBuilding({ color })}
                className={`w-6 h-6 rounded-full transition-all border-2 ${
                  currentBuildingConfig.color === color
                    ? 'border-slate-800 scale-110 shadow-md'
                    : 'border-transparent hover:scale-105 shadow-sm'
                }`}
                style={{ backgroundColor: color }}
                title={`Select color ${color}`}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

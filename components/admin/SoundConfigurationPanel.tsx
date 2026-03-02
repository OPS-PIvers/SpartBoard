import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { SoundGlobalConfig, BuildingSoundDefaults } from '@/types';

interface SoundConfigurationPanelProps {
  config: SoundGlobalConfig;
  onChange: (newConfig: SoundGlobalConfig) => void;
}

const VISUAL_OPTIONS: {
  value: BuildingSoundDefaults['visual'];
  label: string;
  description: string;
}[] = [
  {
    value: 'thermometer',
    label: 'Thermometer',
    description: 'Classic rising bar',
  },
  { value: 'speedometer', label: 'Speedometer', description: 'Circular gauge' },
  { value: 'line', label: 'Waveform', description: 'Audio waveform line' },
  { value: 'balls', label: 'Balls', description: 'Bouncing animated balls' },
];

export const SoundConfigurationPanel: React.FC<
  SoundConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingSoundDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingSoundDefaults>) => {
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

  const sensitivity = currentBuildingConfig.sensitivity ?? 1;

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Sound Meter Defaults
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
          These defaults will pre-configure the Sound Meter widget when a
          teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Visual Style */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Visual Style
          </label>
          <div className="grid grid-cols-2 gap-2">
            {VISUAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleUpdateBuilding({ visual: opt.value })}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  (currentBuildingConfig.visual ?? 'thermometer') === opt.value
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">{opt.label}</div>
                <div
                  className={`text-xxs mt-0.5 ${
                    (currentBuildingConfig.visual ?? 'thermometer') ===
                    opt.value
                      ? 'text-blue-100'
                      : 'text-slate-400'
                  }`}
                >
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Default Sensitivity */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Sensitivity ({sensitivity.toFixed(1)}x)
          </label>
          <p className="text-xxs text-slate-400 mb-2 leading-tight">
            Calibrate to match the acoustic environment of each building&apos;s
            issued devices. Higher = more sensitive to quieter sounds.
          </p>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={sensitivity}
            onChange={(e) =>
              handleUpdateBuilding({
                sensitivity: parseFloat(e.target.value),
              })
            }
            className="w-full accent-brand-blue-primary"
          />
          <div className="flex justify-between text-xxs text-slate-400 mt-0.5">
            <span>0.1x (Low)</span>
            <span>1.0x (Normal)</span>
            <span>3.0x (High)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { ClockGlobalConfig, BuildingClockDefaults } from '@/types';
import { Toggle } from '../common/Toggle';
import { STANDARD_COLORS } from '@/config/colors';

interface ClockConfigurationPanelProps {
  config: ClockGlobalConfig;
  onChange: (newConfig: ClockGlobalConfig) => void;
}

const FONT_FAMILY_OPTIONS = [
  { value: 'global', label: 'Inherit (Default)' },
  { value: 'font-sans', label: 'Sans-serif' },
  { value: 'font-mono', label: 'Monospace' },
  { value: 'font-handwritten', label: 'Handwritten' },
];

export const ClockConfigurationPanel: React.FC<
  ClockConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingClockDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingClockDefaults>) => {
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
          Configure Building Clock Defaults
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
          These defaults will pre-configure the Clock widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* 24-hour format toggle */}
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
          <div>
            <span className="text-xxs font-bold text-slate-700 block">
              24-Hour Format
            </span>
            <span className="text-xxs text-slate-400">Widget default: On</span>
          </div>
          <Toggle
            checked={currentBuildingConfig.format24 ?? true}
            onChange={(checked) => handleUpdateBuilding({ format24: checked })}
            size="xs"
            showLabels={false}
          />
        </div>

        {/* Font Family */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Font Family
          </label>
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 gap-1">
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleUpdateBuilding({ fontFamily: opt.value })}
                className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                  (currentBuildingConfig.fontFamily ?? 'global') === opt.value
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Color */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Theme Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={currentBuildingConfig.themeColor ?? STANDARD_COLORS.slate}
              onChange={(e) =>
                handleUpdateBuilding({ themeColor: e.target.value })
              }
              className="w-10 h-8 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
              title="Pick theme color"
            />
            <input
              type="text"
              value={currentBuildingConfig.themeColor ?? ''}
              onChange={(e) =>
                handleUpdateBuilding({
                  themeColor: e.target.value || undefined,
                })
              }
              placeholder="#ffffff"
              className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
            />
            {currentBuildingConfig.themeColor && (
              <button
                onClick={() => handleUpdateBuilding({ themeColor: undefined })}
                className="text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { ClockGlobalConfig, BuildingClockDefaults } from '@/types';
import { Toggle } from '../common/Toggle';
import { STANDARD_COLORS } from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Card } from '@/components/common/Card';

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
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

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
        <SettingsLabel>Configure Building Clock Defaults</SettingsLabel>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
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
          <SettingsLabel className="mb-1">Default Font Family</SettingsLabel>
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
          <SettingsLabel className="mb-1">Default Theme Color</SettingsLabel>
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
      </Card>
    </div>
  );
};

import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  HotspotImageGlobalConfig,
  BuildingHotspotImageDefaults,
  HotspotImageConfig,
} from '@/types';

type PopoverTheme = NonNullable<HotspotImageConfig['popoverTheme']>;

const THEME_OPTIONS: { value: PopoverTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'glass', label: 'Glass' },
];

interface HotspotImageConfigurationPanelProps {
  config: HotspotImageGlobalConfig;
  onChange: (newConfig: HotspotImageGlobalConfig) => void;
}

export const HotspotImageConfigurationPanel: React.FC<
  HotspotImageConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingHotspotImageDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingHotspotImageDefaults>
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
          Configure Building Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-populate the Hotspot Image widget when a
          teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Popover Theme Default */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Popover Theme
          </label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((theme) => (
              <button
                key={theme.value}
                onClick={() =>
                  handleUpdateBuilding({
                    popoverTheme: theme.value,
                  })
                }
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors border ${
                  (currentBuildingConfig.popoverTheme ?? 'light') ===
                  theme.value
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

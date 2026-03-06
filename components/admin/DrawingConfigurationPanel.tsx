import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { DrawingGlobalConfig, BuildingDrawingDefaults } from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';
import { Maximize, Minimize, Pencil, Palette } from 'lucide-react';

interface DrawingConfigurationPanelProps {
  config: DrawingGlobalConfig;
  onChange: (newConfig: DrawingGlobalConfig) => void;
}

export const DrawingConfigurationPanel: React.FC<
  DrawingConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingDrawingDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingDrawingDefaults>) => {
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

  const NUM_COLOR_PRESETS = 5;

  const activeMode = currentBuildingConfig.mode ?? 'window';
  const activeWidth = currentBuildingConfig.width ?? 4;

  // Normalize palette to exactly 5 colors
  const activePalette = (() => {
    const raw = currentBuildingConfig.customColors ?? [];
    const normalized = raw.slice(0, NUM_COLOR_PRESETS);
    while (normalized.length < NUM_COLOR_PRESETS) {
      normalized.push(
        WIDGET_PALETTE[normalized.length % WIDGET_PALETTE.length]
      );
    }
    return normalized;
  })();

  const handleColorChange = (index: number, newColor: string) => {
    const nextColors = [...activePalette];
    nextColors[index] = newColor;
    handleUpdateBuilding({ customColors: nextColors });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Drawing Defaults
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

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-6">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Drawing widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Mode */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-1.5">
            <Maximize className="w-3 h-3" /> Default Mode
          </label>
          <div className="flex bg-white rounded-lg border border-slate-200 p-1">
            <button
              onClick={() => handleUpdateBuilding({ mode: 'window' })}
              className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors flex items-center justify-center gap-1.5 ${
                activeMode === 'window'
                  ? 'bg-brand-blue-primary text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Minimize className="w-3 h-3" /> Window
            </button>
            <button
              onClick={() => handleUpdateBuilding({ mode: 'overlay' })}
              className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors flex items-center justify-center gap-1.5 ${
                activeMode === 'overlay'
                  ? 'bg-brand-blue-primary text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Maximize className="w-3 h-3" /> Overlay (Annotate)
            </button>
          </div>
        </div>

        {/* Default Brush Thickness */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-1.5">
            <Pencil className="w-3 h-3" /> Default Brush Thickness
          </label>
          <div className="flex items-center gap-4 px-2">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={activeWidth}
              onChange={(e) =>
                handleUpdateBuilding({ width: parseInt(e.target.value, 10) })
              }
              className="flex-1 accent-brand-blue-primary h-1.5 bg-white border border-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-10 text-center font-mono text-slate-700 text-xs">
              {activeWidth}px
            </span>
          </div>
        </div>

        {/* Default Color Presets */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-1.5">
            <Palette className="w-3 h-3" /> Default Color Presets (
            {NUM_COLOR_PRESETS})
          </label>
          <div className="flex gap-2 px-2">
            {activePalette.map((c, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-lg border-2 border-white shadow-sm ring-1 ring-slate-200 relative overflow-hidden transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              >
                <input
                  type="color"
                  value={c}
                  onChange={(e) => handleColorChange(i, e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Change preset color"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

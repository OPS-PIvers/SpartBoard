import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { NextUpGlobalConfig } from '@/types';
import { Settings2, ListOrdered, Palette, Type } from 'lucide-react';

interface NextUpConfigurationPanelProps {
  config: NextUpGlobalConfig;
  onChange: (newConfig: NextUpGlobalConfig) => void;
}

export const NextUpConfigurationPanel: React.FC<
  NextUpConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig = buildingDefaults[selectedBuildingId] ?? {
    displayCount: 3,
    fontFamily: 'lexend',
    themeColor: '#2d3f89',
  };

  const handleUpdateBuilding = (
    updates: Partial<typeof currentBuildingConfig>
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
        <label className="text-xxs font-black text-slate-500 uppercase mb-3 block flex items-center gap-2 tracking-widest">
          <Settings2 className="w-3 h-3" /> Select Building for Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      {/* Configuration Section */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-blue-primary rounded-lg shadow-blue-100 shadow-lg">
            <ListOrdered className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
              Next Up Defaults
            </h3>
            <p className="text-xxs text-slate-500 font-medium">
              Default settings for new widgets in this building
            </p>
          </div>
        </div>

        {/* Display Count */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-slate-400" /> Default Display
              Count
            </label>
            <span className="text-xs font-black text-brand-blue-primary bg-white px-2 py-1 rounded-lg border border-slate-200">
              {currentBuildingConfig.displayCount} names
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={currentBuildingConfig.displayCount}
            onChange={(e) =>
              handleUpdateBuilding({ displayCount: parseInt(e.target.value) })
            }
            className="w-full accent-brand-blue-primary cursor-pointer"
          />
          <p className="text-xxs text-slate-400 font-medium italic leading-relaxed">
            Sets how many upcoming students are shown on the teacher board by
            default.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-200/60">
          {/* Theme Color */}
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Palette className="w-4 h-4 text-slate-400" /> Default Theme Color
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                '#2d3f89',
                '#ad2122',
                '#059669',
                '#d97706',
                '#7c3aed',
                '#db2777',
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => handleUpdateBuilding({ themeColor: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    currentBuildingConfig.themeColor === c
                      ? 'border-slate-400 scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Typeface */}
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Type className="w-4 h-4 text-slate-400" /> Default Typeface
            </label>
            <select
              value={currentBuildingConfig.fontFamily}
              onChange={(e) =>
                handleUpdateBuilding({ fontFamily: e.target.value })
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-brand-blue-primary transition-colors shadow-sm"
            >
              <option value="lexend">Lexend (Modern)</option>
              <option value="patrick-hand">Patrick Hand (Playful)</option>
              <option value="roboto-mono">Roboto Mono (Tech)</option>
              <option value="sans">System Sans</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

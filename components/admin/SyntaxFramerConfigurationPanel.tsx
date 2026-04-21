import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import {
  SyntaxFramerGlobalConfig,
  BuildingSyntaxFramerDefaults,
  SyntaxFramerConfig,
} from '@/types';
import { Calculator, Type, AlignLeft, AlignCenter } from 'lucide-react';

interface SyntaxFramerConfigurationPanelProps {
  config: SyntaxFramerGlobalConfig;
  onChange: (newConfig: SyntaxFramerGlobalConfig) => void;
}

export const SyntaxFramerConfigurationPanel: React.FC<
  SyntaxFramerConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const defaultFramerConfig = WIDGET_DEFAULTS['syntax-framer']
    ?.config as SyntaxFramerConfig;
  const defaultMode = defaultFramerConfig?.mode ?? 'text';
  const defaultAlignment = defaultFramerConfig?.alignment ?? 'center';

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingSyntaxFramerDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    mode: defaultMode,
    alignment: defaultAlignment,
  };

  const handleUpdate = (updates: Partial<BuildingSyntaxFramerDefaults>) => {
    const updatedBuildingConfig = { ...currentBuildingConfig, ...updates };
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: updatedBuildingConfig,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Building Tabs */}
      <div
        className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto hide-scrollbar"
        role="tablist"
        aria-label="Select building for Syntax Framer defaults"
      >
        {BUILDINGS.map((building) => {
          const isSelected = selectedBuildingId === building.id;
          return (
            <button
              key={building.id}
              id={`syntax-framer-building-tab-${building.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`flex-1 min-w-[120px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                isSelected
                  ? 'bg-white text-brand-blue-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
              onClick={() => setSelectedBuildingId(building.id)}
            >
              {building.name}
            </button>
          );
        })}
      </div>

      <div
        className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-6"
        role="tabpanel"
        aria-labelledby={`syntax-framer-building-tab-${selectedBuildingId}`}
      >
        <div>
          <label className="text-sm font-black text-slate-700 uppercase tracking-widest block mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-slate-400" />
            Default Input Mode
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-bold transition-colors ${
                (currentBuildingConfig.mode ?? defaultMode) === 'text'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => handleUpdate({ mode: 'text' })}
            >
              <Type className="w-4 h-4" />
              Text
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-bold transition-colors ${
                (currentBuildingConfig.mode ?? defaultMode) === 'math'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => handleUpdate({ mode: 'math' })}
            >
              <Calculator className="w-4 h-4" />
              Math
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            <strong>Text:</strong> Words are separated by spaces.
            <br />
            <strong>Math:</strong> Numbers and operators are separated
            automatically.
          </p>
        </div>

        <div>
          <label className="text-sm font-black text-slate-700 uppercase tracking-widest block mb-3 flex items-center gap-2">
            <AlignLeft className="w-4 h-4 text-slate-400" />
            Default Alignment
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg border transition-colors ${
                (currentBuildingConfig.alignment ?? defaultAlignment) === 'left'
                  ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              onClick={() => handleUpdate({ alignment: 'left' })}
              title="Align Left"
              aria-label="Align Left"
              aria-pressed={
                (currentBuildingConfig.alignment ?? defaultAlignment) === 'left'
              }
            >
              <AlignLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg border transition-colors ${
                (currentBuildingConfig.alignment ?? defaultAlignment) ===
                'center'
                  ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              onClick={() => handleUpdate({ alignment: 'center' })}
              title="Align Center"
              aria-label="Align Center"
              aria-pressed={
                (currentBuildingConfig.alignment ?? defaultAlignment) ===
                'center'
              }
            >
              <AlignCenter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

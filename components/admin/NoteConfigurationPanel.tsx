import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { NoteGlobalConfig, BuildingNoteDefaults } from '@/types';
import { STICKY_NOTE_COLORS } from '@/config/colors';

interface NoteConfigurationPanelProps {
  config: NoteGlobalConfig;
  onChange: (newConfig: NoteGlobalConfig) => void;
}

const STICKY_COLOR_OPTIONS = Object.entries(STICKY_NOTE_COLORS).map(
  ([name, hex]) => ({ name, hex })
);

const FONT_SIZE_OPTIONS = [
  { value: 14, label: 'Small' },
  { value: 18, label: 'Medium' },
  { value: 24, label: 'Large' },
  { value: 32, label: 'X-Large' },
];

export const NoteConfigurationPanel: React.FC<NoteConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingNoteDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingNoteDefaults>) => {
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

  const activeColor =
    currentBuildingConfig.bgColor ?? STICKY_NOTE_COLORS.yellow;
  const activeFontSize = currentBuildingConfig.fontSize ?? 18;

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Note Defaults
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
          These defaults will pre-configure the Note widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Background Color */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Background Color
          </label>
          <div className="flex gap-2">
            {STICKY_COLOR_OPTIONS.map(({ name, hex }) => (
              <button
                key={name}
                onClick={() => handleUpdateBuilding({ bgColor: hex })}
                title={name.charAt(0).toUpperCase() + name.slice(1)}
                style={{ backgroundColor: hex }}
                className={`w-9 h-9 rounded-lg border-2 transition-all ${
                  activeColor === hex
                    ? 'border-brand-blue-primary scale-110 shadow-sm'
                    : 'border-transparent hover:border-slate-300'
                }`}
              />
            ))}
          </div>
          <p className="text-xxs text-slate-400 mt-1">
            Current: <span className="font-mono">{activeColor}</span>
          </p>
        </div>

        {/* Default Font Size */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Font Size
          </label>
          <div className="flex gap-1.5">
            {FONT_SIZE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleUpdateBuilding({ fontSize: value })}
                className={`flex-1 py-1.5 text-xxs font-bold rounded-lg border transition-colors ${
                  activeFontSize === value
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className="block text-xxs opacity-70">{value}px</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

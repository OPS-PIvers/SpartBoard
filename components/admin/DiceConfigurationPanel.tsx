import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { DiceGlobalConfig, BuildingDiceDefaults } from '@/types';

interface DiceConfigurationPanelProps {
  config: DiceGlobalConfig;
  onChange: (newConfig: DiceGlobalConfig) => void;
}

const DICE_COUNTS = [1, 2, 3, 4, 5, 6];

export const DiceConfigurationPanel: React.FC<DiceConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingDiceDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingDiceDefaults>) => {
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

  const currentCount = currentBuildingConfig.count ?? 1;

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Dice Defaults
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
          These defaults will pre-configure the Dice widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Dice Count */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
            Default Number of Dice
          </label>
          <div className="flex gap-2">
            {DICE_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => handleUpdateBuilding({ count })}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-black transition-all ${
                  currentCount === count
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
          <p className="text-xxs text-slate-400 mt-1.5">
            Widget default: 1 die
          </p>
        </div>
      </div>
    </div>
  );
};

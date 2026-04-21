import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  NumberLineGlobalConfig,
  BuildingNumberLineDefaults,
  NumberLineMode,
} from '@/types';
import { Toggle } from '../common/Toggle';

interface NumberLineConfigurationPanelProps {
  config: NumberLineGlobalConfig;
  onChange: (newConfig: NumberLineGlobalConfig) => void;
}

export const NumberLineConfigurationPanel: React.FC<
  NumberLineConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingNumberLineDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    min: 0,
    max: 10,
    step: 1,
    displayMode: 'integers',
    showArrows: true,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingNumberLineDefaults>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: { ...currentBuildingConfig, ...updates },
      },
    });
  };

  return (
    <div className="space-y-6">
      {BUILDINGS.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Building
          </label>
          <select
            value={selectedBuildingId}
            onChange={(e) => setSelectedBuildingId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {BUILDINGS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Minimum Value
            </label>
            <input
              type="number"
              value={currentBuildingConfig.min}
              onChange={(e) =>
                handleUpdateBuilding({ min: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Maximum Value
            </label>
            <input
              type="number"
              value={currentBuildingConfig.max}
              onChange={(e) =>
                handleUpdateBuilding({ max: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default Step Interval
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={currentBuildingConfig.step}
            onChange={(e) =>
              handleUpdateBuilding({ step: Number(e.target.value) })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default Display Mode
          </label>
          <select
            value={currentBuildingConfig.displayMode}
            onChange={(e) =>
              handleUpdateBuilding({
                displayMode: e.target.value as NumberLineMode,
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="integers">Integers</option>
            <option value="decimals">Decimals</option>
            <option value="fractions">Fractions</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="block text-sm font-medium text-slate-700">
              Show Arrows on Ends
            </span>
            <span className="text-xs text-slate-500">
              Indicates the line continues in both directions
            </span>
          </div>
          <Toggle
            checked={currentBuildingConfig.showArrows}
            onChange={(checked) =>
              handleUpdateBuilding({ showArrows: checked })
            }
          />
        </div>
      </div>
    </div>
  );
};

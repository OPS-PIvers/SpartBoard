import React from 'react';
import { BuildingSelector } from './BuildingSelector';
import { BUILDINGS } from '@/config/buildings';
import {
  ActivityWallGlobalConfig,
  ActivityWallBuildingConfig,
  ActivityWallMode,
  ActivityWallIdentificationMode,
} from '@/types';

interface ActivityWallConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ActivityWallConfigurationPanel: React.FC<
  ActivityWallConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = React.useState<string>(
    BUILDINGS[0].id
  );

  const globalConfig = config as unknown as ActivityWallGlobalConfig;
  const buildingDefaults = globalConfig.buildingDefaults ?? {};
  const currentBuildingConfig: ActivityWallBuildingConfig = buildingDefaults[
    selectedBuildingId
  ] ?? {
    defaultMode: 'text',
    defaultIdentificationMode: 'anonymous',
    defaultModerationEnabled: false,
  };

  const handleUpdateBuilding = (
    updates: Partial<ActivityWallBuildingConfig>
  ) => {
    onChange({
      ...globalConfig,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    } as unknown as Record<string, unknown>);
  };

  const IDENTIFICATION_OPTIONS: ActivityWallIdentificationMode[] = [
    'anonymous',
    'name',
    'pin',
    'name-pin',
  ];

  const MODE_OPTIONS: ActivityWallMode[] = ['text', 'photo'];

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-700">
            Default Activity Type
          </h3>
          <p className="text-xxs text-slate-500 mb-2">
            The mode new activities start with.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleUpdateBuilding({ defaultMode: mode })}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  currentBuildingConfig.defaultMode === mode
                    ? 'bg-brand-blue-primary border-brand-blue-primary text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {mode === 'text' ? 'Text (Word Cloud)' : 'Photo (Padlet)'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-700">
              Require Moderation by Default
            </span>
            <input
              type="checkbox"
              checked={currentBuildingConfig.defaultModerationEnabled ?? false}
              onChange={(event) =>
                handleUpdateBuilding({
                  defaultModerationEnabled: event.target.checked,
                })
              }
              className="h-4 w-4 accent-brand-blue-primary"
            />
          </label>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-bold text-slate-700">
            Default Participant Identification
          </label>
          <p className="text-xxs text-slate-500 mb-2">
            How students are identified when submitting.
          </p>
          <select
            value={
              currentBuildingConfig.defaultIdentificationMode ?? 'anonymous'
            }
            onChange={(event) =>
              handleUpdateBuilding({
                defaultIdentificationMode: event.target
                  .value as ActivityWallIdentificationMode,
              })
            }
            className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          >
            {IDENTIFICATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'name-pin'
                  ? 'Name & PIN'
                  : option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

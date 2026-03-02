import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { ExpectationsGlobalConfig, ExpectationsOptionOverride } from '@/types';
import { Toggle } from '../common/Toggle';
import {
  VOLUME_OPTIONS,
  GROUP_OPTIONS,
  INTERACTION_OPTIONS,
} from '@/config/expectationsData';

interface ExpectationsConfigurationPanelProps {
  config: ExpectationsGlobalConfig;
  onChange: (newConfig: ExpectationsGlobalConfig) => void;
}

export const ExpectationsConfigurationPanel: React.FC<
  ExpectationsConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingsConfig = config.buildings ?? {};
  const currentBuildingConfig = buildingsConfig[selectedBuildingId] ?? {
    volumeOverrides: {},
    groupOverrides: {},
    interactionOverrides: {},
  };

  const handleUpdateBuilding = (
    updates: Partial<typeof currentBuildingConfig>
  ) => {
    onChange({
      ...config,
      buildings: {
        ...buildingsConfig,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  interface OptionBase {
    id: string | number;
    label: string;
    sub?: string;
  }

  const renderOptionEditor = (
    title: string,
    options: OptionBase[],
    overrideMap: Record<string | number, ExpectationsOptionOverride> = {},
    onUpdateMap: (
      map: Record<string | number, ExpectationsOptionOverride>
    ) => void,
    hasSub: boolean
  ) => {
    return (
      <div className="space-y-3 mb-6">
        <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          {title}
        </h5>
        <div className="space-y-2">
          {options.map((opt) => {
            const override = overrideMap[opt.id] ?? { enabled: true };
            return (
              <div
                key={opt.id}
                className={`bg-white border rounded-lg p-3 flex items-center gap-4 transition-colors ${
                  override.enabled
                    ? 'border-slate-200'
                    : 'border-slate-100 opacity-60'
                }`}
              >
                <Toggle
                  checked={override.enabled}
                  onChange={(checked) =>
                    onUpdateMap({
                      ...overrideMap,
                      [opt.id]: { ...override, enabled: checked },
                    })
                  }
                  size="sm"
                />
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xxxs font-bold text-slate-400 uppercase mb-1 block">
                      Label (Default: {opt.label})
                    </label>
                    <input
                      type="text"
                      value={override.customLabel ?? ''}
                      onChange={(e) =>
                        onUpdateMap({
                          ...overrideMap,
                          [opt.id]: {
                            ...override,
                            customLabel: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder={opt.label}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                      disabled={!override.enabled}
                    />
                  </div>
                  {hasSub && (
                    <div>
                      <label className="text-xxxs font-bold text-slate-400 uppercase mb-1 block">
                        Subtext (Default: {opt.sub})
                      </label>
                      <input
                        type="text"
                        value={override.customSub ?? ''}
                        onChange={(e) =>
                          onUpdateMap({
                            ...overrideMap,
                            [opt.id]: {
                              ...override,
                              customSub: e.target.value || undefined,
                            },
                          })
                        }
                        placeholder={opt.sub}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                        disabled={!override.enabled}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
          Select Building to Configure
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

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        {renderOptionEditor(
          'Volume Options',
          VOLUME_OPTIONS as OptionBase[],
          currentBuildingConfig.volumeOverrides,
          (map) => handleUpdateBuilding({ volumeOverrides: map }),
          true
        )}

        {renderOptionEditor(
          'Group Options',
          GROUP_OPTIONS.filter((o) => o.id !== null) as OptionBase[],
          currentBuildingConfig.groupOverrides,
          (map) => handleUpdateBuilding({ groupOverrides: map }),
          false
        )}

        {renderOptionEditor(
          'Interaction Options',
          INTERACTION_OPTIONS.filter((o) => o.id !== null) as OptionBase[],
          currentBuildingConfig.interactionOverrides,
          (map) => handleUpdateBuilding({ interactionOverrides: map }),
          false
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
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
    showVolume: true,
    showGroup: true,
    showInteraction: true,
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
    icon?: React.ElementType;
  }

  const renderOptionEditor = (
    title: string,
    options: OptionBase[],
    overrideMap: Record<string | number, ExpectationsOptionOverride> = {},
    onUpdateMap: (
      map: Record<string | number, ExpectationsOptionOverride>
    ) => void,
    hasSub: boolean,
    categoryEnabled: boolean,
    onToggleCategory: (enabled: boolean) => void
  ) => {
    return (
      <div className="space-y-3 mb-8 last:mb-0">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">
            {title}
          </h5>
          <div className="flex items-center gap-2">
            <span className="text-xxxs font-black text-slate-400 uppercase">
              Enable Category
            </span>
            <Toggle
              checked={categoryEnabled}
              onChange={onToggleCategory}
              size="sm"
            />
          </div>
        </div>

        <div
          className={`space-y-2 transition-all duration-200 ${
            categoryEnabled
              ? 'opacity-100'
              : 'opacity-40 grayscale pointer-events-none'
          }`}
        >
          {options.map((opt) => {
            const override = overrideMap[opt.id] ?? { enabled: true };
            const Icon: React.ElementType | undefined = opt.icon;
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
                {Icon && (
                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-slate-500" />
                  </div>
                )}
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
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        {renderOptionEditor(
          'Volume Options',
          VOLUME_OPTIONS as OptionBase[],
          currentBuildingConfig.volumeOverrides,
          (map) => handleUpdateBuilding({ volumeOverrides: map }),
          true,
          currentBuildingConfig.showVolume ?? true,
          (enabled) => handleUpdateBuilding({ showVolume: enabled })
        )}

        {renderOptionEditor(
          'Group Options',
          GROUP_OPTIONS.filter((o) => o.id !== null) as OptionBase[],
          currentBuildingConfig.groupOverrides,
          (map) => handleUpdateBuilding({ groupOverrides: map }),
          false,
          currentBuildingConfig.showGroup ?? true,
          (enabled) => handleUpdateBuilding({ showGroup: enabled })
        )}

        {renderOptionEditor(
          'Interaction Options',
          INTERACTION_OPTIONS.filter((o) => o.id !== null) as OptionBase[],
          currentBuildingConfig.interactionOverrides,
          (map) => handleUpdateBuilding({ interactionOverrides: map }),
          false,
          currentBuildingConfig.showInteraction ?? true,
          (enabled) => handleUpdateBuilding({ showInteraction: enabled })
        )}
      </div>
    </div>
  );
};

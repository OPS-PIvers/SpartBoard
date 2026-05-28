import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  NumberLineGlobalConfig,
  BuildingNumberLineDefaults,
  NumberLineMode,
  GlobalFontFamily,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';

const FONT_FAMILY_OPTIONS: {
  value: 'global' | GlobalFontFamily;
  label: string;
}[] = [
  { value: 'global', label: 'Inherit (Dashboard default)' },
  { value: 'sans', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'handwritten', label: 'Handwritten' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'comic', label: 'Comic' },
  { value: 'slab', label: 'Slab Serif' },
  { value: 'retro', label: 'Retro' },
  { value: 'fun', label: 'Fun' },
  { value: 'marker', label: 'Marker' },
  { value: 'cursive', label: 'Cursive' },
];

const isValidHex = (color?: string): boolean =>
  typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);

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

        <div className="border-t border-slate-200 pt-4 space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">
            Appearance Defaults
          </h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Font Family
            </label>
            <select
              value={currentBuildingConfig.fontFamily ?? 'global'}
              onChange={(e) => {
                const selected = e.target.value;
                handleUpdateBuilding({
                  fontFamily:
                    selected === 'global'
                      ? undefined
                      : (selected as GlobalFontFamily),
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {FONT_FAMILY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Text Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={
                  isValidHex(currentBuildingConfig.fontColor)
                    ? currentBuildingConfig.fontColor
                    : '#334155'
                }
                onChange={(e) =>
                  handleUpdateBuilding({ fontColor: e.target.value })
                }
                className="w-10 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                aria-label="Pick default text color"
              />
              <input
                type="text"
                value={currentBuildingConfig.fontColor ?? ''}
                onChange={(e) =>
                  handleUpdateBuilding({
                    fontColor: e.target.value || undefined,
                  })
                }
                placeholder="#334155"
                className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {currentBuildingConfig.fontColor && (
                <button
                  type="button"
                  onClick={() => handleUpdateBuilding({ fontColor: undefined })}
                  className="text-xs text-slate-500 hover:text-red-500 font-semibold transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Surface Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={
                  isValidHex(currentBuildingConfig.cardColor)
                    ? currentBuildingConfig.cardColor
                    : '#ffffff'
                }
                onChange={(e) =>
                  handleUpdateBuilding({ cardColor: e.target.value })
                }
                className="w-10 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                aria-label="Pick default surface color"
              />
              <input
                type="text"
                value={currentBuildingConfig.cardColor ?? ''}
                onChange={(e) =>
                  handleUpdateBuilding({
                    cardColor: e.target.value || undefined,
                  })
                }
                placeholder="#ffffff"
                className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {currentBuildingConfig.cardColor && (
                <button
                  type="button"
                  onClick={() => handleUpdateBuilding({ cardColor: undefined })}
                  className="text-xs text-slate-500 hover:text-red-500 font-semibold transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Surface Opacity (
              {Math.round((currentBuildingConfig.cardOpacity ?? 1) * 100)}%)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentBuildingConfig.cardOpacity ?? 1}
              onChange={(e) =>
                handleUpdateBuilding({
                  cardOpacity: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600"
              aria-label="Default surface opacity"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

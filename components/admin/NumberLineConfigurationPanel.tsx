import React, { useState } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  NumberLineGlobalConfig,
  BuildingNumberLineDefaults,
  NumberLineMode,
  GlobalFontFamily,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';

/**
 * Hex color text input with debounced commit. Keeps user keystrokes in
 * local state and only writes the (validated, non-empty) value back to
 * the parent's Firestore-backed config on blur — without this, every
 * character of "#334155" would trigger a Firestore write AND persist
 * intermediate invalid values ("#3", "#33", ...) that the validator
 * downstream then has to defensively paper over. Cost-conscious for
 * school-district Firestore budgets.
 */
const HexColorTextInput: React.FC<{
  value: string | undefined;
  onCommit: (next: string | undefined) => void;
  placeholder: string;
  className: string;
}> = ({ value, onCommit, placeholder, className }) => {
  const [draft, setDraft] = useState(value ?? '');
  // Resync when the committed value changes externally (e.g. the color
  // picker writes a new value, or the admin switches buildings). Uses
  // the "adjust state during render" pattern with useState rather than
  // useEffect (extra commit) or useRef (react-hooks/refs lint).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value ?? '');
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        onCommit(trimmed === '' ? undefined : trimmed);
      }}
      placeholder={placeholder}
      className={className}
    />
  );
};

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

// Accept the three CSS-valid hex forms an HTML color picker / Tailwind
// palette may emit: 3-digit shortform, 6-digit standard, 8-digit alpha.
// Matches the server-side `isHexColor` validator in
// `utils/adminBuildingConfig.ts` so the panel and validator agree on
// what counts as a valid persistable color.
const isValidHex = (color?: string): boolean =>
  typeof color === 'string' &&
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color);

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
              <HexColorTextInput
                value={currentBuildingConfig.fontColor}
                onCommit={(next) => handleUpdateBuilding({ fontColor: next })}
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
              <HexColorTextInput
                value={currentBuildingConfig.cardColor}
                onCommit={(next) => handleUpdateBuilding({ cardColor: next })}
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

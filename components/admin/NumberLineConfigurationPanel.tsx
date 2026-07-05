import React, { useState } from 'react';
import { Plus, X, ArrowRightCircle } from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  NumberLineGlobalConfig,
  BuildingNumberLineDefaults,
  NumberLineMode,
  NumberLineMarker,
  NumberLineJump,
  GlobalFontFamily,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { GLOBAL_FONT_FAMILY_OPTIONS } from '@/config/fonts';
import { WIDGET_PALETTE } from '@/config/colors';

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
        // Validate on blur: empty → clear the field; valid hex → commit;
        // invalid (e.g. `#banana`, `#12`, `notahex`) → revert the draft
        // to the previously committed value rather than persisting
        // garbage that the server validator would otherwise pass through
        // and downstream consumers would have to defensively re-validate.
        if (trimmed === '') {
          onCommit(undefined);
        } else if (isValidHex(trimmed)) {
          onCommit(trimmed);
        } else {
          setDraft(value ?? '');
        }
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
  ...GLOBAL_FONT_FAMILY_OPTIONS,
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

  const markers = currentBuildingConfig.markers ?? [];
  const jumps = currentBuildingConfig.jumps ?? [];

  // Add-marker / add-jump form state (mirrors the user-level NumberLine
  // Settings panel so admins build defaults the same way teachers do).
  const [newMarkerValue, setNewMarkerValue] = useState(0);
  const [newMarkerLabel, setNewMarkerLabel] = useState('');
  const [newJumpStart, setNewJumpStart] = useState(0);
  const [newJumpEnd, setNewJumpEnd] = useState(5);
  const [newJumpLabel, setNewJumpLabel] = useState('+5');

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

  const handleAddMarker = () => {
    const marker: NumberLineMarker = {
      id: crypto.randomUUID(),
      value: newMarkerValue,
      color: WIDGET_PALETTE[markers.length % WIDGET_PALETTE.length],
    };
    const trimmedLabel = newMarkerLabel.trim();
    if (trimmedLabel) marker.label = trimmedLabel;
    handleUpdateBuilding({ markers: [...markers, marker] });
    setNewMarkerValue(0);
    setNewMarkerLabel('');
  };

  const handleAddJump = () => {
    const jump: NumberLineJump = {
      id: crypto.randomUUID(),
      startValue: newJumpStart,
      endValue: newJumpEnd,
    };
    const trimmedLabel = newJumpLabel.trim();
    if (trimmedLabel) jump.label = trimmedLabel;
    handleUpdateBuilding({ jumps: [...jumps, jump] });
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
          <div>
            <h4 className="text-sm font-semibold text-slate-700">
              Default Markers
            </h4>
            <p className="text-xs text-slate-500">
              Benchmark values labelled on new number lines (e.g. curriculum
              targets). Teachers can still edit or remove them.
            </p>
          </div>

          <div className="flex gap-2 items-end bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Value
              </label>
              <input
                type="number"
                value={newMarkerValue}
                onChange={(e) =>
                  setNewMarkerValue(parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Label
              </label>
              <input
                type="text"
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                placeholder="e.g. Start"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleAddMarker}
              aria-label="Add default marker"
              title="Add default marker"
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {markers.length === 0 && (
              <div className="text-center text-slate-400 text-xs py-1 italic">
                No default markers.
              </div>
            )}
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="flex items-center gap-3 bg-white border border-slate-200 p-2 rounded-lg"
              >
                <input
                  type="color"
                  value={marker.color}
                  onChange={(e) =>
                    handleUpdateBuilding({
                      markers: markers.map((m) =>
                        m.id === marker.id ? { ...m, color: e.target.value } : m
                      ),
                    })
                  }
                  className="w-6 h-6 border-0 p-0 cursor-pointer"
                  aria-label={`Marker ${marker.value} color`}
                />
                <div className="flex-1 font-mono font-bold text-slate-700">
                  {marker.value}
                </div>
                <div className="flex-1 text-slate-500 text-sm">
                  {marker.label}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateBuilding({
                      markers: markers.filter((m) => m.id !== marker.id),
                    })
                  }
                  aria-label="Remove default marker"
                  title="Remove default marker"
                  className="text-slate-400 hover:text-red-500 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">
              Default Jumps
            </h4>
            <p className="text-xs text-slate-500">
              Skip-counting arcs shown on new number lines (e.g. counting by
              5s). Teachers can still edit or remove them.
            </p>
          </div>

          <div className="flex gap-2 items-end bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="w-20">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Start
              </label>
              <input
                type="number"
                value={newJumpStart}
                onChange={(e) =>
                  setNewJumpStart(parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                End
              </label>
              <input
                type="number"
                value={newJumpEnd}
                onChange={(e) => setNewJumpEnd(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Label
              </label>
              <input
                type="text"
                value={newJumpLabel}
                onChange={(e) => setNewJumpLabel(e.target.value)}
                placeholder="+5"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleAddJump}
              aria-label="Add default jump"
              title="Add default jump"
              className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {jumps.length === 0 && (
              <div className="text-center text-slate-400 text-xs py-1 italic">
                No default jumps.
              </div>
            )}
            {jumps.map((jump) => (
              <div
                key={jump.id}
                className="flex items-center gap-3 bg-white border border-slate-200 p-2 rounded-lg text-sm"
              >
                <div className="flex-1 font-mono text-slate-600">
                  {jump.startValue}{' '}
                  <ArrowRightCircle className="inline w-3 h-3 mx-1 text-slate-300" />{' '}
                  {jump.endValue}
                </div>
                <div className="flex-1 font-bold text-slate-700">
                  {jump.label}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateBuilding({
                      jumps: jumps.filter((j) => j.id !== jump.id),
                    })
                  }
                  aria-label="Remove default jump"
                  title="Remove default jump"
                  className="text-slate-400 hover:text-red-500 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
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

import React, { useId } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { TimeToolGlobalConfig, BuildingTimeToolDefaults } from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { Card } from '@/components/common/Card';
import { WIDGET_PALETTE } from '@/config/colors';
import { FONTS } from '@/config/fonts';
import {
  TIME_TOOL_MODES,
  TIME_TOOL_VISUAL_TYPES,
  TIME_TOOL_SOUNDS,
  TIME_TOOL_CLOCK_STYLES,
  TIME_TOOL_MAX_DURATION_SECONDS,
  type TimeToolMode,
  type TimeToolVisualType,
  type TimeToolClockStyle,
} from '@/config/timeTool';

interface TimeToolConfigurationPanelProps {
  config: TimeToolGlobalConfig;
  onChange: (newConfig: TimeToolGlobalConfig) => void;
}

const TRAFFIC_COLORS = [
  { value: null, label: 'None' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'red', label: 'Red' },
] as const;

const COLOR_CLASSES: Record<string, string> = {
  green: 'bg-green-500 text-white border-green-500',
  yellow: 'bg-yellow-400 text-white border-yellow-400',
  red: 'bg-red-500 text-white border-red-500',
};

// Labelled option lists derived from the shared canonical value sets so a new
// mode/style added in config/timeTool.ts surfaces here automatically.
const MODE_LABELS: Record<TimeToolMode, string> = {
  timer: 'Timer',
  stopwatch: 'Stopwatch',
};
const MODES = TIME_TOOL_MODES.map((value) => ({
  value,
  label: MODE_LABELS[value],
}));

const VISUAL_TYPE_LABELS: Record<TimeToolVisualType, string> = {
  digital: 'Digital',
  visual: 'Visual Ring',
};
const VISUAL_TYPES = TIME_TOOL_VISUAL_TYPES.map((value) => ({
  value,
  label: VISUAL_TYPE_LABELS[value],
}));

const SOUNDS = TIME_TOOL_SOUNDS;

const CLOCK_STYLE_LABELS: Record<TimeToolClockStyle, string> = {
  modern: 'Modern',
  lcd: 'LCD',
  minimal: 'Minimal',
};
const CLOCK_STYLES = TIME_TOOL_CLOCK_STYLES.map((value) => ({
  value,
  label: CLOCK_STYLE_LABELS[value],
}));

const pillClasses = (active: boolean) =>
  `flex-1 py-1.5 text-xxs font-bold rounded-lg border transition-colors ${
    active
      ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
  }`;

export const TimeToolConfigurationPanel: React.FC<
  TimeToolConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const accentColorLabelId = useId();
  const trafficLightColorLabelId = useId();
  const defaultDurationLabelId = useId();
  const defaultModeLabelId = useId();
  const displayStyleLabelId = useId();
  const numberStyleLabelId = useId();
  const defaultAlertSoundLabelId = useId();
  const defaultFontSelectId = useId();

  // useAdminBuildings() can return a legacy long-form id; key buildingDefaults off the canonical id.
  const canonicalId = canonicalBuildingId(selectedBuildingId);

  const buildingDefaults = canonicalizeBuildingKeyedRecord(
    config.buildingDefaults ?? {}
  );
  const currentBuildingConfig: BuildingTimeToolDefaults = buildingDefaults[
    canonicalId
  ] ?? {
    buildingId: canonicalId,
  };
  const hasThemeColorSelected = WIDGET_PALETTE.some(
    (c) => c === currentBuildingConfig.themeColor
  );

  const handleUpdateBuilding = (updates: Partial<BuildingTimeToolDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [canonicalId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  const durationSeconds = currentBuildingConfig.duration ?? 600;
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainingSeconds = durationSeconds % 60;

  const handleDurationChange = (minutes: number, seconds: number) => {
    // Clamp to the shared ceiling: the minutes <input> only advises max via
    // HTML, so keyboard entry above it would otherwise persist a value the
    // validator later clamps — making the saved field re-display differently.
    const total = Math.min(
      TIME_TOOL_MAX_DURATION_SECONDS,
      Math.max(0, minutes * 60 + seconds)
    );
    handleUpdateBuilding({ duration: total });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <SettingsLabel>Configure Building Timer Defaults</SettingsLabel>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        {/* Default Duration */}
        <div>
          <SettingsLabel as="span" id={defaultDurationLabelId} className="mb-1">
            Default Timer Duration
          </SettingsLabel>
          <div
            className="flex items-center gap-2"
            role="group"
            aria-labelledby={defaultDurationLabelId}
          >
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="999"
                value={durationMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  handleDurationChange(
                    isNaN(val) ? 0 : val,
                    durationRemainingSeconds
                  );
                }}
                className="w-16 px-2 py-1.5 text-xs text-center border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
              />
              <span className="text-xxs text-slate-500 font-bold">min</span>
            </div>
            <span className="text-slate-400">:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="59"
                value={durationRemainingSeconds}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  handleDurationChange(
                    durationMinutes,
                    isNaN(val) ? 0 : Math.min(59, val)
                  );
                }}
                className="w-16 px-2 py-1.5 text-xs text-center border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
              />
              <span className="text-xxs text-slate-500 font-bold">sec</span>
            </div>
            <span className="text-xxs text-slate-400 ml-1">
              ({durationSeconds}s total)
            </span>
          </div>
        </div>

        {/* Default Mode */}
        <div>
          <SettingsLabel as="span" id={defaultModeLabelId} className="mb-1">
            Default Mode
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={defaultModeLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, MODES, ({ value }) =>
                handleUpdateBuilding({ mode: value })
              )
            }
          >
            {MODES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={(currentBuildingConfig.mode ?? 'timer') === value}
                tabIndex={
                  (currentBuildingConfig.mode ?? 'timer') === value ? 0 : -1
                }
                onClick={() => handleUpdateBuilding({ mode: value })}
                className={pillClasses(
                  (currentBuildingConfig.mode ?? 'timer') === value
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Display Style */}
        <div>
          <SettingsLabel as="span" id={displayStyleLabelId} className="mb-1">
            Display Style
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={displayStyleLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, VISUAL_TYPES, ({ value }) =>
                handleUpdateBuilding({ visualType: value })
              )
            }
          >
            {VISUAL_TYPES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={
                  (currentBuildingConfig.visualType ?? 'digital') === value
                }
                tabIndex={
                  (currentBuildingConfig.visualType ?? 'digital') === value
                    ? 0
                    : -1
                }
                onClick={() => handleUpdateBuilding({ visualType: value })}
                className={pillClasses(
                  (currentBuildingConfig.visualType ?? 'digital') === value
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Number Style */}
        <div>
          <SettingsLabel as="span" id={numberStyleLabelId} className="mb-1">
            Number Style
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={numberStyleLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, CLOCK_STYLES, ({ value }) =>
                handleUpdateBuilding({ clockStyle: value })
              )
            }
          >
            {CLOCK_STYLES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={
                  (currentBuildingConfig.clockStyle ?? 'modern') === value
                }
                tabIndex={
                  (currentBuildingConfig.clockStyle ?? 'modern') === value
                    ? 0
                    : -1
                }
                onClick={() => handleUpdateBuilding({ clockStyle: value })}
                className={pillClasses(
                  (currentBuildingConfig.clockStyle ?? 'modern') === value
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Alert Sound */}
        <div>
          <SettingsLabel
            as="span"
            id={defaultAlertSoundLabelId}
            className="mb-1"
          >
            Default Alert Sound
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={defaultAlertSoundLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, SOUNDS, (sound) =>
                handleUpdateBuilding({ selectedSound: sound })
              )
            }
          >
            {SOUNDS.map((sound) => (
              <button
                key={sound}
                role="radio"
                aria-checked={
                  (currentBuildingConfig.selectedSound ?? 'Gong') === sound
                }
                tabIndex={
                  (currentBuildingConfig.selectedSound ?? 'Gong') === sound
                    ? 0
                    : -1
                }
                onClick={() => handleUpdateBuilding({ selectedSound: sound })}
                className={pillClasses(
                  (currentBuildingConfig.selectedSound ?? 'Gong') === sound
                )}
              >
                {sound}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Color & Glow */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            <SettingsLabel as="span" id={accentColorLabelId} className="mb-1">
              Accent Color
            </SettingsLabel>
            <div
              className="flex gap-1.5"
              role="radiogroup"
              aria-labelledby={accentColorLabelId}
              onKeyDown={(e) =>
                handleRadioGroupKeyDown(e, WIDGET_PALETTE, (color) =>
                  handleUpdateBuilding({ themeColor: color })
                )
              }
            >
              {WIDGET_PALETTE.map((color, idx) => {
                const checked = currentBuildingConfig.themeColor === color;
                const tabbable =
                  checked || (!hasThemeColorSelected && idx === 0);
                return (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={checked}
                    tabIndex={tabbable ? 0 : -1}
                    onClick={() => handleUpdateBuilding({ themeColor: color })}
                    aria-label={`Accent color ${color}`}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      checked
                        ? 'border-slate-800 scale-110 shadow-md'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>
            {currentBuildingConfig.themeColor && (
              <button
                onClick={() => handleUpdateBuilding({ themeColor: undefined })}
                className="mt-1.5 text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
              >
                Clear accent color
              </button>
            )}
          </div>
          <button
            onClick={() =>
              handleUpdateBuilding({ glow: !currentBuildingConfig.glow })
            }
            className={`px-3 py-1.5 text-xxs font-bold rounded-lg border transition-colors ${
              currentBuildingConfig.glow
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Glow
          </button>
        </div>

        {/* Font Family */}
        <div>
          <SettingsLabel className="mb-1" htmlFor={defaultFontSelectId}>
            Default Font
          </SettingsLabel>
          <select
            id={defaultFontSelectId}
            value={currentBuildingConfig.fontFamily ?? 'global'}
            onChange={(e) =>
              handleUpdateBuilding({
                fontFamily:
                  e.target.value === 'global' ? undefined : e.target.value,
              })
            }
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id === 'global'
                  ? 'Global (Dashboard default)'
                  : `${f.label} (${f.icon})`}
              </option>
            ))}
          </select>
        </div>

        {/* Timer End Traffic Light Color */}
        <div>
          <SettingsLabel
            as="span"
            id={trafficLightColorLabelId}
            className="mb-1"
          >
            Timer-End Traffic Light Color
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={trafficLightColorLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, TRAFFIC_COLORS, ({ value }) =>
                handleUpdateBuilding({ timerEndTrafficColor: value })
              )
            }
          >
            {TRAFFIC_COLORS.map(({ value, label }) => {
              const checked =
                (currentBuildingConfig.timerEndTrafficColor ?? null) === value;
              return (
                <button
                  key={String(value)}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() =>
                    handleUpdateBuilding({ timerEndTrafficColor: value })
                  }
                  className={`flex-1 py-1.5 text-xxs font-bold rounded-lg border transition-colors ${
                    checked
                      ? value
                        ? COLOR_CLASSES[value]
                        : 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <SettingsLabel>When the timer ends</SettingsLabel>

      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p
            id="time-tool-trigger-random-label"
            className="font-medium text-slate-800"
          >
            Auto-Pick Random Student
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-labelledby="time-tool-trigger-random-label"
            checked={currentBuildingConfig.timerEndTriggerRandom ?? false}
            onChange={(e) =>
              handleUpdateBuilding({ timerEndTriggerRandom: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p
            id="time-tool-trigger-nextup-label"
            className="font-medium text-slate-800"
          >
            Auto-Advance Next Up Queue
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-labelledby="time-tool-trigger-nextup-label"
            checked={currentBuildingConfig.timerEndTriggerNextUp ?? false}
            onChange={(e) =>
              handleUpdateBuilding({ timerEndTriggerNextUp: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between pb-2">
        <div>
          <p
            id="time-tool-trigger-stations-label"
            className="font-medium text-slate-800"
          >
            Auto-Rotate Stations
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-labelledby="time-tool-trigger-stations-label"
            checked={
              currentBuildingConfig.timerEndTriggerStationsRotate ?? false
            }
            onChange={(e) =>
              handleUpdateBuilding({
                timerEndTriggerStationsRotate: e.target.checked,
              })
            }
          />
        </div>
      </div>
    </div>
  );
};

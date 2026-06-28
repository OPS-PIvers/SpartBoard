import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { TimeToolGlobalConfig, BuildingTimeToolDefaults } from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Card } from '@/components/common/Card';
import { WIDGET_PALETTE } from '@/config/colors';
import { FONTS } from '@/config/fonts';
import {
  TIME_TOOL_MODES,
  TIME_TOOL_VISUAL_TYPES,
  TIME_TOOL_SOUNDS,
  TIME_TOOL_CLOCK_STYLES,
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

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingTimeToolDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingTimeToolDefaults>) => {
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

  const durationSeconds = currentBuildingConfig.duration ?? 600;
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainingSeconds = durationSeconds % 60;

  const handleDurationChange = (minutes: number, seconds: number) => {
    const total = Math.max(0, minutes * 60 + seconds);
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
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Timer widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Duration */}
        <div>
          <SettingsLabel className="mb-1">Default Timer Duration</SettingsLabel>
          <div className="flex items-center gap-2">
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
          <SettingsLabel className="mb-1">Default Mode</SettingsLabel>
          <div className="flex gap-1.5">
            {MODES.map(({ value, label }) => (
              <button
                key={value}
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
          <SettingsLabel className="mb-1">Display Style</SettingsLabel>
          <div className="flex gap-1.5">
            {VISUAL_TYPES.map(({ value, label }) => (
              <button
                key={value}
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
          <SettingsLabel className="mb-1">Number Style</SettingsLabel>
          <div className="flex gap-1.5">
            {CLOCK_STYLES.map(({ value, label }) => (
              <button
                key={value}
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
          <SettingsLabel className="mb-1">Default Alert Sound</SettingsLabel>
          <div className="flex gap-1.5">
            {SOUNDS.map((sound) => (
              <button
                key={sound}
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
            <SettingsLabel className="mb-1">Accent Color</SettingsLabel>
            <div className="flex gap-1.5">
              {WIDGET_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => handleUpdateBuilding({ themeColor: color })}
                  aria-label={`Accent color ${color}`}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    currentBuildingConfig.themeColor === color
                      ? 'border-slate-800 scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
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
          <SettingsLabel className="mb-1">Default Font</SettingsLabel>
          <select
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
          <SettingsLabel className="mb-1">
            Timer-End Traffic Light Color
          </SettingsLabel>
          <p className="text-xxs text-slate-400 mb-2 leading-tight">
            Automatically sets the traffic light widget to this color when the
            timer reaches zero.
          </p>
          <div className="flex gap-1.5">
            {TRAFFIC_COLORS.map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() =>
                  handleUpdateBuilding({ timerEndTrafficColor: value })
                }
                className={`flex-1 py-1.5 text-xxs font-bold rounded-lg border transition-colors ${
                  (currentBuildingConfig.timerEndTrafficColor ?? null) === value
                    ? value
                      ? COLOR_CLASSES[value]
                      : 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="font-medium text-slate-800">Auto-Pick Random Student</p>
          <p className="text-sm text-slate-500">
            Pick a random student when the timer ends.
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={currentBuildingConfig.timerEndTriggerRandom ?? false}
            onChange={(e) =>
              handleUpdateBuilding({ timerEndTriggerRandom: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="font-medium text-slate-800">
            Auto-Advance Next Up Queue
          </p>
          <p className="text-sm text-slate-500">
            Advance to the next student in the queue when the timer ends.
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={currentBuildingConfig.timerEndTriggerNextUp ?? false}
            onChange={(e) =>
              handleUpdateBuilding({ timerEndTriggerNextUp: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between pb-2">
        <div>
          <p className="font-medium text-slate-800">Auto-Rotate Stations</p>
          <p className="text-sm text-slate-500">
            Rotate the first Stations widget when the timer ends.
          </p>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
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

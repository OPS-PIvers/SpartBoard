import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { TimeToolGlobalConfig, BuildingTimeToolDefaults } from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';

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

export const TimeToolConfigurationPanel: React.FC<
  TimeToolConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

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

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
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
      </div>

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

      <div className="flex items-center justify-between pb-2">
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
    </div>
  );
};

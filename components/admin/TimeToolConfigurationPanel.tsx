import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { TimeToolGlobalConfig, BuildingTimeToolDefaults } from '@/types';

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
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Timer Defaults
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

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Timer widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default Duration */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Timer Duration
          </label>
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
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Timer-End Traffic Light Color
          </label>
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
    </div>
  );
};

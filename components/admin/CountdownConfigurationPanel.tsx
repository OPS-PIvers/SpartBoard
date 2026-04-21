import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { CountdownGlobalConfig, BuildingCountdownDefaults } from '@/types';
import { Toggle } from '@/components/common/Toggle';

interface CountdownConfigurationPanelProps {
  config: CountdownGlobalConfig;
  onChange: (newConfig: CountdownGlobalConfig) => void;
}

export const CountdownConfigurationPanel: React.FC<
  CountdownConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingCountdownDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingCountdownDefaults>
  ) => {
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

  const parseLocalDateInput = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [, yearString, monthString, dayString] = match;
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(year, month - 1, day, 12);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  };

  // Convert stored date values to YYYY-MM-DD for date inputs using local time
  const formatDateForInput = (storedValue?: string) => {
    if (!storedValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(storedValue)) return storedValue;
    const date = new Date(storedValue);
    if (Number.isNaN(date.getTime())) return '';
    return storedValue.split('T')[0];
  };

  const handleDateChange = (
    field: 'startDate' | 'eventDate',
    value: string
  ) => {
    if (!value) {
      handleUpdateBuilding(
        field === 'startDate'
          ? { startDate: undefined }
          : { eventDate: undefined }
      );
      return;
    }

    const date = parseLocalDateInput(value);
    if (!date) return;

    handleUpdateBuilding(
      field === 'startDate'
        ? { startDate: date.toISOString() }
        : { eventDate: date.toISOString() }
    );
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-5">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-2">
          Countdown Settings
        </h3>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Event Title
          </label>
          <input
            type="text"
            value={currentBuildingConfig.title ?? ''}
            onChange={(e) => handleUpdateBuilding({ title: e.target.value })}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold"
            placeholder="e.g. Summer Break"
          />
        </div>

        <div className="flex space-x-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
              Start Date
            </label>
            <input
              type="date"
              value={formatDateForInput(currentBuildingConfig.startDate)}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold bg-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
              Event Date
            </label>
            <input
              type="date"
              value={formatDateForInput(currentBuildingConfig.eventDate)}
              onChange={(e) => handleDateChange('eventDate', e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            View Mode
          </label>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleUpdateBuilding({ viewMode: 'number' })}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                currentBuildingConfig.viewMode === 'number' ||
                !currentBuildingConfig.viewMode
                  ? 'bg-brand-blue-primary text-white shadow'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Number
            </button>
            <button
              onClick={() => handleUpdateBuilding({ viewMode: 'grid' })}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                currentBuildingConfig.viewMode === 'grid'
                  ? 'bg-brand-blue-primary text-white shadow'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-bold text-slate-700 cursor-pointer text-left"
              onClick={() =>
                handleUpdateBuilding({
                  includeWeekends: !(
                    currentBuildingConfig.includeWeekends ?? true
                  ),
                })
              }
            >
              Include weekends
            </button>
            <Toggle
              checked={currentBuildingConfig.includeWeekends ?? true}
              onChange={(checked) =>
                handleUpdateBuilding({ includeWeekends: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-bold text-slate-700 cursor-pointer text-left"
              onClick={() =>
                handleUpdateBuilding({
                  countToday: !(currentBuildingConfig.countToday ?? false),
                })
              }
            >
              Count today
            </button>
            <Toggle
              checked={currentBuildingConfig.countToday ?? false}
              onChange={(checked) =>
                handleUpdateBuilding({ countToday: checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

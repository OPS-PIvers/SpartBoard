import React, { useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, CountdownConfig, CountdownGlobalConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { CalendarDays } from 'lucide-react';

export const CountdownSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { featurePermissions, selectedBuildings } = useAuth();
  const config = widget.config as CountdownConfig;

  const update = (updates: Partial<CountdownConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const formatLocalDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
  const formatDateForInput = (storedValue: string) => {
    if (!storedValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(storedValue)) return storedValue;
    const date = new Date(storedValue);
    if (Number.isNaN(date.getTime())) return '';
    return formatLocalDateForInput(date);
  };

  const handleDateChange = (
    field: 'startDate' | 'eventDate',
    value: string
  ) => {
    if (!value) return;
    const date = parseLocalDateInput(value);
    if (!date) return;

    update(
      field === 'startDate'
        ? { startDate: date.toISOString() }
        : { eventDate: date.toISOString() }
    );
  };

  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'countdown');
    return perm?.config as CountdownGlobalConfig | undefined;
  }, [featurePermissions]);

  const buildingId = selectedBuildings[0];
  const buildingConfig = buildingId
    ? globalConfig?.buildingDefaults?.[buildingId]
    : undefined;
  const predefinedEvents = buildingConfig?.events ?? [];

  return (
    <div className="p-4 space-y-4">
      {predefinedEvents.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          <label className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-brand-blue-primary" />
            Import Pre-defined Event
          </label>
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none bg-white text-slate-700"
            onChange={(e) => {
              if (!e.target.value) return;
              const selectedEvent = predefinedEvents.find(
                (ev) => ev.id === e.target.value
              );
              if (selectedEvent) {
                update({
                  title: selectedEvent.title,
                  eventDate: selectedEvent.date,
                });
              }
              // Reset selection to allow re-importing the same event later if needed
              e.target.value = '';
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Select an event...
            </option>
            {predefinedEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} (
                {new Date(ev.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                )
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Event Title
        </label>
        <input
          type="text"
          value={config.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          placeholder="e.g. Summer Break"
        />
      </div>

      <div className="flex space-x-2">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Start Date
          </label>
          <input
            type="date"
            value={formatDateForInput(config.startDate)}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Event Date
          </label>
          <input
            type="date"
            value={formatDateForInput(config.eventDate)}
            onChange={(e) => handleDateChange('eventDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
          View Mode
        </label>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => update({ viewMode: 'number' })}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              config.viewMode === 'number'
                ? 'bg-white shadow text-brand-blue-primary'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Number
          </button>
          <button
            onClick={() => update({ viewMode: 'grid' })}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              config.viewMode === 'grid'
                ? 'bg-white shadow text-brand-blue-primary'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Grid
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-slate-700 font-medium cursor-pointer text-left"
            onClick={() => update({ includeWeekends: !config.includeWeekends })}
          >
            Include weekends
          </button>
          <Toggle
            checked={config.includeWeekends}
            onChange={(checked) => update({ includeWeekends: checked })}
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-slate-700 font-medium cursor-pointer text-left"
            onClick={() => update({ countToday: !config.countToday })}
          >
            Count today
          </button>
          <Toggle
            checked={config.countToday}
            onChange={(checked) => update({ countToday: checked })}
          />
        </div>
      </div>
    </div>
  );
};

export default CountdownSettings;

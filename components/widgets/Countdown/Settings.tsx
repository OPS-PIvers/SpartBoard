import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, CountdownConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';

export const CountdownSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
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

  return (
    <div className="p-4 space-y-4">
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

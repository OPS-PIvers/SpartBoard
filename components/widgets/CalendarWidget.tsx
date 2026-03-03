import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../../context/useDashboard';
import { WidgetData, CalendarConfig, CalendarGlobalConfig } from '../../types';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Settings2,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { WidgetLayout } from './WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';
import { Toggle } from '../common/Toggle';

const GAP_STYLE = 'min(10px, 2cqmin)';

export const CalendarWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { selectedBuildings } = useAuth();
  const { subscribeToPermission } = useFeaturePermissions();
  const config = widget.config as CalendarConfig;
  const localEvents = useMemo(() => config.events ?? [], [config.events]);
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );

  // 1. Subscribe to Global Admin Config (Proxy Source)
  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  // Combined events for display (Local + Building Synced from Proxy)
  const { displayEvents, lastSyncAt } = useMemo(() => {
    const buildingId = selectedBuildings?.[0];
    const buildingDefaults = buildingId
      ? globalConfig?.buildingDefaults?.[buildingId]
      : null;

    const proxiedEvents = isBuildingSyncEnabled
      ? (buildingDefaults?.cachedEvents ?? [])
      : [];

    const staticEvents = isBuildingSyncEnabled
      ? (buildingDefaults?.events ?? [])
      : [];

    // Merge local, building static, and building proxied events
    const combined = [...localEvents, ...staticEvents, ...proxiedEvents];

    // Deduplicate by date + title
    const seen = new Set<string>();
    const unique = combined.filter((e) => {
      const key = `${e.date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sorted = unique.sort((a, b) => a.date.localeCompare(b.date));

    // Filter by daysVisible if set
    const daysVisible = config.daysVisible ?? 5;
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const futureLimit = new Date(today);
    futureLimit.setDate(today.getDate() + daysVisible);

    const filtered = sorted.filter((event) => {
      if (event.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const eventDate = new Date(event.date + 'T00:00:00');
        // Include events from today through future limit
        return eventDate >= today && eventDate < futureLimit;
      }
      return true;
    });

    return {
      displayEvents: filtered,
      lastSyncAt: buildingDefaults?.lastProxySync,
    };
  }, [
    localEvents,
    globalConfig,
    isBuildingSyncEnabled,
    selectedBuildings,
    config.daysVisible,
  ]);

  // Blocked Date logic
  const isBlocked = useMemo(() => {
    if (!isBuildingSyncEnabled) return false;
    const today = new Date().toISOString().split('T')[0];
    return globalConfig?.blockedDates?.includes(today);
  }, [isBuildingSyncEnabled, globalConfig]);

  if (isBlocked) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-rose-50/30">
            <Ban className="w-12 h-12 text-rose-400 mb-2 animate-pulse" />
            <p className="text-xs font-black uppercase text-rose-500 tracking-widest">
              Calendar Blocked
            </p>
            <p className="text-[10px] text-rose-400 font-medium mt-1 leading-tight">
              A district-wide blocked date is active today.
            </p>
          </div>
        }
      />
    );
  }

  // Common height for exactly 4 cards: (100% - 3 gaps) / 4
  const rowHeight = `calc((100% - 3 * ${GAP_STYLE}) / 4)`;

  return (
    <WidgetLayout
      padding="p-0"
      header={
        lastSyncAt && (
          <div
            className="flex items-center justify-center gap-1.5 py-1 px-2 bg-slate-50 border-b border-slate-100"
            style={{ fontSize: 'min(9px, 2.5cqmin)' }}
          >
            <RefreshCw
              className="text-slate-400"
              style={{
                width: 'min(10px, 2.5cqmin)',
                height: 'min(10px, 2.5cqmin)',
              }}
            />
            <span className="text-slate-400 font-bold uppercase tracking-tighter">
              Synced{' '}
              {new Date(lastSyncAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )
      }
      content={
        <div
          className="h-full w-full flex flex-col overflow-hidden"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          <div
            className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0 snap-y snap-mandatory"
            style={{
              gap: GAP_STYLE,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {displayEvents.map((event, idx) => {
              const today = new Date().toISOString().split('T')[0];
              const isToday = event.date === today;

              return (
                <div
                  key={`${event.date}-${event.title}-${idx}`}
                  className={`w-full flex flex-col justify-center px-4 rounded-2xl transition-all relative shrink-0 snap-start ${
                    isToday
                      ? 'bg-brand-blue-lighter/50 border-[min(6px,1.5cqmin)] border-brand-blue-primary shadow-md z-10'
                      : 'bg-white border border-slate-200 shadow-sm'
                  }`}
                  style={{
                    height: rowHeight,
                    flex: `0 0 ${rowHeight}`,
                  }}
                >
                  {isToday && (
                    <div
                      className="absolute top-0 right-0 bg-brand-blue-primary text-white font-black uppercase tracking-widest px-2 py-1 rounded-bl-xl z-20"
                      style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                    >
                      Now
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span
                      className="font-black text-slate-400 uppercase tracking-widest"
                      style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                    >
                      {isToday ? 'Today' : event.date}
                    </span>
                    <span
                      className="font-black text-slate-800 truncate leading-tight mt-0.5"
                      style={{ fontSize: 'min(16px, 4cqmin)' }}
                    >
                      {event.title}
                    </span>
                  </div>
                </div>
              );
            })}

            {displayEvents.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <ScaledEmptyState
                  icon={CalendarIcon}
                  title="No Events"
                  subtitle={
                    isBuildingSyncEnabled
                      ? 'Nothing scheduled for the next few days.'
                      : 'Flip to manage calendar settings.'
                  }
                  className="opacity-40"
                />
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};

export const CalendarSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as CalendarConfig;
  const events = config.events ?? [];
  const daysVisible = config.daysVisible ?? 5;

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addEvent = () => {
    if (newTitle && newDate) {
      updateWidget(widget.id, {
        config: {
          ...config,
          events: [...events, { title: newTitle, date: newDate }],
        } as CalendarConfig,
      });
      setNewTitle('');
      setNewDate('');
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Plus className="w-3 h-3" /> Quick Add
        </label>
        {isAdding ? (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
            <input
              type="text"
              placeholder="Event title (e.g., Art, PE)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              placeholder="Day/Date (e.g., Monday, 2024-10-12)"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={addEvent}
                disabled={!newTitle || !newDate}
                className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-xxs font-black uppercase tracking-widest disabled:opacity-50"
              >
                Add Event
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-xxs font-black uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-3 bg-rose-600 text-white rounded-xl text-xxs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:bg-rose-700 transition-colors"
          >
            <CalendarIcon className="w-4 h-4" /> Add Local Event
          </button>
        )}
      </div>

      <hr className="border-slate-100" />

      {/* Building Sync & Display Days */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Display Options
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Sync Building Schedule
            </span>
            <Toggle
              checked={config.isBuildingSyncEnabled ?? true}
              onChange={(checked) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    isBuildingSyncEnabled: checked,
                  } as CalendarConfig,
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700">
                Days to Display
              </span>
              <span className="text-xxs text-slate-500">
                Show events for the next X days
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={30}
              value={daysVisible}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    daysVisible: parseInt(e.target.value, 10),
                  } as CalendarConfig,
                })
              }
              className="w-16 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block">
          Local Events
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {events.map((event, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm group"
            >
              <div className="min-w-0">
                <div className="text-xxs font-black text-rose-500 uppercase tracking-wider">
                  {event.date}
                </div>
                <div className="text-sm font-bold text-slate-700 truncate">
                  {event.title}
                </div>
              </div>
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      events: events.filter((_, idx: number) => idx !== i),
                    } as CalendarConfig,
                  })
                }
                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-2xl bg-slate-50/50">
              <p className="text-xxs italic">No local events added.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

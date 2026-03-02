import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useDashboard } from '../../context/useDashboard';
import {
  WidgetData,
  CalendarConfig,
  CalendarGlobalConfig,
  CalendarEvent,
} from '../../types';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Settings2,
  Ban,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { WidgetLayout } from './WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Toggle } from '../common/Toggle';
import { CalendarApiError } from '@/utils/googleCalendarService';

/** Maximum number of event cards visible at once before the list scrolls. */
const MAX_VISIBLE_EVENTS = 5;
/** Approximated gap between cards in px (max of the CSS `min(10px, 2cqmin)` expression). */
const APPROX_GAP_PX = 10;

export const CalendarWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { selectedBuildings, signInWithGoogle } = useAuth();
  const { subscribeToPermission } = useFeaturePermissions();
  const { calendarService, isConnected } = useGoogleCalendar();
  const config = widget.config as CalendarConfig;
  const localEvents = useMemo(() => config.events ?? [], [config.events]);
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );
  const [syncedEvents, setSyncedEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollContainerHeight, setScrollContainerHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScrollContainerHeight(el.clientHeight);
    });
    observer.observe(el);
    setScrollContainerHeight(el.clientHeight); // capture initial height before first resize
    return () => observer.disconnect();
  }, []);

  // 1. Subscribe to Global Admin Config
  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  // 2. Fetch Google Calendar Events
  const fetchAll = useCallback(async () => {
    if (
      !isBuildingSyncEnabled ||
      !globalConfig ||
      !isConnected ||
      !calendarService
    ) {
      setSyncedEvents([]);
      return;
    }

    const buildingId = selectedBuildings?.[0];
    if (!buildingId) return;

    const buildingDefaults = globalConfig.buildingDefaults?.[buildingId];
    const calendarIds = buildingDefaults?.googleCalendarIds ?? [];

    if (calendarIds.length === 0) {
      setSyncedEvents([]);
      return;
    }

    setIsLoadingSync(true);
    setSyncError(null);
    setNeedsReauth(false);
    try {
      const now = new Date();
      const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const timeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();

      const allPromises = calendarIds.map((id) =>
        calendarService.getEvents(id, timeMin, timeMax)
      );
      const results = await Promise.all(allPromises);
      const merged = results
        .flat()
        .sort((a, b) => a.date.localeCompare(b.date));

      setSyncedEvents(merged);
    } catch (err) {
      console.error('Failed to sync Google Calendars:', err);
      const is403 =
        (err as CalendarApiError)?.status === 403 ||
        (err as Error)?.message?.includes('403');

      if (is403) {
        setSyncError('Permission denied (403).');
        setNeedsReauth(true);
      } else {
        setSyncError('Failed to sync Google Calendar.');
      }
    } finally {
      setIsLoadingSync(false);
    }
  }, [
    isBuildingSyncEnabled,
    globalConfig,
    isConnected,
    calendarService,
    selectedBuildings,
  ]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // 3. Auto-populate Building Defaults (One-time check per building)
  useEffect(() => {
    if (!globalConfig || !isBuildingSyncEnabled || !selectedBuildings?.[0])
      return;

    const buildingId = selectedBuildings[0];
    // Only trigger if we haven't synced this building's static defaults to this widget instance yet
    if (config.lastSyncedBuildingId !== buildingId) {
      const defaults = globalConfig.buildingDefaults?.[buildingId];
      if (defaults && defaults.events?.length > 0) {
        // Merge with existing events to prevent data loss, but mark as synced
        updateWidget(widget.id, {
          config: {
            ...config,
            events: [...localEvents, ...defaults.events],
            lastSyncedBuildingId: buildingId,
          } as CalendarConfig,
        });
      } else {
        // Just mark as "checked" for this building even if no defaults found
        updateWidget(widget.id, {
          config: {
            ...config,
            lastSyncedBuildingId: buildingId,
          } as CalendarConfig,
        });
      }
    }
  }, [
    globalConfig,
    isBuildingSyncEnabled,
    selectedBuildings,
    config,
    widget.id,
    updateWidget,
    localEvents,
  ]);

  // Blocked Date logic
  const isBlocked = useMemo(() => {
    if (!isBuildingSyncEnabled) return false;
    const today = new Date().toISOString().split('T')[0];
    return globalConfig?.blockedDates?.includes(today);
  }, [isBuildingSyncEnabled, globalConfig]);

  // Combined events for display (Local + Building Synced)
  const displayEvents = useMemo(() => {
    // Merge local and synced, then sort by date
    const combined = [...localEvents, ...syncedEvents];
    const sorted = combined.sort((a, b) => a.date.localeCompare(b.date));

    // Filter by daysVisible if set
    const daysVisible = config.daysVisible ?? 5;
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const futureLimit = new Date(today);
    futureLimit.setDate(today.getDate() + daysVisible);

    return sorted.filter((event) => {
      // If it's an ISO date (YYYY-MM-DD), filter by range
      if (event.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const eventDate = new Date(event.date + 'T00:00:00');
        return eventDate >= today && eventDate < futureLimit;
      }
      // If it's a manual string (e.g. "Monday"), always show it
      return true;
    });
  }, [localEvents, syncedEvents, config.daysVisible]);

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
            <p className="text-xxs text-slate-500 mt-1 font-medium leading-tight">
              A district-wide event is taking precedence today.
            </p>
          </div>
        }
      />
    );
  }

  const needsScroll = displayEvents.length > MAX_VISIBLE_EVENTS;
  // Compute a per-item min-height so exactly MAX_VISIBLE_EVENTS cards are visible before scrolling.
  // We approximate the gap at APPROX_GAP_PX (the max value of min(10px, 2cqmin)).
  const itemHeight =
    needsScroll && scrollContainerHeight > 0
      ? Math.max(
          40,
          (scrollContainerHeight - (MAX_VISIBLE_EVENTS - 1) * APPROX_GAP_PX) /
            MAX_VISIBLE_EVENTS
        )
      : undefined;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full flex flex-col overflow-hidden"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          {isLoadingSync && syncedEvents.length === 0 && (
            <div className="flex items-center gap-2 mb-3 px-2 py-1 bg-blue-50 rounded-lg animate-pulse">
              <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
              <span className="text-xxs font-bold text-blue-600 uppercase tracking-wider">
                Syncing Calendar...
              </span>
            </div>
          )}

          {syncError && (
            <div className="flex items-center justify-between gap-2 mb-3 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-100 text-amber-600">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xxs font-black uppercase tracking-wider truncate">
                  {syncError}
                </span>
              </div>
              <button
                onClick={() => {
                  if (needsReauth) {
                    void signInWithGoogle();
                  } else {
                    void fetchAll();
                  }
                }}
                className="p-1 hover:bg-amber-100 rounded transition-colors shrink-0"
                title={needsReauth ? 'Sign in for permission' : 'Retry Sync'}
              >
                <RefreshCw
                  className={`w-3 h-3 ${isLoadingSync ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          )}

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-col"
            style={{ gap: 'min(10px, 2cqmin)' }}
          >
            {displayEvents.map((event, i: number) => (
              <div
                key={`${event.date}-${event.title}-${i}`}
                className="group relative flex bg-white rounded-2xl border border-slate-200 transition-all hover:bg-slate-50 shadow-sm"
                style={{
                  gap: 'min(16px, 3.5cqmin)',
                  padding: 'min(16px, 3.5cqmin)',
                  flex: needsScroll && itemHeight ? '0 0 auto' : '1 1 0',
                  minHeight:
                    needsScroll && itemHeight ? `${itemHeight}px` : '0',
                }}
              >
                <div
                  className="flex flex-col items-center justify-center border-r border-rose-200 shrink-0"
                  style={{
                    minWidth: 'min(80px, 18cqmin)',
                    paddingRight: 'min(16px, 3.5cqmin)',
                    paddingTop: 'min(4px, 1cqmin)',
                    paddingBottom: 'min(4px, 1cqmin)',
                  }}
                >
                  <span
                    className="uppercase text-rose-400 font-black"
                    style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                  >
                    {event.date.includes('-') ? 'Day' : 'Date'}
                  </span>
                  <span
                    className="text-rose-600 font-black"
                    style={{ fontSize: 'min(48px, 25cqmin)' }}
                  >
                    {event.date.includes('-')
                      ? new Date(event.date + 'T00:00:00').getDate()
                      : event.date}
                  </span>
                </div>
                <div className="flex items-center min-w-0">
                  <span
                    className="text-slate-700 font-black leading-tight truncate"
                    style={{ fontSize: 'min(24px, 8cqmin)' }}
                  >
                    {event.title}
                  </span>
                </div>
              </div>
            ))}
            {displayEvents.length === 0 && !isLoadingSync && (
              <ScaledEmptyState
                icon={CalendarIcon}
                title="No Events"
                subtitle="Flip to add local events or check building sync."
                className="opacity-40"
              />
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

import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../../context/useDashboard';
import {
  WidgetData,
  CalendarConfig,
  CalendarGlobalConfig,
  CalendarEvent,
  DEFAULT_GLOBAL_STYLE,
} from '../../types';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Settings2,
  Ban,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Type,
  Palette,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { WidgetLayout } from './WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Toggle } from '../common/Toggle';

const GAP_STYLE = 'min(10px, 2cqmin)';

/** Converts a hex color + alpha into an rgba() CSS string. */
const hexToRgba = (hex: string, alpha: number): string => {
  const clean = (hex ?? '#ffffff').replace('#', '');
  const a =
    typeof alpha === 'number' && !isNaN(alpha)
      ? Math.max(0, Math.min(1, alpha))
      : 1;
  if (clean.length !== 6) return `rgba(255, 255, 255, ${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
];

/**
 * Attempts to extract a Google Calendar ID from a pasted URL.
 */
const extractCalendarId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    const src = url.searchParams.get('src');
    if (src) return src;

    if (url.pathname.includes('/settings/calendar/')) {
      const parts = url.pathname.split('/');
      const last = parts[parts.length - 1];
      if (last && last.includes('@')) return decodeURIComponent(last);
    }
  } catch (_e) {
    /* treat as raw ID */
  }

  return trimmed;
};

export const CalendarWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard } = useDashboard();
  const { selectedBuildings } = useAuth();
  const { subscribeToPermission } = useFeaturePermissions();
  const { calendarService, isConnected } = useGoogleCalendar();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as CalendarConfig;
  const localEvents = useMemo(() => config.events ?? [], [config.events]);
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;
  const personalIds = useMemo(
    () => config.personalCalendarIds ?? [],
    [config.personalCalendarIds]
  );

  const {
    fontFamily = 'global',
    cardOpacity = 1,
    cardColor = '#ffffff',
  } = config;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);

  // 1. Subscribe to Global Admin Config (Proxy Source)
  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  // 2. Fetch Personal Events (Direct Client-Side)
  useEffect(() => {
    if (!isConnected || !calendarService || personalIds.length === 0) {
      return;
    }

    const fetchPersonal = async () => {
      try {
        const now = new Date();
        const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        const timeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();

        const allPromises = personalIds.map((id) =>
          calendarService.getEvents(id, timeMin, timeMax)
        );
        const results = await Promise.all(allPromises);
        setPersonalEvents(results.flat());
      } catch (err) {
        console.error('Failed to sync personal calendars:', err);
      }
    };

    void fetchPersonal();
  }, [isConnected, calendarService, personalIds]);

  // Combined events for display (Local + Building Synced + Personal)
  const displayEvents = useMemo(() => {
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

    const validatedPersonalEvents =
      isConnected && calendarService && personalIds.length > 0
        ? personalEvents
        : [];

    // Merge local, building static, building proxied, and personal events
    const combined = [
      ...localEvents,
      ...staticEvents,
      ...proxiedEvents,
      ...validatedPersonalEvents,
    ];

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
        return eventDate >= today && eventDate < futureLimit;
      }
      return true;
    });

    return filtered;
  }, [
    localEvents,
    globalConfig,
    isBuildingSyncEnabled,
    selectedBuildings,
    config.daysVisible,
    personalEvents,
    isConnected,
    calendarService,
    personalIds,
  ]);

  // Blocked Date logic
  const isBlocked = useMemo(() => {
    if (!isBuildingSyncEnabled) return false;
    const today = new Date().toISOString().split('T')[0];
    return globalConfig?.blockedDates?.includes(today);
  }, [isBuildingSyncEnabled, globalConfig]);

  const getFontClass = () => {
    if (fontFamily === 'global') return `font-${globalStyle.fontFamily}`;
    if (fontFamily.startsWith('font-')) return fontFamily;
    return `font-${fontFamily}`;
  };

  const bgColor = hexToRgba(cardColor, cardOpacity);

  if (isBlocked) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Ban}
            title="Calendar Blocked"
            subtitle="A district-wide blocked date is active today."
            className="bg-rose-50/30"
            iconClassName="text-rose-400 animate-pulse"
            titleClassName="text-rose-500"
            subtitleClassName="text-rose-400 font-medium"
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full relative flex flex-col overflow-hidden ${getFontClass()}`}
        >
          <div
            className="flex-1 overflow-y-auto no-scrollbar flex flex-col"
            style={{
              padding: 'min(12px, 2.5cqmin)',
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
                  className="flex-1 min-h-0 flex flex-col"
                  style={{ containerType: 'size' }}
                >
                  <div
                    className="w-full h-full flex flex-col justify-center rounded-xl transition-all relative overflow-hidden"
                    style={{
                      backgroundColor: bgColor,
                      padding:
                        'clamp(6px, 6cqmin, 16px) clamp(8px, 5cqmin, 20px)',
                      border: `1px solid ${isToday ? 'rgba(99, 102, 241, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                      borderLeft: isToday
                        ? 'min(4px, 2cqmin) solid rgb(99, 102, 241)'
                        : undefined,
                      boxShadow: isToday
                        ? '0 2px 8px rgba(99, 102, 241, 0.12)'
                        : '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div
                      className="flex flex-col min-w-0"
                      style={{ gap: 'min(6px, 3cqmin)' }}
                    >
                      <div
                        className="flex items-center min-w-0 overflow-hidden"
                        style={{ gap: 'min(6px, 3cqmin)' }}
                      >
                        <span
                          className="font-black uppercase tracking-widest shrink-0"
                          style={{
                            fontSize: 'min(16px, 14cqmin)',
                            color: isToday
                              ? 'rgb(99, 102, 241)'
                              : 'rgb(148, 163, 184)',
                          }}
                        >
                          {isToday ? 'Today' : event.date}
                        </span>
                        {event.time && (
                          <span
                            className="font-medium text-slate-400 min-w-0 truncate"
                            style={{ fontSize: 'min(16px, 14cqmin)' }}
                          >
                            · {event.time}
                          </span>
                        )}
                      </div>
                      <span
                        className="font-black truncate leading-tight"
                        style={{
                          fontSize: 'min(48px, 35cqmin)',
                          color: isToday
                            ? 'rgb(55, 65, 81)'
                            : 'rgb(71, 85, 105)',
                        }}
                      >
                        {event.title}
                      </span>
                    </div>
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
  const { signInWithGoogle, selectedBuildings } = useAuth();
  const { isConnected } = useGoogleCalendar();
  const { subscribeToPermission } = useFeaturePermissions();
  const config = widget.config as CalendarConfig;
  const events = config.events ?? [];
  const personalIds = config.personalCalendarIds ?? [];
  const daysVisible = config.daysVisible ?? 5;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [isAddingLocal, setIsAddingLocal] = useState(false);

  const [personalInput, setPersonalInput] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  const buildingId = selectedBuildings?.[0];
  const lastSyncAt = buildingId
    ? globalConfig?.buildingDefaults?.[buildingId]?.lastProxySync
    : null;

  const addLocalEvent = () => {
    if (newTitle && newDate) {
      updateWidget(widget.id, {
        config: {
          ...config,
          events: [...events, { title: newTitle, date: newDate }],
        } as CalendarConfig,
      });
      setNewTitle('');
      setNewDate('');
      setIsAddingLocal(false);
    }
  };

  const addPersonalId = () => {
    const id = extractCalendarId(personalInput);
    if (id && !personalIds.includes(id)) {
      updateWidget(widget.id, {
        config: {
          ...config,
          personalCalendarIds: [...personalIds, id],
        } as CalendarConfig,
      });
      setPersonalInput('');
    }
  };

  const removePersonalId = (id: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        personalCalendarIds: personalIds.filter((p) => p !== id),
      } as CalendarConfig,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Display Options */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Display Options
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700">
                Sync Building Schedule
              </span>
              {lastSyncAt && (
                <span className="text-xxs text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5" />
                  Synced{' '}
                  {new Date(lastSyncAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
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
      </section>

      <hr className="border-slate-100" />

      {/* Typography */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Type className="w-3 h-3" /> Typography
        </label>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id } as CalendarConfig,
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                config.fontFamily === f.id ||
                (!config.fontFamily && f.id === 'global')
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-xxxs uppercase text-slate-600">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* Card Style */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Palette className="w-3 h-3" /> Card Style
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
          {/* Card Color */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Card Color
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  {config.cardColor ?? '#ffffff'}
                </span>
                <input
                  type="color"
                  value={config.cardColor ?? '#ffffff'}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardColor: e.target.value,
                      } as CalendarConfig,
                    })
                  }
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5"
                  aria-label="Card color"
                  title="Choose card background color"
                />
              </div>
            </div>
          </div>

          {/* Card Opacity */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">
                Card Opacity
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {Math.round((config.cardOpacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.cardOpacity ?? 1}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardOpacity: parseFloat(e.target.value),
                  } as CalendarConfig,
                })
              }
              aria-label="Card opacity"
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Set to 0% for fully transparent cards.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 2. Personal Google Calendars */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> Personal Google Calendars
          </label>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-xxs font-black text-blue-500 uppercase tracking-tight flex items-center gap-1 hover:text-blue-600 transition-colors"
          >
            <HelpCircle className="w-3 h-3" /> Instructions
          </button>
        </div>

        {showInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800 space-y-2 animate-in slide-in-from-top-2">
            <p className="font-bold">How to find your Calendar ID:</p>
            <ol className="list-decimal list-inside space-y-1 opacity-90">
              <li>Open Google Calendar on your computer.</li>
              <li>
                Hover over your calendar name on the left and click the three
                dots ⋮ &gt; <strong>Settings and sharing</strong>.
              </li>
              <li>
                Scroll down to the <strong>Integrate calendar</strong> section.
              </li>
              <li>
                Copy the <strong>Calendar ID</strong> (it usually looks like an
                email address).
              </li>
              <li>Paste the ID (or the public URL) into the box below.</li>
            </ol>
            <div className="pt-1 flex items-center gap-2">
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 font-black uppercase tracking-tighter hover:underline"
              >
                Open Google Calendar <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}

        {!isConnected ? (
          <button
            onClick={() => void signInWithGoogle()}
            className="w-full py-2.5 bg-white border-2 border-dashed border-slate-200 rounded-xl text-xs font-black text-slate-500 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-500 transition-all"
          >
            <div className="w-4 h-4 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center overflow-hidden">
              <img
                src="https://www.google.com/favicon.ico"
                className="w-3 h-3"
                alt=""
              />
            </div>
            Sign in with Google to Sync
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Calendar ID or URL"
                value={personalInput}
                onChange={(e) => setPersonalInput(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addPersonalId}
                disabled={!personalInput}
                className="px-4 bg-blue-600 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <div className="space-y-1.5">
              {personalIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between px-3 py-2 bg-white border border-slate-100 rounded-lg shadow-sm"
                >
                  <span className="text-xs font-medium text-slate-600 truncate max-w-[200px]">
                    {id}
                  </span>
                  <button
                    onClick={() => removePersonalId(id)}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <hr className="border-slate-100" />

      {/* 3. Local Events */}
      <section className="space-y-3">
        <label className="text-xxs text-slate-400 uppercase tracking-widest block">
          Local Manual Events
        </label>

        {isAddingLocal ? (
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
                onClick={addLocalEvent}
                disabled={!newTitle || !newDate}
                className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-xxs font-black uppercase tracking-widest disabled:opacity-50"
              >
                Add Event
              </button>
              <button
                onClick={() => setIsAddingLocal(false)}
                className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-xxs font-black uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingLocal(true)}
            className="w-full py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Local Event
          </button>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
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
            <div className="text-center py-6 text-slate-400 border-2 border-dashed rounded-2xl bg-slate-50/50">
              <p className="text-xxs italic">No local events added.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

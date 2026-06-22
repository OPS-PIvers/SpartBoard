import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useGlobalStyle,
  useDashboardActions,
} from '@/context/dashboardCanvasStore';
import {
  WidgetData,
  CalendarConfig,
  CalendarGlobalConfig,
  CalendarEvent,
} from '@/types';
import { Calendar as CalendarIcon, Ban, Timer } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '../WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { useAuth } from '@/context/useAuth';
import { GoogleCalendarService } from '@/utils/googleCalendarService';
import { GAP_STYLE } from './constants';
import { hexToRgba } from '@/utils/styles';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';

/** Parses a time string (e.g. "14:30", "2:30 PM") into seconds since midnight, or -1 if invalid. */
const parseTimeSeconds = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const parts = t.toLowerCase().split(':');
  let h = parseInt(parts[0], 10);
  const mStr = parts[1].replace(/[^0-9]/g, '');
  const m = parseInt(mStr, 10);

  const isPM = t.toLowerCase().includes('pm');
  const isAM = t.toLowerCase().includes('am');

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 3600 + m * 60;
};

export const CalendarWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget } = useDashboardActions();
  const buildingId = useWidgetBuildingId(widget);
  const { subscribeToPermission } = useFeaturePermissions();
  // Path B: the personal-calendar fetch needs the `calendar.readonly` scope,
  // which is NOT requested at login. We acquire it ON DEMAND here — SILENTLY
  // in the effect (never a popup from a non-gesture context). For users who
  // already granted it (all current Orono users) the silent acquisition returns
  // a token and the fetch proceeds exactly as before; for never-granted users
  // it returns null and we render a "Connect Google Calendar" CTA whose click
  // (a user gesture) re-requests the scope interactively.
  const { ensureGoogleScope } = useAuth();
  const globalStyle = useGlobalStyle();
  const config = widget.config as CalendarConfig;
  const localEvents = useMemo(() => config.events ?? [], [config.events]);
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;
  const personalIds = useMemo(
    () => config.personalCalendarIds ?? [],
    [config.personalCalendarIds]
  );

  const {
    fontFamily = 'global',
    fontColor = '#334155',
    textSizePreset,
    cardOpacity = 1,
    cardColor = '#ffffff',
  } = config;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  // The on-demand `calendar.readonly` access token, or null until/unless one is
  // available. Drives whether the personal section is "connected".
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  // True once the SILENT acquisition has resolved to "no token" — i.e. the user
  // hasn't granted Calendar. Gates the connect CTA so it only shows after we've
  // confirmed silent acquisition failed (not during the in-flight window).
  const [calendarNeedsConnect, setCalendarNeedsConnect] = useState(false);

  const isCalendarConnected = calendarToken !== null;

  const calendarService = useMemo(
    () => (calendarToken ? new GoogleCalendarService(calendarToken) : null),
    [calendarToken]
  );

  // Midnight refresh: update every 60 s so the event filter and blocked-date
  // check re-evaluate when the calendar day rolls over without any other dep
  // changing (same pattern as CountdownWidget).
  const [todayMidnightMs, setTodayMidnightMs] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      setTodayMidnightMs(d.getTime());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // 1. Subscribe to Global Admin Config (Proxy Source)
  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  // 2a. Silently acquire the calendar.readonly token (Path B). Runs only when
  // there are personal calendars to fetch and no token yet. NON-interactive —
  // an effect has no user gesture, so we must never open a popup here. Already-
  // granted users get a token silently; never-granted users resolve to null and
  // we flip `calendarNeedsConnect` to surface the connect CTA.
  useEffect(() => {
    if (personalIds.length === 0 || calendarToken !== null) return;
    let cancelled = false;
    void (async () => {
      const token = await ensureGoogleScope('calendar.readonly');
      if (cancelled) return;
      if (token) {
        setCalendarToken(token);
        setCalendarNeedsConnect(false);
      } else {
        setCalendarNeedsConnect(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personalIds.length, calendarToken, ensureGoogleScope]);

  // 2b. Fetch Personal Events once we have a calendar service + IDs.
  useEffect(() => {
    if (!calendarService || personalIds.length === 0) {
      return;
    }
    let cancelled = false;

    const fetchPersonal = async () => {
      try {
        const now = new Date();
        const timeMin = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).toISOString();
        const timeMax = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 30
        ).toISOString();

        const allPromises = personalIds.map((id) =>
          calendarService.getEvents(id, timeMin, timeMax)
        );
        const results = await Promise.all(allPromises);
        if (!cancelled) setPersonalEvents(results.flat());
      } catch (err) {
        // A 401/403 means the on-demand calendar token expired (GIS tokens
        // have a ~1h TTL and this snapshot isn't on AuthContext's refresh
        // loop). Clear it so the silent probe (effect 2a) re-mints a fresh
        // token and auto-recovers without a reload — mirrors
        // AdminCalendarFetcher's per-cycle re-acquire. A genuinely revoked
        // scope makes the re-probe resolve to null (connect CTA), not a loop.
        const status = (err as { status?: number } | null)?.status;
        if ((status === 401 || status === 403) && !cancelled) {
          setCalendarToken(null);
          return;
        }
        console.error('Failed to sync personal calendars:', err);
      }
    };

    void fetchPersonal();
    return () => {
      cancelled = true;
    };
  }, [calendarService, personalIds]);

  // Connect CTA handler — INTERACTIVE (driven by a user click), so a popup is
  // allowed. On success we store the token, which triggers the fetch effect.
  const handleConnectCalendar = useCallback(async () => {
    const token = await ensureGoogleScope('calendar.readonly', {
      interactive: true,
    });
    if (token) {
      setCalendarToken(token);
      setCalendarNeedsConnect(false);
    }
  }, [ensureGoogleScope]);

  // Combined events for display (Local + Building Synced + Personal)
  const displayEvents = useMemo(() => {
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
      isCalendarConnected && calendarService && personalIds.length > 0
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
    const today = new Date(todayMidnightMs);
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
    buildingId,
    config.daysVisible,
    personalEvents,
    isCalendarConnected,
    calendarService,
    personalIds,
    todayMidnightMs,
  ]);

  // Blocked Date logic
  const isBlocked = useMemo(() => {
    if (!isBuildingSyncEnabled) return false;
    // Use local time methods — toISOString() shifts to UTC and can give the
    // previous day for users in UTC+ timezones (e.g. UTC+12 local midnight
    // is still yesterday in UTC).
    const d = new Date(todayMidnightMs);
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return globalConfig?.blockedDates?.includes(today);
  }, [isBuildingSyncEnabled, globalConfig, todayMidnightMs]);

  const getFontClass = () => {
    if (fontFamily === 'global') return `font-${globalStyle.fontFamily}`;
    if (fontFamily.startsWith('font-')) return fontFamily;
    return `font-${fontFamily}`;
  };

  const handleStartTimer = React.useCallback(
    (event: CalendarEvent) => {
      if (!event.time) return;

      const startSeconds = parseTimeSeconds(event.time);
      if (startSeconds < 0) return;

      const now = new Date();
      const nowSeconds =
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const remainingSeconds = Math.max(0, startSeconds - nowSeconds);
      if (remainingSeconds === 0) return;

      const spawnNow = Date.now();

      addWidget('time-tool', {
        x: widget.x + widget.w + 20,
        y: widget.y,
        config: {
          mode: 'timer',
          visualType: 'digital',
          duration: remainingSeconds,
          elapsedTime: remainingSeconds,
          isRunning: true,
          startTime: spawnNow,
          selectedSound: 'Gong',
        },
      });
    },
    [addWidget, widget.x, widget.y, widget.w]
  );

  const bgColor = hexToRgba(cardColor, cardOpacity);
  const textScale = resolveTextPresetMultiplier(textSizePreset, 1);

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

  // Use local-time methods — toISOString() converts to UTC first, which shifts
  // the date backward for UTC+ users (e.g. a user at UTC+12 at local midnight
  // sees the *previous* date in UTC, so "Today" never highlights correctly).
  const todayD = new Date(todayMidnightMs);
  const today = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // Card height: small enough that 4 always fit without clipping (short widgets),
  // but capped so taller widgets naturally show more than 4 events.
  const rowHeight = `min(calc((100% - min(30px, 6cqmin)) / 4), min(120px, 22cqmin))`;

  // Show the connect affordance only when the teacher has configured personal
  // calendars, we've confirmed the silent calendar.readonly acquisition failed
  // (`calendarNeedsConnect`), and we don't have a token yet. Never shows for
  // already-granted users (the silent path returns a token) or when no personal
  // calendars are configured.
  const showConnectCalendar =
    personalIds.length > 0 && calendarNeedsConnect && !isCalendarConnected;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full flex flex-col overflow-hidden ${getFontClass()}`}
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          <div
            className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0"
            style={{
              gap: GAP_STYLE,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {displayEvents.map((event, idx) => {
              const isToday = event.date === today;

              let canStartTimer = false;
              if (isToday && event.time) {
                const startSeconds = parseTimeSeconds(event.time);
                if (startSeconds >= 0) {
                  canStartTimer = startSeconds > nowSeconds;
                }
              }

              return (
                <div
                  key={`${event.date}-${event.title}-${idx}`}
                  className="w-full flex flex-col rounded-xl transition-all relative overflow-hidden"
                  style={{
                    flex: `0 0 ${rowHeight}`,
                    height: rowHeight,
                    backgroundColor: bgColor,
                    padding: 'min(12px, 2.5cqmin) min(16px, 3.5cqmin)',
                    border: `1px solid ${isToday ? 'rgba(99, 102, 241, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                    borderLeft: isToday
                      ? 'min(4px, 1cqmin) solid rgb(99, 102, 241)'
                      : undefined,
                    boxShadow: isToday
                      ? '0 2px 8px rgba(99, 102, 241, 0.12)'
                      : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div
                    className="flex flex-col min-w-0"
                    style={{ gap: 'min(4px, 1cqmin)' }}
                  >
                    <div
                      className="flex items-center min-w-0 overflow-hidden"
                      style={{ gap: 'min(6px, 1.5cqmin)' }}
                    >
                      <span
                        className="font-black uppercase tracking-widest shrink-0"
                        style={{
                          fontSize: `min(${Math.round(20 * textScale)}px, ${(4.5 * textScale).toFixed(2)}cqmin)`,
                          color: isToday ? 'rgb(99, 102, 241)' : fontColor,
                        }}
                      >
                        {isToday ? 'Today' : event.date}
                      </span>
                      {event.time && (
                        <span
                          className="font-medium text-slate-400 min-w-0 truncate"
                          style={{
                            fontSize: `min(${Math.round(20 * textScale)}px, ${(4.5 * textScale).toFixed(2)}cqmin)`,
                          }}
                        >
                          · {event.time}
                        </span>
                      )}
                      {canStartTimer && (
                        <button
                          onClick={() => handleStartTimer(event)}
                          className="text-slate-400 hover:text-indigo-500 transition-colors shrink-0"
                          style={{ marginLeft: 'min(4px, 1cqmin)' }}
                          title="Start countdown to event"
                        >
                          <Timer
                            style={{
                              width: 'min(14px, 3.5cqmin)',
                              height: 'min(14px, 3.5cqmin)',
                            }}
                          />
                        </button>
                      )}
                    </div>
                    <span
                      className="font-black truncate leading-tight"
                      style={{
                        fontSize: `min(${Math.round(32 * textScale)}px, ${(9 * textScale).toFixed(2)}cqmin)`,
                        color: isToday ? 'rgb(55, 65, 81)' : fontColor,
                      }}
                    >
                      {event.title}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Connect CTA (Path B): the teacher configured personal
                calendars but hasn't granted the calendar.readonly scope.
                Silent acquisition resolved to null, so prompt for a one-time
                consent on click (a user gesture). Takes priority over the
                generic empty state so the actionable affordance is visible. */}
            {showConnectCalendar && (
              <div className="h-full flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => void handleConnectCalendar()}
                  className="flex flex-col items-center justify-center rounded-xl transition-colors hover:bg-white/5"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    padding: 'min(16px, 4cqmin)',
                  }}
                >
                  <CalendarIcon
                    className="text-indigo-400"
                    style={{
                      width: 'min(40px, 14cqmin)',
                      height: 'min(40px, 14cqmin)',
                    }}
                  />
                  <span
                    className="font-black text-slate-200"
                    style={{ fontSize: 'min(15px, 6cqmin)' }}
                  >
                    Connect Google Calendar
                  </span>
                  <span
                    className="text-slate-300 text-center"
                    style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                  >
                    Grant access to sync your personal calendars.
                  </span>
                </button>
              </div>
            )}

            {!showConnectCalendar && displayEvents.length === 0 && (
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

import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  CalendarConfig,
  CalendarGlobalConfig,
  CalendarEvent,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { Calendar as CalendarIcon, Ban } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '../WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { GAP_STYLE, hexToRgba } from './constants';

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

  const today = new Date().toISOString().split('T')[0];

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
            {displayEvents.map((event) => {
              const isToday = event.date === today;

              return (
                <div
                  key={`${event.date}-${event.title}`}
                  className="w-full flex flex-col rounded-xl transition-all relative shrink-0 overflow-hidden"
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
                        color: isToday ? 'rgb(55, 65, 81)' : 'rgb(71, 85, 105)',
                      }}
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

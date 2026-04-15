import React, { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import {
  WidgetData,
  SpecialistScheduleConfig,
  SpecialistScheduleGlobalConfig,
  ClockConfig,
  DEFAULT_GLOBAL_STYLE,
  SpecialistScheduleItem,
} from '@/types';
import { Calendar, Clock, CheckCircle2, Circle } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
import { hexToRgba } from '@/utils/styles';

/** Parses an "HH:MM" time string and returns minutes since midnight, or -1 if invalid. */
const parseTime = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

const formatTime = (time: string, format24: boolean): string => {
  if (!time.includes(':')) return time;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  if (format24) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const hours12 = h % 12 || 12;
  return `${hours12}:${m.toString().padStart(2, '0')} ${period}`;
};

const toDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const SpecialistScheduleWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard } = useDashboard();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget) ?? 'schumann-elementary';
  const config = widget.config as SpecialistScheduleConfig;

  // Fetch Global Configuration
  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find(
      (p) => p.widgetType === 'specialist-schedule'
    );
    return perm?.config as SpecialistScheduleGlobalConfig | undefined;
  }, [featurePermissions]);
  const buildingConfig = globalConfig?.buildingDefaults?.[buildingId] ?? {
    cycleLength: 6,
    startDate: toDateStr(new Date()),
    schoolDays: [],
    dayLabel: 'Day',
    customDayNames: {} as Record<number, string>,
    blocks: [],
  };

  const {
    cycleLength = 6,
    schoolDays = [],
    dayLabel = 'Day',
    customDayNames = {} as Record<number, string>,
    blocks = [],
  } = buildingConfig;

  const {
    cycleDays = [],
    fontFamily = 'global',
    fontColor = '#334155',
    textSizePreset,
    cardColor = '#ffffff',
    cardOpacity = 1,
    specialistClass = '',
    recurringItems = [],
  } = config;

  const textScale = resolveTextPresetMultiplier(textSizePreset, 1);

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(id);
  }, []);

  const todayStr = useMemo(() => toDateStr(now), [now]);
  const dayOfWeek = now.getDay(); // 0-6

  // Determine the current Day Number and Label
  const { currentDayNumber, currentDayLabel, isSchoolDay } = useMemo(() => {
    // Check for explicit blocks first (Intermediate School style)
    if (blocks && blocks.length > 0) {
      const activeBlock = blocks.find(
        (b) => todayStr >= b.startDate && todayStr <= b.endDate
      );
      if (activeBlock) {
        const customName = customDayNames?.[activeBlock.dayNumber];
        return {
          currentDayNumber: activeBlock.dayNumber,
          currentDayLabel: customName ?? `${dayLabel} ${activeBlock.dayNumber}`,
          isSchoolDay: true,
        };
      }
    }

    if (!schoolDays.length)
      return {
        currentDayNumber: null,
        currentDayLabel: 'Non-School Day',
        isSchoolDay: false,
      };

    const sortedSchoolDays = [...schoolDays].sort();
    const todayIndex = sortedSchoolDays.indexOf(todayStr);

    if (todayIndex === -1) {
      return {
        currentDayNumber: null,
        currentDayLabel: 'Non-School Day',
        isSchoolDay: false,
      };
    }

    const num = (todayIndex % cycleLength) + 1;
    const customName = customDayNames?.[num];
    return {
      currentDayNumber: num,
      currentDayLabel: customName ?? `${dayLabel} ${num}`,
      isSchoolDay: true,
    };
  }, [schoolDays, todayStr, cycleLength, blocks, customDayNames, dayLabel]);

  // Merge rotation items, daily items, and weekly items
  const currentItems = useMemo(() => {
    let merged: SpecialistScheduleItem[] = [];

    // 1. Add rotation-specific items (only on school days)
    if (isSchoolDay && currentDayNumber !== null) {
      const dayConfig = cycleDays.find((d) => d.dayNumber === currentDayNumber);
      if (dayConfig) {
        merged = [...dayConfig.items];
      }
    }

    // 2. Add daily recurring items
    const dailyItems = recurringItems.filter((ri) => ri.type === 'daily');
    merged = [...merged, ...dailyItems];

    // 3. Add weekly recurring items for today
    const weeklyItems = recurringItems.filter(
      (ri) => ri.type === 'weekly' && ri.dayOfWeek === dayOfWeek
    );
    merged = [...merged, ...weeklyItems];

    // 4. Sort by startTime
    merged.sort((a, b) => {
      const timeA = parseTime(a.startTime);
      const timeB = parseTime(b.startTime);
      return timeA - timeB;
    });

    return merged;
  }, [currentDayNumber, cycleDays, isSchoolDay, recurringItems, dayOfWeek]);

  const activeIndex = useMemo(() => {
    if (!currentItems.length) return -1;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let bestIndex = -1;
    for (let i = 0; i < currentItems.length; i++) {
      const start = parseTime(currentItems[i].startTime);
      if (start === -1 || nowMinutes < start) continue;

      let end = parseTime(currentItems[i].endTime);
      if (end === -1) {
        // Find next start
        let nextStart = -1;
        for (let j = 0; j < currentItems.length; j++) {
          const s = parseTime(currentItems[j].startTime);
          if (s > start && (nextStart === -1 || s < nextStart)) {
            nextStart = s;
          }
        }
        end = nextStart;
      }

      if (end === -1 || nowMinutes < end) {
        if (
          bestIndex === -1 ||
          start > parseTime(currentItems[bestIndex].startTime)
        ) {
          bestIndex = i;
        }
      }
    }
    return bestIndex;
  }, [currentItems, now]);

  const clockWidget = useMemo(
    () => activeDashboard?.widgets?.find((w) => w.type === 'clock') ?? null,
    [activeDashboard?.widgets]
  );
  const format24 =
    (clockWidget?.config as ClockConfig | undefined)?.format24 ?? false;

  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const getFontClass = () => {
    if (fontFamily === 'global') return `font-${globalStyle.fontFamily}`;
    return fontFamily.startsWith('font-') ? fontFamily : `font-${fontFamily}`;
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full flex flex-col overflow-hidden ${getFontClass()}`}
          style={{ padding: 'min(12px, 2.5cqmin)', color: fontColor }}
        >
          {/* Header with Day Number */}
          <div
            className="flex items-center justify-between mb-2 border-b border-slate-100 pb-2 shrink-0"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <div
              className="flex items-center"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              <Calendar
                className="text-teal-600"
                style={{
                  width: 'min(24px, 6cqmin)',
                  height: 'min(24px, 6cqmin)',
                }}
              />
              <span
                className="font-black"
                style={{
                  fontSize: `min(${Math.round(18 * textScale)}px, ${(4.5 * textScale).toFixed(2)}cqmin)`,
                  color: fontColor,
                }}
              >
                {currentDayLabel}
                {specialistClass && (
                  <span
                    className="ml-2 font-bold"
                    style={{
                      fontSize: `min(${Math.round(14 * textScale)}px, ${(3.5 * textScale).toFixed(2)}cqmin)`,
                      color: fontColor,
                    }}
                  >
                    ({specialistClass})
                  </span>
                )}
              </span>
            </div>
            <div
              className="font-bold"
              style={{
                fontSize: `min(${Math.round(12 * textScale)}px, ${(3 * textScale).toFixed(2)}cqmin)`,
                color: fontColor,
              }}
            >
              {now.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0"
            style={{ gap: 'min(10px, 2cqmin)' }}
          >
            {currentItems.map((item, i) => {
              const isActive = i === activeIndex;
              const isPast =
                !isActive &&
                parseTime(item.endTime ?? item.startTime) <
                  now.getHours() * 60 + now.getMinutes();
              const bgColor = isPast
                ? hexToRgba('#cbd5e1', cardOpacity)
                : hexToRgba(cardColor, cardOpacity);

              return (
                <div
                  key={item.id}
                  className={`w-full flex items-center rounded-2xl transition-all relative overflow-hidden shrink-0 ${
                    isActive
                      ? 'border-[min(6px,1.5cqmin)] border-teal-600 shadow-md z-10'
                      : 'border border-slate-200 shadow-sm'
                  }`}
                  style={{
                    backgroundColor: bgColor,
                    padding: 'min(12px, 3cqmin)',
                    gap: 'min(12px, 2.5cqmin)',
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute top-0 right-0 bg-teal-600 text-white font-black uppercase tracking-widest px-2 py-1 rounded-bl-xl z-20"
                      style={{
                        fontSize: `min(${Math.round(10 * textScale)}px, ${(2.5 * textScale).toFixed(2)}cqmin)`,
                      }}
                    >
                      Now
                    </div>
                  )}
                  <div className="shrink-0">
                    {isPast ? (
                      <CheckCircle2
                        className="text-green-500"
                        style={{
                          width: 'min(28px, 7cqmin)',
                          height: 'min(28px, 7cqmin)',
                        }}
                      />
                    ) : (
                      <Circle
                        className="text-teal-300"
                        style={{
                          width: 'min(28px, 7cqmin)',
                          height: 'min(28px, 7cqmin)',
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className={`font-black leading-none ${isPast ? 'text-slate-400' : ''}`}
                      style={{
                        fontSize: `min(${Math.round(14 * textScale)}px, ${(3.5 * textScale).toFixed(2)}cqmin)`,
                        color: isPast ? undefined : fontColor,
                      }}
                    >
                      {formatTime(item.startTime, format24)}
                      {item.endTime
                        ? ` - ${formatTime(item.endTime, format24)}`
                        : ''}
                    </span>
                    <span
                      className={`font-black leading-tight truncate w-full ${isPast ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      style={{
                        fontSize: `min(${Math.round(20 * textScale)}px, ${(5 * textScale).toFixed(2)}cqmin)`,
                      }}
                    >
                      {item.task}
                    </span>
                  </div>
                </div>
              );
            })}

            {currentItems.length === 0 && (
              <ScaledEmptyState
                icon={Clock}
                title="Empty Schedule"
                subtitle={
                  isSchoolDay
                    ? `No items added for ${currentDayLabel}.`
                    : 'Non-school day. Only recurring items would show here.'
                }
                className="opacity-40"
              />
            )}
          </div>
        </div>
      }
    />
  );
};

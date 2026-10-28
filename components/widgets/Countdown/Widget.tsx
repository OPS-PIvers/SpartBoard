import React, { useMemo, useState, useEffect } from 'react';
import { WidgetData, CountdownConfig } from '@/types';
import { WidgetLayout } from '../WidgetLayout';
import { getFontClass, hexToRgba } from '@/utils/styles';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { countDaysBetween, parseConfigDate } from './utils';

interface CountdownDay {
  date: Date;
  isPast: boolean;
  isEvent: boolean;
  isToday: boolean;
  number?: number;
}

const MAX_PAST_GRID_DAYS = 366;
const MAX_FUTURE_GRID_DAYS = 366;

// Usable face width in cqw once the title's side padding is taken off.
const TEXT_CQW = 88;

// Rough advance of a bold glyph in em, wide enough that a measured word never overflows.
const glyphEm = (ch: string): number => {
  if (/[ijlI.,'!|:;]/.test(ch)) return 0.3;
  if (/[frt]/.test(ch)) return 0.42;
  if (/[mwMW]/.test(ch)) return 1.05;
  if (/[A-Z]/.test(ch)) return 0.75;
  return 0.62;
};

const longestWordEm = (text: string): number =>
  Math.max(
    0.6,
    ...text
      .split(/\s+/)
      .map((word) => [...word].reduce((sum, ch) => sum + glyphEm(ch), 0))
  );

const normalizeDate = (value: Date): Date => {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const isWeekendDate = (value: Date): boolean => {
  const dayOfWeek = value.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

export const CountdownWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const globalStyle = useGlobalStyle();
  const config = widget.config as CountdownConfig;

  const {
    title,
    startDate,
    eventDate,
    includeWeekends,
    countToday,
    viewMode,
    cardColor = '#ffffff',
    cardOpacity = 1,
    fontColor = '#1e293b',
    fontFamily = 'global',
    eventColor = '#2d3f89',
  } = config;

  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);
  const titleWordEm = longestWordEm(title ?? '');

  // Stable "today at midnight" timestamp, refreshed every minute so the
  // widget recomputes automatically when the calendar day changes. Without
  // this ticker the useMemo dependency arrays never change at midnight and
  // the countdown stays frozen until the user edits a config field.
  const [todayMidnightMs, setTodayMidnightMs] = useState(() =>
    normalizeDate(new Date()).getTime()
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTodayMidnightMs(normalizeDate(new Date()).getTime());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const calculatedDays = useMemo(() => {
    const start = normalizeDate(parseConfigDate(startDate));
    const event = normalizeDate(parseConfigDate(eventDate));
    const todayAtMidnight = new Date(todayMidnightMs);

    const countStart = new Date(
      Math.max(todayAtMidnight.getTime(), start.getTime())
    );

    if (!countToday && countStart.getTime() === todayAtMidnight.getTime()) {
      countStart.setDate(countStart.getDate() + 1);
    }

    // If event is in the past or today (and we don't count today)
    if (event < countStart) {
      return 0;
    }

    return countDaysBetween(countStart, event, includeWeekends);
  }, [startDate, eventDate, includeWeekends, countToday, todayMidnightMs]);

  const gridData = useMemo(() => {
    const start = normalizeDate(parseConfigDate(startDate));
    const event = normalizeDate(parseConfigDate(eventDate));
    const today = new Date(todayMidnightMs);
    const countStart = new Date(Math.max(today.getTime(), start.getTime()));

    if (!countToday && countStart.getTime() === today.getTime()) {
      countStart.setDate(countStart.getDate() + 1);
    }

    const validDays: CountdownDay[] = [];
    const countedDays: Date[] = [];
    // Start no earlier than a year of crossed-out days so a far-past startDate can't render thousands of cells.
    const gridStart = new Date(countStart);
    gridStart.setDate(gridStart.getDate() - MAX_PAST_GRID_DAYS);
    const current = new Date(Math.max(start.getTime(), gridStart.getTime()));
    // Stop a year past the count start so a far-future event can't render millions of cells.
    const gridEnd = new Date(countStart);
    gridEnd.setDate(gridEnd.getDate() + MAX_FUTURE_GRID_DAYS);
    const totalCounted = countDaysBetween(countStart, event, includeWeekends);

    while (current <= event && current <= gridEnd) {
      const normalizedCurrent = new Date(current);

      const isEvent = normalizedCurrent.getTime() === event.getTime();
      if (includeWeekends || isEvent || !isWeekendDate(normalizedCurrent)) {
        const isToday = normalizedCurrent.getTime() === today.getTime();
        const isCountedDay =
          normalizedCurrent >= countStart && normalizedCurrent < event;

        validDays.push({
          date: normalizedCurrent,
          isPast: normalizedCurrent < countStart,
          isEvent,
          isToday,
        });

        if (isCountedDay) {
          countedDays.push(normalizedCurrent);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    const countdownNumbers = new Map(
      countedDays.map((day, index) => [day.getTime(), totalCounted - index])
    );

    return validDays.map((item) => ({
      ...item,
      number: countdownNumbers.get(item.date.getTime()),
    }));
  }, [startDate, eventDate, includeWeekends, countToday, todayMidnightMs]);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`flex flex-col items-center justify-center w-full h-full overflow-hidden rounded-[var(--window-radius,0px)] ${fontClass}`}
          style={{
            containerType: 'size',
            padding: 'min(16px, 4cqmin)',
            backgroundColor: hexToRgba(cardColor, cardOpacity),
          }}
        >
          {viewMode === 'number' ? (
            <div className="flex flex-col items-center justify-center text-center w-full [@container(min-aspect-ratio:2)]:flex-row [@container(min-aspect-ratio:2)]:gap-[4cqw] [@container(max-aspect-ratio:0.6)]:gap-[5cqh]">
              <div
                className="font-bold leading-none [font-size:var(--num-std)] [@container(max-width:200px)]:[font-size:var(--num-small)] [@container(min-aspect-ratio:2)]:[font-size:var(--num-wide)]"
                style={
                  {
                    '--num-small': `min(52cqh, ${(TEXT_CQW / longestWordEm(String(calculatedDays))).toFixed(2)}cqw)`,
                    '--num-std': `min(46cqh, ${(TEXT_CQW / longestWordEm(String(calculatedDays))).toFixed(2)}cqw)`,
                    '--num-wide': `min(68cqh, ${(34 / longestWordEm(String(calculatedDays))).toFixed(2)}cqw)`,
                    color: fontColor,
                  } as React.CSSProperties
                }
              >
                {calculatedDays}
              </div>
              <div className="flex flex-col items-center [@container(max-aspect-ratio:0.6)]:gap-[3cqh] [@container(min-aspect-ratio:2)]:items-start [@container(min-aspect-ratio:2)]:text-left">
                <div
                  className="font-medium [font-size:var(--days-std)] [@container(max-width:200px)]:hidden [@container(min-aspect-ratio:2)]:[font-size:var(--days-wide)] [@container(min-aspect-ratio:2)]:block"
                  style={
                    {
                      '--days-std': 'min(9cqh, 16cqw)',
                      '--days-wide': 'min(14cqh, 5cqw)',
                      marginTop: 'min(8px, 2cqmin)',
                      color: fontColor,
                      opacity: 0.6,
                    } as React.CSSProperties
                  }
                >
                  day{calculatedDays !== 1 ? 's' : ''} until
                </div>
                <div
                  className="font-bold [overflow-wrap:anywhere] [font-size:var(--title-std)] [@container(max-width:200px)]:[font-size:var(--title-small)] [@container(min-aspect-ratio:2)]:[font-size:var(--title-wide)]"
                  style={
                    {
                      '--title-small': `min(20cqh, 30cqw, ${(TEXT_CQW / titleWordEm).toFixed(2)}cqw)`,
                      '--title-std': `min(13cqh, 30cqw, ${(TEXT_CQW / titleWordEm).toFixed(2)}cqw)`,
                      '--title-wide': `min(24cqh, ${(46 / titleWordEm).toFixed(2)}cqw)`,
                      marginTop: 'min(6px, 1.5cqmin)',
                      paddingLeft: 'min(16px, 4cqmin)',
                      paddingRight: 'min(16px, 4cqmin)',
                      color: eventColor,
                    } as React.CSSProperties
                  }
                >
                  {title}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-start w-full h-full">
              <div
                className="font-bold flex-shrink-0 text-center w-full truncate"
                style={{
                  fontSize: 'min(24px, 8cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                  color: eventColor,
                }}
              >
                {title}
              </div>
              <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
                <div
                  className="flex flex-wrap justify-center items-center h-full w-full content-center overflow-y-auto"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    paddingBottom: 'max(12px, 3cqmin)',
                  }}
                >
                  {gridData.map((item) => (
                    <div
                      key={item.date.toISOString()}
                      className={`relative flex items-center justify-center rounded-lg border-2
                                ${
                                  item.isEvent
                                    ? 'border-amber-400 bg-amber-50'
                                    : item.isPast
                                      ? 'border-slate-200 bg-slate-50'
                                      : item.isToday
                                        ? 'border-brand-blue-primary bg-brand-blue-50'
                                        : 'border-slate-200'
                                }`}
                      style={{
                        width: 'clamp(26px, 15cqmin, 48px)',
                        height: 'clamp(26px, 15cqmin, 48px)',
                        backgroundColor: item.isEvent
                          ? undefined
                          : item.isPast
                            ? undefined
                            : item.isToday
                              ? undefined
                              : hexToRgba(cardColor, cardOpacity),
                      }}
                    >
                      {item.isPast && !item.isEvent && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-40">
                          <div className="w-full h-0.5 bg-red-500 absolute rotate-45" />
                          <div className="w-full h-0.5 bg-red-500 absolute -rotate-45" />
                        </div>
                      )}
                      {item.isEvent ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-amber-500"
                          style={{
                            width: 'min(24px, 8cqmin)',
                            height: 'min(24px, 8cqmin)',
                          }}
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      ) : (
                        <span
                          className={`font-bold ${item.isPast ? 'text-slate-400' : 'text-slate-700'}`}
                          style={{ fontSize: 'clamp(11px, 6cqmin, 20px)' }}
                        >
                          {item.number}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};

export default CountdownWidget;

import React, { useMemo } from 'react';
import { WidgetData, CountdownConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { WidgetLayout } from '../WidgetLayout';
import { hexToRgba, getFontClass } from '@/utils/styles';
import { useDashboard } from '@/context/useDashboard';

interface CountdownDay {
  date: Date;
  isPast: boolean;
  isEvent: boolean;
  isToday: boolean;
  number?: number;
}

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
  const { activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
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

  const calculatedDays = useMemo(() => {
    const start = normalizeDate(new Date(startDate));
    const event = normalizeDate(new Date(eventDate));
    const todayAtMidnight = normalizeDate(new Date());

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

    let days = 0;
    const current = new Date(countStart);

    while (current < event) {
      if (includeWeekends || !isWeekendDate(current)) {
        days++;
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [startDate, eventDate, includeWeekends, countToday]);

  const gridData = useMemo(() => {
    const start = normalizeDate(new Date(startDate));
    const event = normalizeDate(new Date(eventDate));
    const today = normalizeDate(new Date());
    const countStart = new Date(Math.max(today.getTime(), start.getTime()));

    if (!countToday && countStart.getTime() === today.getTime()) {
      countStart.setDate(countStart.getDate() + 1);
    }

    const validDays: CountdownDay[] = [];
    const countedDays: Date[] = [];
    const current = new Date(start);

    while (current <= event) {
      const normalizedCurrent = new Date(current);

      if (includeWeekends || !isWeekendDate(normalizedCurrent)) {
        const isEvent = normalizedCurrent.getTime() === event.getTime();
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
      countedDays.map((day, index) => [
        day.getTime(),
        countedDays.length - index,
      ])
    );

    return validDays.map((item) => ({
      ...item,
      number: countdownNumbers.get(item.date.getTime()),
    }));
  }, [startDate, eventDate, includeWeekends, countToday]);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`flex flex-col items-center justify-center w-full h-full overflow-hidden rounded-3xl ${fontClass}`}
          style={{
            containerType: 'size',
            padding: 'min(16px, 4cqmin)',
            backgroundColor: hexToRgba(cardColor, cardOpacity),
          }}
        >
          {viewMode === 'number' ? (
            <div className="flex flex-col items-center justify-center text-center w-full">
              <div
                className="font-bold leading-none"
                style={{ fontSize: 'min(42cqh, 55cqw)', color: fontColor }}
              >
                {calculatedDays}
              </div>
              <div
                className="font-medium"
                style={{
                  fontSize: 'min(9cqh, 16cqw)',
                  marginTop: 'min(8px, 2cqmin)',
                  color: fontColor,
                  opacity: 0.6,
                }}
              >
                day{calculatedDays !== 1 ? 's' : ''} until
              </div>
              <div
                className="font-bold text-center break-words"
                style={{
                  fontSize: 'min(13cqh, 30cqw)',
                  marginTop: 'min(6px, 1.5cqmin)',
                  paddingLeft: 'min(16px, 4cqmin)',
                  paddingRight: 'min(16px, 4cqmin)',
                  color: eventColor,
                }}
              >
                {title}
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
                  style={{ gap: 'min(4px, 1cqmin)' }}
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
                        width: 'min(48px, 15cqmin)',
                        height: 'min(48px, 15cqmin)',
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
                          style={{ fontSize: 'min(20px, 6cqmin)' }}
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

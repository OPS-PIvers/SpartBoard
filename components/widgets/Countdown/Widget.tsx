import React, { useMemo } from 'react';
import { WidgetData, CountdownConfig } from '@/types';
import { WidgetLayout } from '../WidgetLayout';

export const CountdownWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as CountdownConfig;

  const { title, startDate, eventDate, includeWeekends, countToday, viewMode } =
    config;

  const calculatedDays = useMemo(() => {
    const event = new Date(eventDate);
    const now = new Date();
    const todayAtMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    // Use current date for calculation if start date has passed
    const calcStart = new Date(todayAtMidnight);
    if (!countToday) {
      calcStart.setDate(calcStart.getDate() + 1);
    }

    const calcEvent = new Date(event);
    calcEvent.setHours(0, 0, 0, 0);

    // If event is in the past or today (and we don't count today)
    if (calcEvent < calcStart) {
      return 0;
    }

    let days = 0;
    const current = new Date(calcStart);

    while (current < calcEvent) {
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (includeWeekends || !isWeekend) {
        days++;
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [eventDate, includeWeekends, countToday]);

  const gridData = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const event = new Date(eventDate);
    event.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First, collect all valid days
    const validDays = [];
    const current = new Date(start);
    while (current <= event) {
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (includeWeekends || !isWeekend) {
        const isPast = current < today;
        const isEvent = current.getTime() === event.getTime();
        const isToday = current.getTime() === today.getTime();

        validDays.push({
          date: new Date(current),
          isPast,
          isEvent,
          isToday,
        });
      }
      current.setDate(current.getDate() + 1);
    }

    // Then, map over the collected days to add the countdown number
    return validDays.map((item, index) => ({
      ...item,
      number: validDays.length - index,
    }));
  }, [startDate, eventDate, includeWeekends]);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="flex flex-col items-center justify-center w-full h-full p-4 overflow-hidden bg-white rounded-3xl"
          style={{ containerType: 'size' }}
        >
          {viewMode === 'number' ? (
            <div className="flex flex-col items-center justify-center text-center w-full">
              <div
                className="font-bold text-slate-800 leading-none"
                style={{ fontSize: 'min(120px, 40cqmin)' }}
              >
                {calculatedDays}
              </div>
              <div
                className="font-medium text-slate-500 mt-2"
                style={{ fontSize: 'min(24px, 8cqmin)' }}
              >
                day{calculatedDays !== 1 ? 's' : ''} until
              </div>
              <div
                className="font-bold text-brand-blue-primary mt-1 px-4 text-center break-words"
                style={{ fontSize: 'min(32px, 10cqmin)' }}
              >
                {title}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-start w-full h-full">
              <div
                className="font-bold text-brand-blue-primary mb-2 flex-shrink-0 text-center w-full truncate"
                style={{ fontSize: 'min(24px, 8cqmin)' }}
              >
                {title}
              </div>
              <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
                <div className="flex flex-wrap gap-1 justify-center items-center h-full w-full content-center overflow-y-auto">
                  {gridData.map((item) => (
                    <div
                      key={item.number}
                      className={`relative flex items-center justify-center rounded-lg border-2
                                ${
                                  item.isEvent
                                    ? 'border-amber-400 bg-amber-50'
                                    : item.isPast
                                      ? 'border-slate-200 bg-slate-50'
                                      : item.isToday
                                        ? 'border-brand-blue-primary bg-brand-blue-50'
                                        : 'border-slate-200 bg-white'
                                }`}
                      style={{
                        width: 'min(48px, 15cqmin)',
                        height: 'min(48px, 15cqmin)',
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

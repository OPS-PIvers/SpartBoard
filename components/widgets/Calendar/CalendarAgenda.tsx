import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Timer, Clock, MapPin, AlignLeft, CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '@/types';
import { Modal } from '@/components/common/Modal';
import {
  formatDayHeader,
  formatTime,
  groupAgendaDays,
  isPastEvent,
  toSeconds,
} from './agendaUtils';

interface CalendarAgendaProps {
  events: CalendarEvent[];
  today: string;
  nowSeconds: number;
  pastEvents: 'hide' | 'scroll';
  fontColor: string;
  headerColor: string;
  textScale: number;
  onStartTimer: (event: CalendarEvent) => void;
}

const size = (px: number, cq: number, scale = 1) =>
  `min(${Math.round(px * scale)}px, ${(cq * scale).toFixed(2)}cqmin)`;

export const CalendarAgenda: React.FC<CalendarAgendaProps> = ({
  events,
  today,
  nowSeconds,
  pastEvents,
  fontColor,
  headerColor,
  textScale,
  onStartTimer,
}) => {
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstCurrentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => groupAgendaDays(events, today, nowSeconds, pastEvents),
    [events, today, nowSeconds, pastEvents]
  );
  const pastCount =
    pastEvents === 'scroll'
      ? (days.find(([d]) => d === today)?.[1] ?? []).filter((e) =>
          isPastEvent(e, today, nowSeconds)
        ).length
      : 0;

  // Park the scroll at the first current event so earlier ones sit above the fold.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const row = firstCurrentRef.current;
    if (!scroller || !row || pastCount === 0) return;
    scroller.scrollTop = row.offsetTop - (headerRef.current?.offsetHeight ?? 0);
  }, [pastCount]);

  const rule = `color-mix(in srgb, ${fontColor} 14%, transparent)`;
  const muted = `color-mix(in srgb, ${fontColor} 60%, transparent)`;

  return (
    <>
      <div
        ref={scrollRef}
        data-testid="calendar-agenda"
        className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar"
        style={{ paddingBottom: size(12, 3) }}
      >
        {days.map(([date, list]) => {
          const { weekday, rest } = formatDayHeader(date);
          const isToday = date === today;
          return (
            <section key={date} aria-label={`${weekday} ${rest}`.trim()}>
              <div
                ref={isToday ? headerRef : undefined}
                className="sticky top-0 z-10 flex items-baseline"
                style={{
                  gap: size(8, 2),
                  padding: `${size(10, 2.5)} ${size(16, 4)}`,
                  backgroundColor: headerColor,
                }}
              >
                <span
                  className="font-black leading-none text-white"
                  style={{ fontSize: size(26, 7, textScale) }}
                >
                  {weekday}
                </span>
                {rest && (
                  <span
                    className="font-semibold leading-none text-white/80"
                    style={{ fontSize: size(18, 5, textScale) }}
                  >
                    {rest}
                  </span>
                )}
              </div>
              {list.map((event, i) => {
                const past = isToday && isPastEvent(event, today, nowSeconds);
                const canTimer = isToday && toSeconds(event.time) > nowSeconds;
                return (
                  <div
                    key={`${event.title}-${event.time ?? ''}-${i}`}
                    ref={
                      isToday && i === pastCount ? firstCurrentRef : undefined
                    }
                    className="flex items-center"
                    style={{
                      borderTop: i === 0 ? undefined : `1px solid ${rule}`,
                      opacity: past ? 0.45 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenEvent(event)}
                      className="flex flex-1 min-w-0 items-baseline text-left hover:bg-slate-500/5 focus-visible:bg-slate-500/10 transition-colors"
                      style={{
                        gap: size(14, 3.5),
                        padding: `${size(12, 3)} ${size(16, 4)}`,
                      }}
                    >
                      <span
                        className="shrink-0 font-semibold tabular-nums"
                        style={{
                          width: size(96, 24, textScale),
                          fontSize: size(17, 4.5, textScale),
                          color: muted,
                        }}
                      >
                        {event.time ? formatTime(event.time) : 'All day'}
                      </span>
                      <span
                        className="min-w-0 truncate font-bold leading-tight"
                        style={{
                          fontSize: size(22, 6, textScale),
                          color: fontColor,
                        }}
                      >
                        {event.title}
                      </span>
                    </button>
                    {canTimer && (
                      <button
                        type="button"
                        onClick={() => onStartTimer(event)}
                        className="shrink-0 text-slate-400 hover:text-brand-blue-primary transition-colors"
                        style={{
                          padding: size(4, 1),
                          marginRight: size(12, 3),
                        }}
                        title="Start countdown to event"
                        aria-label="Start countdown to event"
                      >
                        <Timer
                          aria-hidden="true"
                          style={{
                            width: size(18, 4.5),
                            height: size(18, 4.5),
                          }}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {openEvent && (
        <EventDetailsModal
          event={openEvent}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </>
  );
};

const EventDetailsModal: React.FC<{
  event: CalendarEvent;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const { weekday, rest } = formatDayHeader(event.date);
  const day = rest ? `${weekday}, ${rest}` : weekday;
  const when = event.time
    ? `${formatTime(event.time)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ''}`
    : 'All day';
  const rows = [
    { icon: Clock, text: `${day} · ${when}` },
    ...(event.location ? [{ icon: MapPin, text: event.location }] : []),
    ...(event.calendarName
      ? [{ icon: CalendarDays, text: event.calendarName }]
      : []),
  ];
  return (
    <Modal isOpen onClose={onClose} title={event.title} maxWidth="max-w-md">
      <div className="flex flex-col text-slate-700">
        {rows.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-start gap-3 py-3 border-t border-slate-100 first:border-t-0 first:pt-0"
          >
            <Icon
              aria-hidden="true"
              className="w-5 h-5 shrink-0 text-slate-400 mt-0.5"
            />
            <span className="font-semibold break-words min-w-0">{text}</span>
          </div>
        ))}
        {event.description && (
          <div className="flex items-start gap-3 py-3 border-t border-slate-100">
            <AlignLeft
              aria-hidden="true"
              className="w-5 h-5 shrink-0 text-slate-400 mt-0.5"
            />
            <p className="whitespace-pre-line leading-relaxed break-words min-w-0">
              {event.description}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

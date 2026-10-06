import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { WidgetData, ClockConfig } from '@/types';
import { STANDARD_COLORS } from '@/config/colors';

import { WidgetLayout } from '../WidgetLayout';

// Exported for tests (jsdom drops min() font-size); the cqw cap fits the ~5.3em time line in narrow clocks.
// eslint-disable-next-line react-refresh/only-export-components
export const getClockTimeFontSize = (showSeconds: boolean): string =>
  showSeconds ? 'min(140px, 40cqmin, 16cqw)' : 'min(160px, 50cqmin, 23cqw)';

export const CLOCK_DATE_FONT_SIZE = 'min(16px, 12cqmin)';

const PROBE_PX = 100;
const DATE_RATIO = 0.17;
const MIN_DATE_PX = 9;

// Largest time and date sizes that fit the card, from probe widths measured at PROBE_PX.
// eslint-disable-next-line react-refresh/only-export-components
export const fitClockText = (
  width: number,
  height: number,
  timeEm: number,
  dateEm: number
): { time: number; date: number | null } => {
  const w = width * 0.9;
  const h = height * 0.86;
  const withDate = Math.min(w / timeEm, h / (1.04 + DATE_RATIO * 1.25));
  const date = Math.min(withDate * DATE_RATIO, w / dateEm);
  if (date >= MIN_DATE_PX) return { time: withDate, date };
  return { time: Math.min(w / timeEm, h), date: null };
};

export const ClockWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { i18n } = useTranslation();
  const globalStyle = useGlobalStyle();
  const [time, setTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const timeProbeRef = useRef<HTMLDivElement>(null);
  const dateProbeRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ time: number; date: number | null } | null>(
    null
  );

  const {
    format24 = true,
    showSeconds = true,
    themeColor = STANDARD_COLORS.slate,
    fontFamily = 'global',
    clockStyle = 'modern',
    glow = false,
    dateColor,
  } = widget.config as ClockConfig;

  // Resync the display the instant showSeconds changes, so a toggle right
  // after a minute rollover doesn't leave a stale minute up for up to 60s.
  const [prevShowSeconds, setPrevShowSeconds] = useState(showSeconds);
  if (prevShowSeconds !== showSeconds) {
    setPrevShowSeconds(showSeconds);
    setTime(new Date());
  }

  // Seconds hidden: tick once a minute instead of every second, re-deriving the
  // delay from the wall clock each tick so throttling/jank can't accumulate drift.
  useEffect(() => {
    if (showSeconds) {
      const timer = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(timer);
    }
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNextMinute = () => {
      timeout = setTimeout(
        () => {
          setTime(new Date());
          scheduleNextMinute();
        },
        60_000 - (Date.now() % 60_000)
      );
    };
    scheduleNextMinute();
    return () => clearTimeout(timeout);
  }, [showSeconds]);

  const hours = time.getHours();
  const displayHours = format24
    ? hours.toString().padStart(2, '0')
    : (hours % 12 || 12).toString();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';

  const getStyleClasses = () => {
    switch (clockStyle) {
      case 'lcd':
        return 'tracking-widest opacity-90';
      case 'minimal':
        return ' tracking-tighter';
      default:
        return '';
    }
  };

  const getFontClass = () => {
    if (fontFamily === 'global') {
      return `font-${globalStyle.fontFamily}`;
    }
    return fontFamily;
  };

  const dateLabel = time.toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const fontClass = getFontClass();
  const styleClasses = getStyleClasses();

  // Re-fit when the card resizes, fonts load, or the time format or date text changes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const timeProbe = timeProbeRef.current;
    const dateProbe = dateProbeRef.current;
    if (!el || !timeProbe || !dateProbe) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      const timeEm = timeProbe.scrollWidth / PROBE_PX;
      const dateEm = dateProbe.scrollWidth / PROBE_PX;
      if (!w || !h || !timeEm || !dateEm) return;
      const next = fitClockText(w, h, timeEm, dateEm);
      setFit((prev) =>
        prev &&
        Math.abs(prev.time - next.time) < 0.5 &&
        (prev.date === null) === (next.date === null) &&
        Math.abs((prev.date ?? 0) - (next.date ?? 0)) < 0.5
          ? prev
          : next
      );
    };
    measure();
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    ro?.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, [showSeconds, format24, clockStyle, fontClass, dateLabel]);

  const renderTimeRow = (h: string, m: string, s: string, ap: string) => (
    <>
      <span>{h}</span>
      <span
        className={`${
          clockStyle === 'minimal' ? '' : 'animate-pulse'
        } mx-[0.1em] opacity-60`}
      >
        :
      </span>
      <span>{m}</span>
      {showSeconds && (
        <>
          <span className="opacity-60 mx-[0.1em]">:</span>
          <span className="opacity-80" style={{ fontSize: '0.85em' }}>
            {s}
          </span>
        </>
      )}
      {!format24 && (
        <span
          className="opacity-70 uppercase"
          style={{ fontSize: '0.25em', marginLeft: '0.1em' }}
        >
          {ap}
        </span>
      )}
    </>
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          ref={containerRef}
          className={`relative flex flex-col items-center justify-center h-full w-full overflow-hidden ${
            clockStyle === 'lcd' ? 'bg-black/5' : ''
          }`}
          style={{ gap: fit ? `${fit.time * 0.04}px` : '1cqmin' }}
        >
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 invisible pointer-events-none flex flex-col items-start"
          >
            <div
              ref={timeProbeRef}
              className={`flex items-baseline leading-none whitespace-nowrap w-max ${fontClass} ${styleClasses}`}
              style={{ fontSize: `${PROBE_PX}px` }}
            >
              {renderTimeRow('88', '88', '88', 'MM')}
            </div>
            <div
              ref={dateProbeRef}
              className={`uppercase tracking-[0.2em] whitespace-nowrap w-max ${fontClass}`}
              style={{ fontSize: `${PROBE_PX}px`, fontWeight: 900 }}
            >
              {dateLabel}
            </div>
          </div>

          <div
            data-testid="clock-time-container"
            className={`relative flex items-baseline leading-none whitespace-nowrap transition-colors ${fontClass} ${styleClasses}`}
            style={{
              fontSize: fit
                ? `${fit.time}px`
                : getClockTimeFontSize(showSeconds),
              color: themeColor,
              textShadow: glow
                ? `0 0 0.1em ${themeColor}, 0 0 0.25em ${themeColor}66`
                : 'none',
            }}
          >
            {clockStyle === 'lcd' && (
              <div
                data-testid="clock-lcd-background"
                className="absolute inset-0 opacity-5 pointer-events-none select-none flex items-baseline"
              >
                {renderTimeRow('88', '88', '88', '')}
              </div>
            )}
            {renderTimeRow(displayHours, minutes, seconds, ampm)}
          </div>

          {(fit === null || fit.date !== null) && (
            <div
              data-testid="clock-date"
              className={`opacity-80 uppercase tracking-[0.2em] whitespace-nowrap ${fontClass}`}
              style={{
                fontSize: fit?.date ? `${fit.date}px` : CLOCK_DATE_FONT_SIZE,
                fontWeight: 900,
                color: dateColor ?? themeColor,
              }}
            >
              {dateLabel}
            </div>
          )}
        </div>
      }
    />
  );
};

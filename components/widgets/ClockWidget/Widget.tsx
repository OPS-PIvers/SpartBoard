import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { WidgetData, ClockConfig } from '@/types';
import { STANDARD_COLORS } from '@/config/colors';
import { resolveBaseTextScale } from '@/config/widgetAppearance';

import { WidgetLayout } from '../WidgetLayout';

// Exported for tests (jsdom drops min() font-size); the cqw cap fits the ~5.3em time line in narrow clocks.
// eslint-disable-next-line react-refresh/only-export-components
export const getClockTimeFontSize = (showSeconds: boolean): string =>
  showSeconds ? 'min(140px, 40cqmin, 16cqw)' : 'min(160px, 50cqmin, 23cqw)';

export const CLOCK_DATE_FONT_SIZE = 'min(16px, 12cqmin)';
export const CLOCK_DATE_ONLY_FONT_SIZE = 'min(10cqw, 30cqh)';

const PROBE_PX = 100;
const DATE_RATIO = 0.17;
const MIN_DATE_PX = 9;
const DATE_ONLY_FILL = 0.85;
const DATE_ONLY_LINE = 1.15;

type ClockFit = { time: number; date: number | null; stacked: boolean };

// Date-only size: the larger of one line or weekday over month and day, scaled by the window text size.
// eslint-disable-next-line react-refresh/only-export-components
export const fitDateOnly = (
  width: number,
  height: number,
  lineEm: number,
  stack: { weekdayEm: number; dayEm: number },
  textScale = 1
): { size: number; stacked: boolean } => {
  const w = width * 0.9;
  const h = height * 0.86;
  const row = Math.min(w / lineEm, h / DATE_ONLY_LINE);
  const twoLine = Math.min(
    w / Math.max(stack.weekdayEm, stack.dayEm),
    h / (2 * DATE_ONLY_LINE)
  );
  const fill = Math.min(1, DATE_ONLY_FILL * textScale);
  return twoLine > row * 1.1
    ? { size: twoLine * fill, stacked: true }
    : { size: row * fill, stacked: false };
};

// Largest time and date sizes that fit the card, from probe widths measured at PROBE_PX; tall cards stack the digits.
// eslint-disable-next-line react-refresh/only-export-components
export const fitClockText = (
  width: number,
  height: number,
  timeEm: number,
  dateEm: number,
  stack?: { em: number; rows: number },
  date: { show: boolean; scale: number } = { show: true, scale: 1 }
): ClockFit => {
  const w = width * 0.9;
  const h = height * 0.86;
  const ratio = DATE_RATIO * date.scale;
  const fitLines = (em: number, lines: number): ClockFit => {
    const timeOnly: ClockFit = {
      time: Math.min(w / em, h / lines),
      date: null,
      stacked: lines > 1,
    };
    if (!date.show) return timeOnly;
    const withDate = Math.min(w / em, h / (lines * 1.04 + ratio * 1.25));
    const dateSize = Math.min(withDate * ratio, w / dateEm);
    if (dateSize >= MIN_DATE_PX)
      return { time: withDate, date: dateSize, stacked: lines > 1 };
    // Time fills the width: keep the date at its smallest readable size and shrink the time to make room.
    const floor = Math.min(MIN_DATE_PX, w / dateEm);
    const time = Math.min(w / em, (h - floor * 1.25) / (lines * 1.04));
    if (floor < MIN_DATE_PX * 0.75 || time < floor) return timeOnly;
    return { time, date: floor, stacked: lines > 1 };
  };
  const row = fitLines(timeEm, 1);
  if (!stack) return row;
  const stacked = fitLines(stack.em, stack.rows);
  return stacked.time > row.time * 1.25 ? stacked : row;
};

export const ClockWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { i18n } = useTranslation();
  const globalStyle = useGlobalStyle();
  const [time, setTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const timeProbeRef = useRef<HTMLDivElement>(null);
  const dateProbeRef = useRef<HTMLDivElement>(null);
  const stackProbeRef = useRef<HTMLDivElement>(null);
  const weekdayProbeRef = useRef<HTMLDivElement>(null);
  const monthDayProbeRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<ClockFit | null>(null);
  const [dateFit, setDateFit] = useState<{
    size: number;
    stacked: boolean;
  } | null>(null);

  const {
    format24 = true,
    showSeconds = true,
    showTime = true,
    showDate = true,
    themeColor = STANDARD_COLORS.slate,
    fontFamily = 'global',
    clockStyle = 'modern',
    glow = false,
    dateColor,
  } = widget.config as ClockConfig;

  const textScale = resolveBaseTextScale(widget.baseTextSize);
  const tickSeconds = showSeconds && showTime;
  const dateOnly = !showTime;

  // Resync the display the instant the tick rate changes, so a toggle right
  // after a minute rollover doesn't leave a stale minute up for up to 60s.
  const [prevTickSeconds, setPrevTickSeconds] = useState(tickSeconds);
  if (prevTickSeconds !== tickSeconds) {
    setPrevTickSeconds(tickSeconds);
    setTime(new Date());
  }

  // Seconds hidden: tick once a minute instead of every second, re-deriving the
  // delay from the wall clock each tick so throttling/jank can't accumulate drift.
  useEffect(() => {
    if (tickSeconds) {
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
  }, [tickSeconds]);

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
  const weekdayLabel = time.toLocaleDateString(i18n.language, {
    weekday: 'long',
  });
  const monthDayLabel = time.toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
  });
  const fontClass = getFontClass();
  const styleClasses = getStyleClasses();
  const probeHours = displayHours.replace(/\d/g, '8');
  const stackRows = (showSeconds ? 3 : 2) + (format24 ? 0 : 0.3);

  // Re-fit when the card resizes, fonts load, or the time format or date text changes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const timeProbe = timeProbeRef.current;
    const dateProbe = dateProbeRef.current;
    const stackProbe = stackProbeRef.current;
    const weekdayProbe = weekdayProbeRef.current;
    const monthDayProbe = monthDayProbeRef.current;
    if (
      !el ||
      !timeProbe ||
      !dateProbe ||
      !stackProbe ||
      !weekdayProbe ||
      !monthDayProbe
    )
      return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      const timeEm = timeProbe.scrollWidth / PROBE_PX;
      const dateEm = dateProbe.scrollWidth / PROBE_PX;
      if (!w || !h || !timeEm || !dateEm) return;
      if (dateOnly) {
        const nextDate = fitDateOnly(
          w,
          h,
          dateEm,
          {
            weekdayEm: weekdayProbe.scrollWidth / PROBE_PX,
            dayEm: monthDayProbe.scrollWidth / PROBE_PX,
          },
          textScale
        );
        setDateFit((prev) =>
          prev &&
          prev.stacked === nextDate.stacked &&
          Math.abs(prev.size - nextDate.size) < 0.5
            ? prev
            : nextDate
        );
        return;
      }
      const next = fitClockText(
        w,
        h,
        timeEm,
        dateEm,
        { em: stackProbe.scrollWidth / PROBE_PX, rows: stackRows },
        { show: showDate, scale: textScale }
      );
      setFit((prev) =>
        prev &&
        prev.stacked === next.stacked &&
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
  }, [
    showSeconds,
    format24,
    clockStyle,
    fontClass,
    dateLabel,
    weekdayLabel,
    monthDayLabel,
    probeHours,
    stackRows,
    dateOnly,
    showDate,
    textScale,
  ]);

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

  const renderStack = (h: string, m: string, s: string, ap: string) => (
    <div className="flex flex-col items-center leading-none">
      <span>{h}</span>
      <span>{m}</span>
      {showSeconds && <span className="opacity-80">{s}</span>}
      {!format24 && (
        <span className="opacity-70 uppercase" style={{ fontSize: '0.3em' }}>
          {ap}
        </span>
      )}
    </div>
  );

  const stacked = fit?.stacked ?? false;
  const renderTime = stacked ? renderStack : renderTimeRow;
  const dateClasses = `opacity-80 uppercase tracking-[0.2em] whitespace-nowrap ${fontClass}`;
  const dateTextColor = dateColor ?? themeColor;

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
          {dateOnly ? (
            <div
              data-testid="clock-date"
              className={`${dateClasses} flex flex-col items-center text-center`}
              style={{
                fontSize: dateFit
                  ? `${dateFit.size}px`
                  : CLOCK_DATE_ONLY_FONT_SIZE,
                lineHeight: DATE_ONLY_LINE,
                // Balances the trailing letter-spacing so the lines sit centered.
                paddingLeft: '0.2em',
                fontWeight: 900,
                color: dateTextColor,
                textShadow: glow
                  ? `0 0 0.1em ${dateTextColor}, 0 0 0.25em ${dateTextColor}66`
                  : 'none',
              }}
            >
              {dateFit?.stacked ? (
                <>
                  <span>{weekdayLabel} </span>
                  <span>{monthDayLabel}</span>
                </>
              ) : (
                dateLabel
              )}
            </div>
          ) : (
            <>
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
                    className="absolute inset-0 opacity-5 pointer-events-none select-none flex items-baseline justify-center"
                  >
                    {renderTime('88', '88', '88', '')}
                  </div>
                )}
                {renderTime(displayHours, minutes, seconds, ampm)}
              </div>

              {showDate && (fit === null || fit.date !== null) && (
                <div
                  data-testid="clock-date"
                  className={dateClasses}
                  style={{
                    fontSize: fit?.date
                      ? `${fit.date}px`
                      : CLOCK_DATE_FONT_SIZE,
                    fontWeight: 900,
                    color: dateTextColor,
                  }}
                >
                  {dateLabel}
                </div>
              )}
            </>
          )}
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 invisible pointer-events-none flex flex-col items-start"
          >
            <div
              ref={timeProbeRef}
              className={`flex items-baseline leading-none whitespace-nowrap w-max ${fontClass} ${styleClasses}`}
              style={{ fontSize: `${PROBE_PX}px` }}
            >
              {renderTimeRow(probeHours, '88', '88', 'MM')}
            </div>
            <div
              ref={stackProbeRef}
              className={`leading-none whitespace-nowrap w-max ${fontClass} ${styleClasses}`}
              style={{ fontSize: `${PROBE_PX}px` }}
            >
              88
            </div>
            <div
              ref={dateProbeRef}
              className={`uppercase tracking-[0.2em] whitespace-nowrap w-max ${fontClass}`}
              style={{ fontSize: `${PROBE_PX}px`, fontWeight: 900 }}
            >
              {dateLabel}
            </div>
            <div
              ref={weekdayProbeRef}
              className={`uppercase tracking-[0.2em] whitespace-nowrap w-max ${fontClass}`}
              style={{ fontSize: `${PROBE_PX}px`, fontWeight: 900 }}
            >
              {weekdayLabel}
            </div>
            <div
              ref={monthDayProbeRef}
              className={`uppercase tracking-[0.2em] whitespace-nowrap w-max ${fontClass}`}
              style={{ fontSize: `${PROBE_PX}px`, fontWeight: 900 }}
            >
              {monthDayLabel}
            </div>
          </div>
        </div>
      }
    />
  );
};

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { WidgetData, ClockConfig } from '@/types';
import { STANDARD_COLORS } from '@/config/colors';

import { WidgetLayout } from '../WidgetLayout';

// Exported so tests can assert on the formula directly (jsdom drops min()/clamp() font-size from the rendered DOM).
// eslint-disable-next-line react-refresh/only-export-components
export const getClockTimeFontSize = (showSeconds: boolean): string =>
  showSeconds ? 'min(140px, 40cqmin)' : 'min(160px, 50cqmin)';

export const CLOCK_DATE_FONT_SIZE = 'min(16px, 12cqmin)';

export const ClockWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { i18n } = useTranslation();
  const globalStyle = useGlobalStyle();
  const [time, setTime] = useState(new Date());

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

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`flex flex-col items-center justify-center h-full w-full transition-all duration-500 ${
            clockStyle === 'lcd' ? 'bg-black/5' : ''
          }`}
          style={{ gap: '1cqmin' }}
        >
          <div
            data-testid="clock-time-container"
            className={`flex items-baseline leading-none transition-all ${getFontClass()} ${getStyleClasses()}`}
            style={{
              fontSize: getClockTimeFontSize(showSeconds),
              color: themeColor,
              textShadow: glow
                ? `0 0 0.1em ${themeColor}, 0 0 0.25em ${themeColor}66`
                : 'none',
            }}
          >
            {clockStyle === 'lcd' && (
              <div
                data-testid="clock-lcd-background"
                className="absolute opacity-5 pointer-events-none select-none flex"
              >
                <span>88</span>
                <span className="mx-[0.25em]">:</span>
                <span>88</span>
                {showSeconds && (
                  <>
                    <span className="mx-[0.25em]">:</span>
                    <span>88</span>
                  </>
                )}
              </div>
            )}

            <span>{displayHours}</span>
            <span
              className={`${
                clockStyle === 'minimal' ? '' : 'animate-pulse'
              } mx-[0.1em] opacity-60`}
            >
              :
            </span>
            <span>{minutes}</span>

            {showSeconds && (
              <>
                <span className="opacity-60 mx-[0.1em]">:</span>
                <span className="opacity-80" style={{ fontSize: '0.85em' }}>
                  {seconds}
                </span>
              </>
            )}

            {!format24 && (
              <span
                className="opacity-70 uppercase"
                style={{ fontSize: '0.25em', marginLeft: '0.1em' }}
              >
                {ampm}
              </span>
            )}
          </div>

          <div
            data-testid="clock-date"
            className={`opacity-80 uppercase tracking-[0.2em] ${getFontClass()}`}
            style={{
              fontSize: CLOCK_DATE_FONT_SIZE,
              fontWeight: 900,
              color: dateColor ?? themeColor,
            }}
          >
            {time.toLocaleDateString(i18n.language, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
      }
    />
  );
};

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../../../context/useDashboard';
import { WidgetData, ClockConfig, DEFAULT_GLOBAL_STYLE } from '../../../types';
import { STANDARD_COLORS } from '../../../config/colors';

import { WidgetLayout } from '../WidgetLayout';

export const ClockWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { i18n } = useTranslation();
  const { activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const {
    format24 = true,
    showSeconds = true,
    themeColor = STANDARD_COLORS.slate,
    fontFamily = 'global',
    clockStyle = 'modern',
    glow = false,
  } = widget.config as ClockConfig;

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
          className={`flex flex-col items-center justify-center h-full w-full gap-[0.5cqh] transition-all duration-500 ${
            clockStyle === 'lcd' ? 'bg-black/5' : ''
          }`}
        >
          <div
            data-testid="clock-time-container"
            className={`flex items-baseline leading-none transition-all ${getFontClass()} ${getStyleClasses()}`}
            style={{
              fontSize: showSeconds ? 'min(82cqh, 20cqw)' : 'min(82cqh, 25cqw)',
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
              } mx-[0.1em] opacity-30`}
            >
              :
            </span>
            <span>{minutes}</span>

            {showSeconds && (
              <>
                <span className="opacity-30 mx-[0.1em]">:</span>
                <span className="opacity-60" style={{ fontSize: '0.7em' }}>
                  {seconds}
                </span>
              </>
            )}

            {!format24 && (
              <span
                className="opacity-40 ml-2 uppercase"
                style={{ fontSize: '0.25em' }}
              >
                {ampm}
              </span>
            )}
          </div>

          <div
            className={`opacity-60 uppercase tracking-[0.2em] text-slate-900 ${getFontClass()}`}
            style={{ fontSize: 'min(12cqh, 80cqw)', fontWeight: 900 }}
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

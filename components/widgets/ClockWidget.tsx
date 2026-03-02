import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../../context/useDashboard';
import { WidgetData, ClockConfig, DEFAULT_GLOBAL_STYLE } from '../../types';
import { Type, Palette, Sun, Sparkles } from 'lucide-react';
import { WIDGET_PALETTE, STANDARD_COLORS } from '../../config/colors';
import { SettingsLabel } from '../common/SettingsLabel';

import { WidgetLayout } from './WidgetLayout';

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
              <div className="absolute opacity-5 pointer-events-none select-none flex">
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

export const ClockSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { t } = useTranslation();
  const { updateWidget } = useDashboard();
  const config = widget.config as ClockConfig;

  const fonts = [
    { id: 'global', label: t('widgets.clock.fonts.inherit'), icon: 'G' },
    { id: 'font-mono', label: t('widgets.clock.fonts.digital'), icon: '01' },
    { id: 'font-sans', label: t('widgets.clock.fonts.modern'), icon: 'Aa' },
    {
      id: 'font-handwritten',
      label: t('widgets.clock.fonts.school'),
      icon: '✏️',
    },
  ];

  const colors = WIDGET_PALETTE;

  const styles = [
    { id: 'modern', label: t('widgets.clock.styles.default') },
    { id: 'lcd', label: t('widgets.clock.styles.lcd') },
    { id: 'minimal', label: t('widgets.clock.styles.minimal') },
  ];

  return (
    <div className="space-y-6">
      {/* Time Format */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, format24: !config.format24 },
            })
          }
          className={`p-2 rounded-lg text-xxs font-black uppercase tracking-widest border-2 transition-all ${config.format24 ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600'}`}
        >
          {t('widgets.clock.format24')}
        </button>
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, showSeconds: !config.showSeconds },
            })
          }
          className={`p-2 rounded-lg text-xxs font-black uppercase tracking-widest border-2 transition-all ${config.showSeconds ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600'}`}
        >
          {t('widgets.clock.showSeconds')}
        </button>
      </div>

      {/* Font Family */}
      <div>
        <SettingsLabel icon={Type}>
          {t('widgets.clock.typography')}
        </SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {fonts.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id },
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${config.fontFamily === f.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-[8px] font-black uppercase text-slate-500 tracking-tighter">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Clock Style */}
      <div>
        <SettingsLabel icon={Sparkles}>
          {t('widgets.clock.displayStyle')}
        </SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {styles.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, clockStyle: s.id },
                })
              }
              className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-all ${config.clockStyle === s.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color & Glow */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <SettingsLabel icon={Palette}>
            {t('widgets.clock.colorPalette')}
          </SettingsLabel>
          <div className="flex gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, themeColor: c },
                  })
                }
                className={`w-6 h-6 rounded-full border-2 transition-all ${config.themeColor === c ? 'border-slate-800 scale-125 shadow-md' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, glow: !config.glow },
            })
          }
          className={`p-2 rounded-lg border-2 flex items-center gap-2 transition-all ${config.glow ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
        >
          <Sun className={`w-4 h-4 ${config.glow ? 'fill-current' : ''}`} />
          <span className="text-xxs font-black uppercase tracking-widest">
            {t('widgets.clock.glow')}
          </span>
        </button>
      </div>
    </div>
  );
};

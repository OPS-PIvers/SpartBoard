import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TimeToolConfig,
  WidgetData,
  DEFAULT_GLOBAL_STYLE,
} from '../../../types';
import { useDashboard } from '../../../context/useDashboard';
import { useTimeTool } from './useTimeTool';
import {
  Play,
  Pause,
  RotateCcw,
  Bell,
  Check,
  Delete,
  Timer as TimerIcon,
  Clock as ClockIcon,
  Type,
  Palette,
  Sun,
  Sparkles,
} from 'lucide-react';
import { WIDGET_PALETTE, STANDARD_COLORS } from '../../../config/colors';
import { WidgetLayout } from '../WidgetLayout';
import { SettingsLabel } from '../../common/SettingsLabel';

// ─── Helpers ────────────────────────────────────────────────────────────────

const PRESETS = [60, 180, 300] as const;
const SOUNDS = ['Chime', 'Blip', 'Gong', 'Alert'] as const;

const presetLabel = (s: number) => (s >= 60 ? `${s / 60}m` : `${s}s`);

// ─── Progress Ring ──────────────────────────────────────────────────────────

const ProgressRing: React.FC<{
  progress: number; // 0 to 1
  ringColor: string;
}> = ({ progress, ringColor }) => {
  const CIRCUMFERENCE = 2 * Math.PI * 95;
  const offset = CIRCUMFERENCE - progress * CIRCUMFERENCE;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 220 220"
      preserveAspectRatio="xMidYMid meet"
    >
      <circle
        className="opacity-5"
        stroke="currentColor"
        strokeWidth="12"
        fill="transparent"
        r="95"
        cx="110"
        cy="110"
      />
      <circle
        className="transition-colors duration-300 ease-linear"
        stroke={ringColor}
        strokeWidth="12"
        strokeLinecap="round"
        fill="transparent"
        r="95"
        cx="110"
        cy="110"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
    </svg>
  );
};

// ─── Keypad ─────────────────────────────────────────────────────────────────

const Keypad: React.FC<{
  onConfirm: (totalSeconds: number) => void;
  onCancel: () => void;
  initialSeconds: number;
}> = ({ onConfirm, onCancel, initialSeconds }) => {
  const { t } = useTranslation();
  const [activeField, setActiveField] = useState<'min' | 'sec'>('min');
  const [editValues, setEditValues] = useState({
    min: Math.floor(initialSeconds / 60)
      .toString()
      .padStart(3, '0'),
    sec: Math.floor(initialSeconds % 60)
      .toString()
      .padStart(2, '0'),
  });

  const handleInput = (num: string) => {
    setEditValues((prev) => {
      const current = prev[activeField];
      const limit = activeField === 'min' ? 3 : 2;
      let next = (current + num).slice(-limit).padStart(limit, '0');
      if (activeField === 'sec' && parseInt(next) > 59) next = '59';
      return { ...prev, [activeField]: next };
    });
  };

  const handleBackspace = () => {
    setEditValues((prev) => {
      const limit = activeField === 'min' ? 3 : 2;
      return {
        ...prev,
        [activeField]: prev[activeField].slice(0, -1).padStart(limit, '0'),
      };
    });
  };

  const handlePreset = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    setEditValues({
      min: mins.toString().padStart(3, '0'),
      sec: secs.toString().padStart(2, '0'),
    });
  };

  const btnBase =
    'flex items-center justify-center font-black transition-all active:scale-95 w-full h-full';

  const btnColor =
    'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

  const presetBtnColor =
    'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600';

  return (
    <div className="flex flex-col items-center justify-center w-full h-full animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
      <div
        className="flex flex-col items-center w-full h-full"
        style={{
          gap: 'min(12px, 2.5cqmin)',

          maxWidth: 'min(400px, 90cqw, 75cqh)',

          padding: 'min(12px, 3cqmin)',
        }}
      >
        {/* Time display row - Unified styling */}

        <div
          className="flex items-center font-mono font-black tabular-nums shrink-0"
          style={{
            fontSize: 'min(16cqh, 12cqw)',

            gap: 'min(8px, 2cqmin)',
          }}
        >
          <button
            onClick={() => setActiveField('min')}
            className={`border-2 transition-all ${
              activeField === 'min'
                ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary scale-105 shadow-md'
                : 'border-transparent bg-slate-100 text-slate-400 opacity-60 hover:opacity-100'
            }`}
            style={{
              padding: 'min(4px, 1.5cqh) min(16px, 4cqw)',

              borderRadius: 'min(12px, 3cqmin)',
            }}
          >
            {editValues.min}
          </button>

          <span className="text-slate-300 opacity-30">:</span>

          <button
            onClick={() => setActiveField('sec')}
            className={`border-2 transition-all ${
              activeField === 'sec'
                ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary scale-105 shadow-md'
                : 'border-transparent bg-slate-100 text-slate-400 opacity-60 hover:opacity-100'
            }`}
            style={{
              padding: 'min(4px, 1.5cqh) min(16px, 4cqw)',

              borderRadius: 'min(12px, 3cqmin)',
            }}
          >
            {editValues.sec}
          </button>
        </div>

        {/* Preset buttons row */}

        <div
          className="grid grid-cols-3 w-full shrink-0"
          style={{
            gap: 'min(8px, 1.5cqmin)',

            fontSize: 'min(4cqh, 4cqmin)',
          }}
        >
          {PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => handlePreset(s)}
              className={`rounded-xl font-black transition-all active:scale-95 ${presetBtnColor}`}
              style={{ padding: 'min(8px, 2cqmin)' }}
            >
              {presetLabel(s)}
            </button>
          ))}
        </div>

        {/* Numpad grid - The flexible centerpiece */}

        <div
          className="grid grid-cols-3 w-full flex-1 min-h-0"
          style={{
            gap: 'min(8px, 1.5cqmin)',

            fontSize: 'min(6cqh, 6cqmin)',
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => handleInput(n.toString())}
              className={`${btnBase} ${btnColor}`}
              style={{ borderRadius: 'min(16px, 3cqmin)' }}
            >
              {n}
            </button>
          ))}

          <button
            onClick={handleBackspace}
            className={`${btnBase} ${btnColor}`}
            style={{ borderRadius: 'min(16px, 3cqmin)' }}
            aria-label={t('widgets.timeTool.backspace')}
          >
            <Delete style={{ width: '1.2em', height: '1.2em' }} />
          </button>

          <button
            onClick={() => handleInput('0')}
            className={`${btnBase} ${btnColor}`}
            style={{ borderRadius: 'min(16px, 3cqmin)' }}
          >
            0
          </button>

          <button
            onClick={() =>
              onConfirm(
                parseInt(editValues.min) * 60 + parseInt(editValues.sec)
              )
            }
            className={`${btnBase} bg-brand-blue-primary text-white shadow-xl hover:bg-brand-blue-light`}
            style={{ borderRadius: 'min(16px, 3cqmin)' }}
            aria-label={t('widgets.timeTool.confirmTime')}
          >
            <Check
              style={{ width: '1.4em', height: '1.4em' }}
              strokeWidth={4}
            />
          </button>
        </div>

        <button
          onClick={onCancel}
          className="shrink-0 font-black uppercase tracking-widest text-slate-400 hover:text-brand-red-primary hover:bg-brand-red-lighter/20 transition-all"
          style={{
            fontSize: 'min(12px, 3.5cqmin)',

            padding: 'min(4px, 1cqh) min(16px, 4cqw)',

            borderRadius: '999px',
          }}
          aria-label={t('widgets.timeTool.closeKeypad')}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

// ─── Main Widget ────────────────────────────────────────────────────────────

export const TimeToolWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const {
    displayTime,
    isRunning,
    mode,
    config,
    handleStart,
    handleStop,
    handleReset,
    setTime,
  } = useTimeTool(widget);

  const [isEditing, setIsEditing] = useState(false);

  const isVisual = config.visualType === 'visual';

  const {
    themeColor = STANDARD_COLORS.slate,
    glow = false,
    fontFamily = 'global',
    clockStyle = 'modern',
  } = config;

  // ─── Parse time into parts ───────────────────────────────────────

  const timeParts = useMemo(() => {
    const mins = Math.floor(displayTime / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(displayTime % 60)
      .toString()
      .padStart(2, '0');
    const tenths = Math.floor((displayTime % 1) * 10).toString();
    return { mins, secs, tenths };
  }, [displayTime]);

  // ─── Derived styles ──────────────────────────────────────────────

  const getTimeColor = () => {
    if (mode === 'timer') {
      if (displayTime <= 60) return STANDARD_COLORS.red;
      if (displayTime / config.duration <= 0.25) return STANDARD_COLORS.amber;
    }
    return themeColor;
  };

  const getRingColor = () => {
    if (mode === 'timer') {
      if (displayTime <= 60) return STANDARD_COLORS.red;
      if (config.duration > 0 && displayTime / config.duration <= 0.25) {
        return STANDARD_COLORS.amber;
      }
    }
    return themeColor;
  };

  const getStyleClasses = () => {
    switch (clockStyle) {
      case 'lcd':
        return 'tracking-widest opacity-90';
      case 'minimal':
        return 'tracking-tighter';
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

  const progress =
    mode === 'timer' && config.duration > 0 ? displayTime / config.duration : 1;

  const timeColor = getTimeColor();

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full flex flex-col items-center justify-center transition-all duration-500 ${
            clockStyle === 'lcd' ? 'bg-black/5' : ''
          }`}
        >
          {isEditing ? (
            <Keypad
              initialSeconds={config.elapsedTime}
              onConfirm={(s) => {
                setTime(s);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              {/* Main centering container for the time */}
              <div className="flex-1 min-h-0 w-full flex items-center justify-center relative">
                {/* Visual Ring (Absolute to widget, behind everything) */}
                {isVisual && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      width: 'min(90%, 90cqmin)',
                      height: 'min(90%, 90cqmin)',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <ProgressRing
                      progress={progress}
                      ringColor={getRingColor()}
                    />
                  </div>
                )}

                {/* The core centering unit: Time + Absolute Controls */}
                <div className="relative flex flex-col items-center justify-center">
                  <button
                    onClick={() => {
                      if (!isRunning && mode === 'timer') setIsEditing(true);
                    }}
                    disabled={isRunning || mode !== 'timer'}
                    className={`relative z-10 flex items-baseline leading-none transition-all ${getFontClass()} ${getStyleClasses()} ${
                      !isRunning && mode === 'timer'
                        ? 'cursor-pointer hover:scale-105 active:scale-95'
                        : 'cursor-default'
                    }`}
                    style={{
                      fontSize: isVisual
                        ? 'min(22cqmin, 12rem)'
                        : mode === 'stopwatch'
                          ? 'min(55cqh, 18cqw)'
                          : 'min(55cqh, 25cqw)',
                      color: timeColor,
                      textShadow: glow
                        ? `0 0 0.1em ${timeColor}, 0 0 0.25em ${timeColor}66`
                        : 'none',
                    }}
                  >
                    {clockStyle === 'lcd' && !isVisual && (
                      <div
                        className="absolute opacity-5 pointer-events-none select-none flex"
                        aria-hidden="true"
                        role="presentation"
                      >
                        <span>88</span>
                        <span className="mx-[0.25em]">:</span>
                        <span>88</span>
                        {mode === 'stopwatch' && (
                          <>
                            <span className="opacity-30 mx-[0.05em]">.</span>
                            <span>8</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Minutes and colon (shared between timer/stopwatch) */}
                    <span>{timeParts.mins}</span>
                    <span
                      className={`${clockStyle === 'minimal' ? '' : 'animate-pulse'} mx-[0.1em] opacity-30`}
                    >
                      :
                    </span>
                    <span>{timeParts.secs}</span>
                    {/* Tenths digit (stopwatch only) */}
                    {mode === 'stopwatch' && (
                      <>
                        <span
                          className="opacity-30 mx-[0.05em]"
                          style={{ fontSize: '0.5em' }}
                        >
                          .
                        </span>
                        <span
                          className="opacity-60"
                          style={{ fontSize: '0.5em' }}
                        >
                          {timeParts.tenths}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Square Controls - Positioned below the centerline without pushing it */}
                  <div
                    className="absolute z-10 flex items-center justify-center"
                    style={{
                      top: isVisual ? '120%' : '110%',
                      gap: 'min(12px, 3cqmin)',
                    }}
                  >
                    <button
                      onClick={
                        isRunning
                          ? () => handleStop()
                          : () => void handleStart()
                      }
                      className={`aspect-square flex items-center justify-center rounded-2xl transition-all active:scale-95 shadow-lg ${
                        isRunning
                          ? 'bg-slate-200/60 text-slate-500'
                          : 'bg-brand-blue-primary text-white shadow-brand-blue-primary/20'
                      }`}
                      style={{
                        width: isVisual
                          ? 'min(15cqmin, 64px)'
                          : 'min(15cqh, 12cqw)',
                        height: isVisual
                          ? 'min(15cqmin, 64px)'
                          : 'min(15cqh, 12cqw)',
                      }}
                    >
                      {isRunning ? (
                        <Pause
                          style={{ width: '50%', height: '50%' }}
                          fill="currentColor"
                        />
                      ) : (
                        <Play
                          style={{
                            width: '50%',
                            height: '50%',
                            marginLeft: '10%',
                          }}
                          fill="currentColor"
                        />
                      )}
                    </button>
                    <button
                      onClick={handleReset}
                      className="aspect-square flex items-center justify-center rounded-2xl bg-slate-200/60 text-slate-400 hover:bg-slate-300/70 hover:text-brand-blue-primary transition-all active:scale-95 shadow-sm"
                      style={{
                        width: isVisual
                          ? 'min(15cqmin, 64px)'
                          : 'min(15cqh, 12cqw)',
                        height: isVisual
                          ? 'min(15cqmin, 64px)'
                          : 'min(15cqh, 12cqw)',
                      }}
                      aria-label="Reset"
                    >
                      <RotateCcw style={{ width: '50%', height: '50%' }} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      }
    />
  );
};

// ─── Settings Panel ─────────────────────────────────────────────────────────

export const TimeToolSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as TimeToolConfig;
  const {
    timerEndVoiceLevel,
    timerEndTrafficColor,
    fontFamily = 'global',
    clockStyle = 'modern',
    themeColor = STANDARD_COLORS.slate,
  } = config;

  const hasExpectations = activeDashboard?.widgets.some(
    (w) => w.type === 'expectations'
  );

  const hasTrafficLight = activeDashboard?.widgets.some(
    (w) => w.type === 'traffic'
  );

  const fonts = [
    { id: 'global', label: t('widgets.clock.fonts.inherit'), icon: 'G' },
    { id: 'font-mono', label: t('widgets.clock.fonts.digital'), icon: '01' },
    { id: 'font-sans', label: t('widgets.clock.fonts.modern'), icon: 'Aa' },
    {
      id: 'font-handwritten',
      label: t('widgets.clock.fonts.school'),
      icon: '\u270F\uFE0F',
    },
  ];

  const styles = [
    { id: 'modern', label: t('widgets.clock.styles.default') },
    { id: 'lcd', label: t('widgets.clock.styles.lcd') },
    { id: 'minimal', label: t('widgets.clock.styles.minimal') },
  ];

  const colors = WIDGET_PALETTE;

  return (
    <div className="space-y-6 p-1">
      {/* Mode Selection */}
      <div>
        <SettingsLabel icon={TimerIcon}>
          {t('widgets.timeTool.mode')}
        </SettingsLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['timer', 'stopwatch'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                if (m === 'timer') {
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      mode: 'timer',
                      duration: 600,
                      elapsedTime: 600,
                      isRunning: false,
                      startTime: null,
                    },
                  });
                } else {
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      mode: 'stopwatch',
                      elapsedTime: 0,
                      isRunning: false,
                      startTime: null,
                    },
                  });
                }
              }}
              className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 flex items-center justify-center gap-2 ${
                config.mode === m
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {m === 'timer' ? (
                <TimerIcon size={14} />
              ) : (
                <ClockIcon size={14} />
              )}
              {m === 'timer'
                ? t('widgets.timeTool.timer')
                : t('widgets.timeTool.stopwatch')}
            </button>
          ))}
        </div>
      </div>

      {/* Display Style */}
      <div>
        <SettingsLabel icon={Sparkles}>
          {t('widgets.clock.displayStyle')}
        </SettingsLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['digital', 'visual'] as const).map((v) => (
            <button
              key={v}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, visualType: v },
                })
              }
              className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                config.visualType === v
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {v === 'digital'
                ? t('widgets.timeTool.digital')
                : t('widgets.timeTool.visualRing')}
            </button>
          ))}
        </div>
      </div>

      {/* Sound Selector */}
      <div>
        <SettingsLabel icon={Bell}>
          {t('widgets.timeTool.alertSound')}
        </SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {SOUNDS.map((s) => (
            <button
              key={s}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, selectedSound: s },
                })
              }
              className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                config.selectedSound === s
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
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
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${fontFamily === f.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <span
                className={`text-sm ${f.id === 'global' ? 'font-sans' : f.id} text-slate-900`}
              >
                {f.icon}
              </span>
              <span className="text-xxxs font-black uppercase text-slate-500 tracking-tighter">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Clock Style */}
      <div>
        <SettingsLabel icon={Sparkles}>
          {t('widgets.timeTool.numberStyle')}
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
              className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-all ${clockStyle === s.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
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
                className={`w-6 h-6 rounded-full border-2 transition-all ${themeColor === c ? 'border-slate-800 scale-125 shadow-md' : 'border-transparent hover:scale-110'}`}
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

      {/* Timer End Action */}
      <div>
        <SettingsLabel icon={Bell}>
          {t('widgets.timeTool.timerEndAction')}
        </SettingsLabel>

        {!hasExpectations ? (
          <div className="text-xs text-brand-red-primary bg-brand-red-lighter/20 p-4 rounded-2xl border border-brand-red-lighter/30 flex items-start gap-3">
            <span className="text-xl mt-0.5">&#128161;</span>
            <p className="font-bold leading-snug">
              {t('widgets.timeTool.addExpectationsTip')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight">
              {t('widgets.timeTool.switchToVoiceLevel')}:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndVoiceLevel: null },
                  })
                }
                className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                  timerEndVoiceLevel == null
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t('sidebar.widgets.none')}
              </button>
              {[0, 1, 2, 3, 4].map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, timerEndVoiceLevel: level },
                    })
                  }
                  className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                    timerEndVoiceLevel === level
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {t('widgets.timeTool.level')} {level}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 mt-4">
          <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2">
            {t('widgets.timeTool.autoSetTrafficLight')}:
          </p>
          {!hasTrafficLight ? (
            <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 flex items-start gap-2">
              <span className="text-lg mt-px">&#128161;</span>
              <p className="font-medium leading-snug">
                {t('widgets.timeTool.addTrafficLightTip')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTrafficColor: null },
                  })
                }
                className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                  timerEndTrafficColor == null
                    ? 'bg-brand-gray-darkest border-brand-gray-darkest text-white'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t('sidebar.widgets.none')}
              </button>
              {/* Red */}
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTrafficColor: 'red' },
                  })
                }
                className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                  timerEndTrafficColor === 'red'
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t('widgets.timeTool.stop')}
              </button>
              {/* Yellow */}
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTrafficColor: 'yellow' },
                  })
                }
                className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                  timerEndTrafficColor === 'yellow'
                    ? 'bg-yellow-300 border-yellow-300 text-yellow-900'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t('widgets.timeTool.slow')}
              </button>
              {/* Green */}
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTrafficColor: 'green' },
                  })
                }
                className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                  timerEndTrafficColor === 'green'
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t('widgets.timeTool.go')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

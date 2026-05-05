import React from 'react';
import { useTranslation } from 'react-i18next';
import { TimeToolConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WIDGET_PALETTE, STANDARD_COLORS } from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Toggle } from '@/components/common/Toggle';
import {
  Bell,
  Sun,
  Timer as TimerIcon,
  Clock as ClockIcon,
  Type,
  Palette,
  Sparkles,
  PlusSquare,
} from 'lucide-react';

const ADJUST_STEP_MIN = 1;
const ADJUST_STEP_MAX = 600;
const ADJUST_STEP_DEFAULT = 60;

const clampAdjustStep = (n: number) =>
  Math.max(ADJUST_STEP_MIN, Math.min(ADJUST_STEP_MAX, n));

const SOUNDS = ['Chime', 'Blip', 'Gong', 'Alert'] as const;

export const TimeToolSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as TimeToolConfig;
  const {
    timerEndVoiceLevel,
    timerEndTrafficColor,
    timerEndTriggerRandom,
    timerEndTriggerNextUp,
    timerEndTriggerStationsRotate,
  } = config;

  const hasExpectations = activeDashboard?.widgets.some(
    (w) => w.type === 'expectations'
  );

  const hasTrafficLight = activeDashboard?.widgets.some(
    (w) => w.type === 'traffic'
  );

  const hasRandomizer = activeDashboard?.widgets.some(
    (w) => w.type === 'random'
  );

  const hasNextUp = activeDashboard?.widgets.some((w) => w.type === 'nextUp');

  const hasStations = activeDashboard?.widgets.some(
    (w) => w.type === 'stations'
  );

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

      {/* Adjust step (used by the on-face +/- buttons while a timer is running) */}
      {config.mode === 'timer' && (
        <div>
          <SettingsLabel icon={PlusSquare}>
            {t('widgets.timeTool.adjustStep')}
          </SettingsLabel>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={ADJUST_STEP_MIN}
              max={ADJUST_STEP_MAX}
              value={config.adjustStepSeconds ?? ADJUST_STEP_DEFAULT}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                const next = Number.isFinite(parsed)
                  ? clampAdjustStep(parsed)
                  : ADJUST_STEP_DEFAULT;
                updateWidget(widget.id, {
                  config: { ...config, adjustStepSeconds: next },
                });
              }}
              className="w-24 px-3 py-2 rounded-lg border-2 border-slate-200 bg-white text-sm font-bold text-slate-700 focus:border-blue-500 focus:outline-none"
            />
            <span className="text-xxs font-bold text-slate-500 uppercase tracking-tight">
              {t('widgets.timeTool.adjustStepUnit')}
            </span>
          </div>
          <p className="text-xxs text-slate-500 mt-2 leading-snug">
            {t('widgets.timeTool.adjustStepHint')}
          </p>
        </div>
      )}

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

        <div className="pt-2 border-t border-slate-100 mt-4">
          <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2">
            {t('widgets.timeTool.autoPickRandomStudent')}:
          </p>
          {!hasRandomizer ? (
            <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 flex items-start gap-2">
              <span className="text-lg mt-px">&#128161;</span>
              <p className="font-medium leading-snug">
                {t('widgets.timeTool.addRandomizerTip')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-indigo-900">
                  {t('widgets.timeTool.autoPickNext')}
                </p>
                <p className="text-xxxs text-indigo-600 uppercase">
                  {t('widgets.timeTool.triggerRandomizerWhenTimerEnds')}
                </p>
              </div>
              <Toggle
                checked={!!timerEndTriggerRandom}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTriggerRandom: checked },
                  })
                }
                size="md"
              />
            </div>
          )}
        </div>

        {/* Nexus Connection: Stations Auto-Rotate */}
        <div className="pt-2 border-t border-slate-100 mt-4">
          <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2">
            Auto-rotate stations:
          </p>
          {!hasStations ? (
            <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 flex items-start gap-2">
              <span className="text-lg mt-px">&#128161;</span>
              <p className="font-medium leading-snug">
                Add a Stations widget to rotate students automatically when this
                timer ends.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-900">
                  Rotate stations clockwise
                </p>
                <p className="text-xxxs text-emerald-600 uppercase">
                  Move every student one station when timer ends
                </p>
              </div>
              <Toggle
                checked={!!timerEndTriggerStationsRotate}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      timerEndTriggerStationsRotate: checked,
                    },
                  })
                }
                size="md"
              />
            </div>
          )}
        </div>

        {/* Nexus Connection: NextUp Auto-Advance */}
        <div className="pt-2 border-t border-slate-100 mt-4">
          <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2">
            {t('widgets.timeTool.autoAdvanceNextUpQueue')}:
          </p>
          {!hasNextUp ? (
            <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 flex items-start gap-2">
              <span className="text-lg mt-px">&#128161;</span>
              <p className="font-medium leading-snug">
                {t('widgets.timeTool.addNextUpTip')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-indigo-900">
                  {t('widgets.timeTool.autoAdvanceNext')}
                </p>
                <p className="text-xxxs text-indigo-600 uppercase">
                  {t('widgets.timeTool.advanceQueueOnEnd')}
                </p>
              </div>
              <Toggle
                checked={!!timerEndTriggerNextUp}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: { ...config, timerEndTriggerNextUp: checked },
                  })
                }
                size="md"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TimeToolAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget } = useDashboard();
  const config = widget.config as TimeToolConfig;
  const {
    fontFamily = 'global',
    clockStyle = 'modern',
    themeColor = STANDARD_COLORS.slate,
  } = config;

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
    </div>
  );
};

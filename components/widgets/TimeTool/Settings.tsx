import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeToolConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  WIDGET_PALETTE,
  STANDARD_COLORS,
  COLOR_HEX_TO_NAME,
} from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Toggle } from '@/components/common/Toggle';
import { TypographySettings } from '@/components/common/TypographySettings';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import {
  Bell,
  Sun,
  Timer as TimerIcon,
  Clock as ClockIcon,
  Palette,
  Sparkles,
  PlusSquare,
} from 'lucide-react';

import {
  TIME_TOOL_MODES,
  TIME_TOOL_VISUAL_TYPES,
  TIME_TOOL_SOUNDS,
  TIME_TOOL_CLOCK_STYLES,
  type TimeToolMode,
  type TimeToolVisualType,
  type TimeToolSound,
  type TimeToolClockStyle,
} from '@/config/timeTool';

const ADJUST_STEP_MIN = 5;
const ADJUST_STEP_MAX = 60;
const ADJUST_STEP_DEFAULT = 60;

const clampAdjustStep = (n: number) =>
  Math.max(ADJUST_STEP_MIN, Math.min(ADJUST_STEP_MAX, n));

const SOUNDS = TIME_TOOL_SOUNDS;

// Option lists for the "Timer End Action" radiogroups — order matches the
// rendered button order (None first) so roving-tabindex arrow-key nav lines
// up with the DOM.
const VOICE_LEVEL_OPTIONS: readonly (number | null)[] = [null, 0, 1, 2, 3, 4];
const TRAFFIC_COLOR_OPTIONS: readonly ('red' | 'yellow' | 'green' | null)[] = [
  null,
  'red',
  'yellow',
  'green',
];

// Maps each canonical clock style to its existing i18n label key
// (note `modern` uses the `default` key), so the appearance picker derives
// its options from TIME_TOOL_CLOCK_STYLES without changing translations.
const CLOCK_STYLE_LABEL_KEYS: Record<TimeToolClockStyle, string> = {
  modern: 'default',
  lcd: 'lcd',
  minimal: 'minimal',
};

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

  // Per-instance ids for the SettingsLabel -> radiogroup aria-labelledby
  // pairs below. useId() (matching the shared settings primitives) rather
  // than `widget.id` templates: the string was previously duplicated
  // verbatim at both the `id=` and its paired `aria-labelledby=`, so a typo
  // at either site silently broke the association with no compile-time or
  // lint signal, and it depended on `widget.id` being present and unique.
  const modeLabelId = useId();
  const displayStyleLabelId = useId();
  const alertSoundLabelId = useId();
  const timerEndActionLabelId = useId();
  const voiceLevelLabelId = useId();
  const trafficLightLabelId = useId();

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

  // Shared select handlers — reused by both onClick and the radiogroup
  // roving-tabindex keydown handler (handleRadioGroupKeyDown) below.
  const selectMode = (m: TimeToolMode) => {
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
  };

  const selectVisualType = (v: TimeToolVisualType) =>
    updateWidget(widget.id, { config: { ...config, visualType: v } });

  const selectSound = (s: TimeToolSound) =>
    updateWidget(widget.id, { config: { ...config, selectedSound: s } });

  const selectVoiceLevel = (level: number | null) =>
    updateWidget(widget.id, {
      config: { ...config, timerEndVoiceLevel: level },
    });

  const selectTrafficColor = (color: 'red' | 'yellow' | 'green' | null) =>
    updateWidget(widget.id, {
      config: { ...config, timerEndTrafficColor: color },
    });

  return (
    <div className="space-y-6 p-1">
      {/* Mode Selection */}
      <div>
        <SettingsLabel as="span" id={modeLabelId} icon={TimerIcon}>
          {t('widgets.timeTool.mode')}
        </SettingsLabel>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-labelledby={modeLabelId}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, TIME_TOOL_MODES, selectMode)
          }
        >
          {TIME_TOOL_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMode(m)}
              role="radio"
              aria-checked={config.mode === m}
              tabIndex={config.mode === m ? 0 : -1}
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
        <SettingsLabel as="span" id={displayStyleLabelId} icon={Sparkles}>
          {t('widgets.clock.displayStyle')}
        </SettingsLabel>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-labelledby={displayStyleLabelId}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, TIME_TOOL_VISUAL_TYPES, selectVisualType)
          }
        >
          {TIME_TOOL_VISUAL_TYPES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => selectVisualType(v)}
              role="radio"
              aria-checked={config.visualType === v}
              tabIndex={config.visualType === v ? 0 : -1}
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
        <SettingsLabel as="span" id={alertSoundLabelId} icon={Bell}>
          {t('widgets.timeTool.alertSound')}
        </SettingsLabel>
        <div
          className="grid grid-cols-4 gap-2"
          role="radiogroup"
          aria-labelledby={alertSoundLabelId}
          onKeyDown={(e) => handleRadioGroupKeyDown(e, SOUNDS, selectSound)}
        >
          {SOUNDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectSound(s)}
              role="radio"
              aria-checked={config.selectedSound === s}
              tabIndex={config.selectedSound === s ? 0 : -1}
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
          <SettingsLabel
            icon={PlusSquare}
            htmlFor={`timetool-adjuststep-input-${widget.id}`}
          >
            {t('widgets.timeTool.adjustStep')}
          </SettingsLabel>
          <div className="flex items-center gap-2">
            <input
              id={`timetool-adjuststep-input-${widget.id}`}
              type="number"
              min={ADJUST_STEP_MIN}
              max={ADJUST_STEP_MAX}
              step={5}
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
      <div role="group" aria-labelledby={timerEndActionLabelId}>
        <SettingsLabel as="span" id={timerEndActionLabelId} icon={Bell}>
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
            <p
              id={voiceLevelLabelId}
              className="text-xxs font-bold text-slate-500 uppercase tracking-tight"
            >
              {t('widgets.timeTool.switchToVoiceLevel')}:
            </p>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-labelledby={voiceLevelLabelId}
              onKeyDown={(e) =>
                handleRadioGroupKeyDown(
                  e,
                  VOICE_LEVEL_OPTIONS,
                  selectVoiceLevel
                )
              }
            >
              <button
                type="button"
                onClick={() => selectVoiceLevel(null)}
                role="radio"
                aria-checked={timerEndVoiceLevel == null}
                tabIndex={timerEndVoiceLevel == null ? 0 : -1}
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
                  type="button"
                  onClick={() => selectVoiceLevel(level)}
                  role="radio"
                  aria-checked={timerEndVoiceLevel === level}
                  tabIndex={timerEndVoiceLevel === level ? 0 : -1}
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
          <p
            {...(hasTrafficLight ? { id: trafficLightLabelId } : {})}
            className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2"
          >
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
            <div
              className="grid grid-cols-4 gap-2"
              role="radiogroup"
              aria-labelledby={trafficLightLabelId}
              onKeyDown={(e) =>
                handleRadioGroupKeyDown(
                  e,
                  TRAFFIC_COLOR_OPTIONS,
                  selectTrafficColor
                )
              }
            >
              <button
                type="button"
                onClick={() => selectTrafficColor(null)}
                role="radio"
                aria-checked={timerEndTrafficColor == null}
                tabIndex={timerEndTrafficColor == null ? 0 : -1}
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
                type="button"
                onClick={() => selectTrafficColor('red')}
                role="radio"
                aria-checked={timerEndTrafficColor === 'red'}
                tabIndex={timerEndTrafficColor === 'red' ? 0 : -1}
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
                type="button"
                onClick={() => selectTrafficColor('yellow')}
                role="radio"
                aria-checked={timerEndTrafficColor === 'yellow'}
                tabIndex={timerEndTrafficColor === 'yellow' ? 0 : -1}
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
                type="button"
                onClick={() => selectTrafficColor('green')}
                role="radio"
                aria-checked={timerEndTrafficColor === 'green'}
                tabIndex={timerEndTrafficColor === 'green' ? 0 : -1}
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
            {t('widgets.timeTool.autoRotateStations')}:
          </p>
          {!hasStations ? (
            <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 flex items-start gap-2">
              <span className="text-lg mt-px">&#128161;</span>
              <p className="font-medium leading-snug">
                {t('widgets.timeTool.addStationsTip')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-900">
                  {t('widgets.timeTool.rotateStationsClockwise')}
                </p>
                <p className="text-xxxs text-emerald-600 uppercase">
                  {t('widgets.timeTool.rotateStationsOnEnd')}
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
  const { clockStyle = 'modern', themeColor = STANDARD_COLORS.slate } = config;

  // Per-instance ids for this panel's SettingsLabel -> radiogroup
  // aria-labelledby pairs — see the equivalent block in TimeToolSettings.
  const numberStyleLabelId = useId();
  const colorPaletteLabelId = useId();

  const styles = TIME_TOOL_CLOCK_STYLES.map((id) => ({
    id,
    label: t(`widgets.clock.styles.${CLOCK_STYLE_LABEL_KEYS[id]}`),
  }));

  const colors = WIDGET_PALETTE;

  const selectClockStyle = (s: { id: TimeToolClockStyle; label: string }) =>
    updateWidget(widget.id, { config: { ...config, clockStyle: s.id } });

  const selectThemeColor = (c: string) =>
    updateWidget(widget.id, { config: { ...config, themeColor: c } });

  return (
    <div className="space-y-6 p-1">
      {/* Font Family — shared picker (TimeTool manages color via themeColor below) */}
      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, { config: { ...config, ...updates } })
        }
        showColorPicker={false}
      />

      {/* Clock Style */}
      <div>
        <SettingsLabel as="span" id={numberStyleLabelId} icon={Sparkles}>
          {t('widgets.timeTool.numberStyle')}
        </SettingsLabel>
        <div
          className="flex bg-slate-100 p-1 rounded-xl"
          role="radiogroup"
          aria-labelledby={numberStyleLabelId}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, styles, selectClockStyle)
          }
        >
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectClockStyle(s)}
              role="radio"
              aria-checked={clockStyle === s.id}
              tabIndex={clockStyle === s.id ? 0 : -1}
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
          <SettingsLabel as="span" id={colorPaletteLabelId} icon={Palette}>
            {t('widgets.clock.colorPalette')}
          </SettingsLabel>
          <div
            className="flex gap-1.5"
            role="radiogroup"
            aria-labelledby={colorPaletteLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, colors, selectThemeColor)
            }
          >
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => selectThemeColor(c)}
                aria-label={`theme color ${COLOR_HEX_TO_NAME[c] ?? c}`}
                role="radio"
                aria-checked={themeColor === c}
                tabIndex={themeColor === c ? 0 : -1}
                className={`w-6 h-6 rounded-full border-2 transition-all ${themeColor === c ? 'border-slate-800 scale-125 shadow-md' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, glow: !config.glow },
            })
          }
          aria-pressed={!!config.glow}
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

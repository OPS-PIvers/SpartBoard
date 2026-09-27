import React from 'react';
import type { TimeToolConfig, WidgetType } from '@/types';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { TIME_TOOL_MODES, type TimeToolMode } from '@/config/timeTool';
import { tourAttr } from '@/config/tourAnchors';

export type CustomFieldProps = { ctx: CustomRenderCtx };

type RadioOption<V> = { value: V; label: string };

type RadioGroupProps<V> = {
  id?: string;
  labelId?: string;
  name: string;
  options: ReadonlyArray<RadioOption<V>>;
  value: V;
  onSelect: (value: V) => void;
  selectedClass?: (value: V) => string;
  disabled?: boolean;
  anchor?: ReturnType<typeof tourAttr>;
};

// Segmented-style radiogroup for Custom fields; labelId (from FieldRenderer) names it, falling back to aria-label only when no labelId arrives.
function TimeToolRadioGroup<V extends string | number | null>({
  id,
  labelId,
  name,
  options,
  value,
  onSelect,
  selectedClass,
  disabled = false,
  anchor,
}: RadioGroupProps<V>) {
  const values = options.map((option) => option.value);
  const selectedIndex = values.indexOf(value);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-label={labelId ? undefined : name}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (disabled) return;
        handleRadioGroupKeyDown(e, values, onSelect);
      }}
      className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1"
      {...anchor}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const tabbable = selected || (selectedIndex < 0 && index === 0);
        const activeClass = selectedClass
          ? selectedClass(option.value)
          : 'bg-white text-slate-900 shadow-sm font-semibold';
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`flex-1 flex items-center justify-center text-xs px-2 py-1.5 rounded-md transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed ${
              selected ? activeClass : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const leafResolver = (ctx: CustomRenderCtx) => {
  const type: WidgetType = ctx.widget.type;
  return (leaf: string) => resolveLabel(ctx.t, type, leaf);
};

const MODE_LABEL_LEAF: Record<TimeToolMode, string> = {
  timer: 'modeTimer',
  stopwatch: 'modeStopwatch',
};

// Mode switch that also resets the runtime keys, exactly like the legacy panel's selectMode.
export const TimeToolModeField: React.FC<CustomFieldProps> = ({ ctx }) => {
  const leaf = leafResolver(ctx);
  const config = ctx.config as Partial<TimeToolConfig>;
  const mode = config.mode ?? 'timer';
  const select = (next: TimeToolMode) => {
    if (next === mode) return;
    if (next === 'timer') {
      ctx.updateConfig({
        mode: 'timer',
        duration: 600,
        elapsedTime: 600,
        isRunning: false,
        startTime: null,
      });
    } else {
      ctx.updateConfig({
        mode: 'stopwatch',
        elapsedTime: 0,
        isRunning: false,
        startTime: null,
      });
    }
  };
  return (
    <TimeToolRadioGroup
      id={ctx.id}
      labelId={ctx.labelId}
      name={leaf('mode')}
      options={TIME_TOOL_MODES.map((m) => ({
        value: m,
        label: leaf(MODE_LABEL_LEAF[m]),
      }))}
      value={mode}
      onSelect={select}
      anchor={tourAttr(
        'widget-settings.time-tool.mode',
        ctx.widget.id,
        ctx.widget.type
      )}
    />
  );
};

const VOICE_LEVELS: ReadonlyArray<number> = [0, 1, 2, 3, 4];

// "None" writes null; the front face treats null and absent alike. The partner card gates it on the Expectations widget.
export const TimeToolVoiceLevelField: React.FC<CustomFieldProps> = ({
  ctx,
}) => {
  const leaf = leafResolver(ctx);
  const config = ctx.config as Partial<TimeToolConfig>;
  const value = config.timerEndVoiceLevel ?? null;
  return (
    <TimeToolRadioGroup<number | null>
      id={ctx.id}
      labelId={ctx.labelId}
      name={leaf('timerEndVoiceLevel')}
      options={[
        { value: null, label: leaf('none') },
        ...VOICE_LEVELS.map((level) => ({
          value: level,
          label: `${leaf('level')} ${level}`,
        })),
      ]}
      value={value}
      onSelect={(level) => ctx.updateConfig({ timerEndVoiceLevel: level })}
      anchor={tourAttr(
        'widget-settings.time-tool.voice-level',
        ctx.widget.id,
        ctx.widget.type
      )}
    />
  );
};

type TrafficColor = NonNullable<TimeToolConfig['timerEndTrafficColor']>;

const TRAFFIC_OPTIONS: ReadonlyArray<{ value: TrafficColor; leaf: string }> = [
  { value: 'red', leaf: 'trafficStop' },
  { value: 'yellow', leaf: 'trafficSlow' },
  { value: 'green', leaf: 'trafficGo' },
];

const trafficSelectedClass = (color: TrafficColor | null) => {
  switch (color) {
    case 'red':
      return 'bg-red-500 text-white font-semibold shadow-sm';
    case 'yellow':
      return 'bg-yellow-300 text-yellow-900 font-semibold shadow-sm';
    case 'green':
      return 'bg-green-500 text-white font-semibold shadow-sm';
    default:
      return 'bg-white text-slate-900 shadow-sm font-semibold';
  }
};

// The partner card gates it on the Traffic Light widget.
export const TimeToolTrafficColorField: React.FC<CustomFieldProps> = ({
  ctx,
}) => {
  const leaf = leafResolver(ctx);
  const config = ctx.config as Partial<TimeToolConfig>;
  const value = config.timerEndTrafficColor ?? null;
  return (
    <TimeToolRadioGroup<TrafficColor | null>
      id={ctx.id}
      labelId={ctx.labelId}
      name={leaf('timerEndTrafficColor')}
      options={[
        { value: null, label: leaf('none') },
        ...TRAFFIC_OPTIONS.map((option) => ({
          value: option.value,
          label: leaf(option.leaf),
        })),
      ]}
      value={value}
      onSelect={(color) => ctx.updateConfig({ timerEndTrafficColor: color })}
      selectedClass={trafficSelectedClass}
      anchor={tourAttr(
        'widget-settings.time-tool.traffic-color',
        ctx.widget.id,
        ctx.widget.type
      )}
    />
  );
};

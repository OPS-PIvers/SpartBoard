import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import {
  TAB_WARNING_THRESHOLD_MIN,
  TAB_WARNING_THRESHOLD_MAX,
  DEFAULT_TAB_WARNING_THRESHOLD,
} from '@/utils/tabWarningThreshold';
import {
  DEFAULT_TAB_AWAY_LIMIT_SECONDS,
  TAB_AWAY_LIMIT_MAX_SECONDS,
  TAB_AWAY_LIMIT_MIN_SECONDS,
  TAB_AWAY_LIMIT_PRESETS,
  clampTabAwaySeconds,
} from '@/utils/tabAwayLimit';

/** During-taking tab-switch auto-submit threshold (M17 B4), for Quiz and Video Activity. */
export const TabWarningThresholdRow: React.FC<{
  value: number | 'off' | undefined;
  onChange: (next: number | 'off') => void;
}> = ({ value, onChange }) => {
  const effective = value ?? DEFAULT_TAB_WARNING_THRESHOLD;
  const enabled = effective !== 'off';
  const [inputValue, setInputValue] = useState<string>(
    String(effective === 'off' ? DEFAULT_TAB_WARNING_THRESHOLD : effective)
  );

  const clamp = (raw: string): number | null => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(
      TAB_WARNING_THRESHOLD_MAX,
      Math.max(TAB_WARNING_THRESHOLD_MIN, parsed)
    );
  };

  const handleToggle = (isEnabled: boolean) => {
    if (!isEnabled) {
      onChange('off');
      return;
    }
    const clamped = clamp(inputValue) ?? DEFAULT_TAB_WARNING_THRESHOLD;
    setInputValue(String(clamped));
    onChange(clamped);
  };

  const handleBlur = () => {
    const clamped = clamp(inputValue) ?? DEFAULT_TAB_WARNING_THRESHOLD;
    setInputValue(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="pl-0">
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-700">
          Auto-submit after repeated tab switches
        </span>
        <Toggle
          checked={enabled}
          onChange={handleToggle}
          size="sm"
          label="Auto-submit after repeated tab switches"
        />
      </label>
      {enabled && (
        <label className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-slate-700">
            Warnings before auto-submit
          </span>
          <input
            type="number"
            min={TAB_WARNING_THRESHOLD_MIN}
            max={TAB_WARNING_THRESHOLD_MAX}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleBlur}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
        </label>
      )}
    </div>
  );
};

const presetLabel = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;

const stepLabel = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;

/** "Auto-submit if away too long" with its time limit (docs/plans/TAB_AWAY_TIMER.md §2.4). */
export const TabAwayLimitRow: React.FC<{
  autoSubmit: boolean | undefined;
  seconds: number | undefined;
  onChange: (next: {
    tabAwayAutoSubmit: boolean;
    tabAwayLimitSeconds: number;
  }) => void;
}> = ({ autoSubmit, seconds, onChange }) => {
  const enabled = autoSubmit === true;
  const current = clampTabAwaySeconds(
    seconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
  );
  const set = (next: number) =>
    onChange({
      tabAwayAutoSubmit: true,
      tabAwayLimitSeconds: clampTabAwaySeconds(next),
    });
  const step = current < 60 ? 5 : 15;

  return (
    <div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-700">
          Auto-submit if away too long
        </span>
        <Toggle
          checked={enabled}
          onChange={(v) =>
            onChange({ tabAwayAutoSubmit: v, tabAwayLimitSeconds: current })
          }
          size="sm"
          label="Auto-submit if away too long"
        />
      </label>
      {enabled && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Time allowed away"
            className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
          >
            {TAB_AWAY_LIMIT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={current === preset}
                onClick={() => set(preset)}
                className={
                  'px-2.5 py-1 text-xs font-bold transition ' +
                  (current === preset
                    ? 'bg-brand-blue-primary text-white'
                    : 'text-slate-600 hover:bg-slate-50')
                }
              >
                {presetLabel(preset)}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="Less time"
              disabled={current <= TAB_AWAY_LIMIT_MIN_SECONDS}
              onClick={() => set(current - (current <= 60 ? 5 : 15))}
              className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Minus size={12} />
            </button>
            <span
              className="min-w-[3.5rem] text-center text-xs font-bold text-slate-800 tabular-nums"
              aria-live="polite"
            >
              {stepLabel(current)}
            </span>
            <button
              type="button"
              aria-label="More time"
              disabled={current >= TAB_AWAY_LIMIT_MAX_SECONDS}
              onClick={() => set(current + step)}
              className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

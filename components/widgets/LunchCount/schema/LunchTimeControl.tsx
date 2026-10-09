import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { tourAttr } from '@/config/tourAnchors';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';

const pad = (n: string) => n.padStart(2, '0');

// schema-gap: timeHourMinute — one control writes two zero-padded string keys (minute pads on blur only).
const LunchTimeControlImpl: React.FC<CustomRenderCtx> = ({
  config,
  widget,
  updateConfig,
  t,
  id,
  labelId,
  describedBy,
}) => {
  const label = (leaf: string) => resolveLabel(t, widget.type, leaf);
  const hour =
    typeof config.lunchTimeHour === 'string' ? config.lunchTimeHour : '';
  const minute =
    typeof config.lunchTimeMinute === 'string' ? config.lunchTimeMinute : '';

  return (
    <div className="flex flex-col gap-1">
      <div
        id={id}
        className="flex items-center gap-2"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        <input
          type="number"
          min={1}
          max={12}
          {...tourAttr(
            'widget-settings.lunch-count.time-hour',
            widget.id,
            widget.type
          )}
          value={hour}
          aria-label={label('lunchTimeHourAria')}
          onChange={(e) => {
            const raw = e.target.value;
            const n = parseInt(raw, 10);
            const value =
              !isNaN(n) && raw !== ''
                ? String(Math.min(12, Math.max(1, n)))
                : raw;
            updateConfig({ lunchTimeHour: value });
          }}
          onBlur={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && e.target.value !== '') {
              updateConfig({
                lunchTimeHour: String(Math.min(12, Math.max(1, n))),
              });
            }
          }}
          placeholder="HR"
          className="w-16 p-2.5 text-xs text-center border border-slate-200 rounded-xl outline-none bg-white font-mono"
        />
        <span className="font-black text-slate-400 text-sm">:</span>
        <input
          type="number"
          min={0}
          max={59}
          {...tourAttr(
            'widget-settings.lunch-count.time-minute',
            widget.id,
            widget.type
          )}
          value={minute}
          aria-label={label('lunchTimeMinuteAria')}
          onChange={(e) => {
            const raw = e.target.value;
            const n = parseInt(raw, 10);
            const value =
              !isNaN(n) && raw !== ''
                ? String(Math.min(59, Math.max(0, n)))
                : raw;
            updateConfig({ lunchTimeMinute: value });
          }}
          onBlur={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && e.target.value !== '') {
              updateConfig({
                lunchTimeMinute: pad(String(Math.min(59, Math.max(0, n)))),
              });
            }
          }}
          placeholder="MM"
          className="w-16 p-2.5 text-xs text-center border border-slate-200 rounded-xl outline-none bg-white font-mono"
        />
      </div>
      {hour && (
        <p className="text-xxs text-slate-400">
          {label('lunchTimePreview')}: {hour}:{pad(minute || '0')}
        </p>
      )}
    </div>
  );
};

export const LunchTimeControl = React.memo(LunchTimeControlImpl);
LunchTimeControl.displayName = 'LunchTimeControl';

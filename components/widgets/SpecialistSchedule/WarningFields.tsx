import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ScheduleItemWarning } from '@/types';
import {
  DEFAULT_WARNING,
  WARNING_MINUTES,
  WARNING_SOUNDS,
} from '@/components/widgets/Schedule/blockWarning';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import { tourAttr } from '@/config/tourAnchors';

const selectClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-50';

// Warn-before-end choices for a block; shown only while Connections are on.
export const SpecialistWarningFields: React.FC<{
  ctx: CustomRenderCtx;
  idPrefix: string;
  warning: ScheduleItemWarning | undefined;
  hasEnd: boolean;
  onChange: (warning: ScheduleItemWarning | undefined) => void;
}> = ({ ctx, idPrefix, warning, hasEnd, onChange }) => {
  if (!ctx.canAccessFeature('widget-connections')) return null;
  const t = (leaf: string, options?: Record<string, unknown>) =>
    ctx.t(`widgetSettings.specialist-schedule.${leaf}`, options);
  const active = hasEnd ? warning : undefined;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label
          htmlFor={`${idPrefix}-warn-minutes`}
          className="mb-1 block text-xxs font-semibold text-slate-600"
        >
          {t('warnBefore')}
        </label>
        <select
          id={`${idPrefix}-warn-minutes`}
          value={active?.minutes ?? 0}
          disabled={!hasEnd}
          title={hasEnd ? undefined : t('warnNeedsEnd')}
          onChange={(event) => {
            const minutes = Number(event.target.value);
            onChange(
              minutes === 0
                ? undefined
                : {
                    sound: DEFAULT_WARNING.sound,
                    ...warning,
                    minutes,
                  }
            );
          }}
          className={selectClass}
          {...tourAttr(
            'widget-settings.specialist-schedule.warn-minutes',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <option value={0}>{t('warnOff')}</option>
          {WARNING_MINUTES.map((m) => (
            <option key={m} value={m}>
              {t('warnMinutes', { count: m })}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-warn-sound`}
          className="mb-1 block text-xxs font-semibold text-slate-600"
        >
          {t('warnSound')}
        </label>
        <select
          id={`${idPrefix}-warn-sound`}
          value={active?.sound ?? DEFAULT_WARNING.sound}
          disabled={!active}
          onChange={(event) => {
            const sound = event.target.value;
            if (!active) return;
            onChange({ ...active, sound });
            void resumeAudio().then(() => playTimerAlert(sound));
          }}
          className={selectClass}
          {...tourAttr(
            'widget-settings.specialist-schedule.warn-sound',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          {WARNING_SOUNDS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

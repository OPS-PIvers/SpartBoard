import React, { useMemo } from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { RecessGearConfig, WeatherConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

export const RecessWeatherSourceField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard } = useDashboard();
  const config = ctx.config as unknown as RecessGearConfig;
  const weatherWidgets = useMemo(
    () =>
      activeDashboard?.widgets.filter((widget) => widget.type === 'weather') ??
      [],
    [activeDashboard?.widgets]
  );

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      <select
        value={config.linkedWeatherWidgetId ?? ''}
        disabled={weatherWidgets.length === 0}
        onChange={(event) =>
          ctx.updateConfig({
            linkedWeatherWidgetId: event.target.value || null,
          })
        }
        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value="">
          {ctx.t('widgetSettings.recessGear.autoSelect')}
        </option>
        {weatherWidgets.map((weatherWidget) => (
          <option key={weatherWidget.id} value={weatherWidget.id}>
            {ctx.t('widgetSettings.recessGear.weatherAt', {
              location:
                (weatherWidget.config as WeatherConfig).locationName ??
                ctx.t('widgetSettings.recessGear.classroom'),
            })}
          </option>
        ))}
      </select>
    </div>
  );
};

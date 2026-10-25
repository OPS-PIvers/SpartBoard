import React from 'react';
import { Ear, RotateCcw } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ScoreboardConfig, SoundConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { tourAttr } from '@/config/tourAnchors';
import { isCalibrating } from './noiseTarget';

const translate = (ctx: CustomRenderCtx, leaf: string) =>
  ctx.t(`widgetSettings.sound.${leaf}`);

export const SoundCalibrateField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as Partial<SoundConfig>;
  const listening = isCalibrating(config);
  const calibrated = typeof config.noiseFloor === 'number';

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        disabled={listening}
        onClick={() => ctx.updateConfig({ calibrateRequest: Date.now() })}
        className="flex items-center gap-2 min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60"
        {...tourAttr(
          'widget-settings.sound.calibrate',
          ctx.widget.id,
          ctx.widget.type
        )}
      >
        <Ear className="h-4 w-4" aria-hidden="true" />
        {translate(ctx, listening ? 'calibrateListening' : 'calibrate')}
      </button>
      {(calibrated || listening) && (
        <button
          type="button"
          onClick={() =>
            ctx.updateConfig({
              noiseFloor: null,
              calibratedAt: config.calibrateRequest ?? 0,
            })
          }
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          {...tourAttr(
            'widget-settings.sound.reset-calibration',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {translate(ctx, 'resetCalibration')}
        </button>
      )}
    </div>
  );
};

export const SoundGoalTeamField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { activeDashboard } = useDashboard();
  const teams = (activeDashboard?.widgets ?? [])
    .filter((w) => w.type === 'scoreboard')
    .flatMap((w) => {
      const config = w.config as ScoreboardConfig;
      return config.liveQuizWidgetId || !Array.isArray(config.teams)
        ? []
        : config.teams;
    });
  const value = (ctx.config as Partial<SoundConfig>).quietGoalTeamId ?? '';

  return (
    <select
      id={ctx.id}
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      value={teams.some((t) => t.id === value) ? value : ''}
      onChange={(e) =>
        ctx.updateConfig({ quietGoalTeamId: e.target.value || null })
      }
      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      {...tourAttr(
        'widget-settings.sound.goal-team',
        ctx.widget.id,
        ctx.widget.type
      )}
    >
      <option value="">{translate(ctx, 'goalTeamNone')}</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
};

import React from 'react';
import { Ear, RotateCcw } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SoundConfig } from '@/types';
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
        className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60"
        {...tourAttr(
          'widget-settings.sound.calibrate',
          ctx.widget.id,
          ctx.widget.type
        )}
      >
        <Ear className="h-4 w-4" aria-hidden="true" />
        {translate(ctx, listening ? 'calibrateListening' : 'calibrate')}
      </button>
      {calibrated && !listening && (
        <button
          type="button"
          onClick={() => ctx.updateConfig({ noiseFloor: null })}
          className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
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

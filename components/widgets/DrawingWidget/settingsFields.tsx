import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { DrawingConfig } from '@/types';
import { DRAWING_DEFAULTS } from './constants';

export const DrawingColorPaletteField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as DrawingConfig;
  const colors = config.customColors ?? DRAWING_DEFAULTS.CUSTOM_COLORS;

  const updateColor = (index: number, color: string) => {
    const next = [...colors];
    next[index] = color;
    ctx.updateConfig({ customColors: next });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-wrap gap-2"
    >
      {colors.map((color, index) => (
        <label
          key={index}
          className="relative h-9 w-9 overflow-hidden rounded-lg border-2 border-white shadow-sm ring-1 ring-slate-200 transition-transform hover:scale-105"
          style={{ backgroundColor: color }}
        >
          <span className="sr-only">{`${ctx.t('widgetSettings.drawing.presetColor')} ${index + 1}`}</span>
          <input
            type="color"
            value={color}
            onChange={(event) => updateColor(index, event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      ))}
    </div>
  );
};

import React from 'react';
import { Palette } from 'lucide-react';
import { WidgetConfig } from '@/types';
import { SettingsLabel } from './SettingsLabel';
import { SURFACE_COLOR_PRESETS } from '@/config/widgetAppearance';

interface SurfaceColorSettingsProps<T extends WidgetConfig> {
  config: T;
  updateConfig: (updates: Partial<T>) => void;
}

export const SurfaceColorSettings = <
  T extends WidgetConfig & { cardColor?: string; cardOpacity?: number },
>({
  config,
  updateConfig,
}: SurfaceColorSettingsProps<T>) => {
  const cardColor = config.cardColor ?? '#ffffff';
  const cardOpacity = config.cardOpacity ?? 1;

  return (
    <div>
      <SettingsLabel icon={Palette}>Surface</SettingsLabel>
      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2">
          {SURFACE_COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => updateConfig({ cardColor: color } as Partial<T>)}
              className={`h-6 w-6 rounded-md border transition-all hover:scale-110 ${
                cardColor === color
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-slate-200'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select surface color ${color}`}
            />
          ))}
        </div>

        <input
          type="color"
          value={cardColor}
          onChange={(e) =>
            updateConfig({ cardColor: e.target.value } as Partial<T>)
          }
          className="h-8 w-full rounded-md border border-slate-200 bg-white"
          aria-label="Custom surface color"
        />

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Opacity</span>
            <span>{Math.round(cardOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cardOpacity}
            onChange={(e) =>
              updateConfig({
                cardOpacity: parseFloat(e.target.value),
              } as Partial<T>)
            }
            className="w-full accent-indigo-600"
          />
        </div>
      </div>
    </div>
  );
};

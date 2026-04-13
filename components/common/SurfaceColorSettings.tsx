import React from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { WidgetConfig } from '@/types';
import { SettingsLabel } from './SettingsLabel';
import { SURFACE_COLOR_PRESETS } from '@/config/widgetAppearance';

interface SurfaceColorSettingsProps<T extends WidgetConfig> {
  config: T;
  updateConfig: (updates: Partial<T>) => void;
  label?: string;
  icon?: LucideIcon | React.ElementType;
}

export const SurfaceColorSettings = <
  T extends WidgetConfig & { cardColor?: string },
>({
  config,
  updateConfig,
  label = 'Surface',
  icon = Palette,
}: SurfaceColorSettingsProps<T>) => {
  const cardColor = config.cardColor ?? '#ffffff';

  return (
    <div>
      <SettingsLabel icon={icon}>{label}</SettingsLabel>
      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2">
          {SURFACE_COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => updateConfig({ cardColor: color } as Partial<T>)}
              className={`h-6 w-6 rounded-md border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                cardColor === color
                  ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
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
          aria-label={`Custom ${label.toLowerCase()} color`}
        />
      </div>
    </div>
  );
};

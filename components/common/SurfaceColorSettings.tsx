import React, { useId } from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { WidgetConfig } from '@/types';
import { SettingsLabel } from './SettingsLabel';
import { ColorPresetPicker } from './ColorPresetPicker';
import { SURFACE_COLOR_PRESETS } from '@/config/widgetAppearance';

interface SurfaceColorSettingsProps<T extends WidgetConfig> {
  config: T;
  updateConfig: (updates: Partial<T>) => void;
  label?: string;
  icon?: LucideIcon | React.ElementType;
}

export const SurfaceColorSettings = <
  T extends WidgetConfig & { cardColor?: string; cardOpacity?: number },
>({
  config,
  updateConfig,
  label = 'Surface',
  icon = Palette,
}: SurfaceColorSettingsProps<T>) => {
  const cardColor = config.cardColor ?? '#ffffff';
  const cardOpacity = config.cardOpacity ?? 1;
  const surfaceLabelId = useId();
  // Callers are inconsistent about whether `label` already names a color:
  // DiceWidget passes "Die Color"/"Pip Color", while others pass "Surface"
  // or "Card surface". The aria-labels below all append the word "color", so
  // without stripping a trailing one the Dice groups announce "Die Color
  // color" and "Select die color color #ffffff". Strip it here rather than
  // renaming the props, so both calling conventions stay valid. The `||
  // label` fallback keeps a label of exactly "Color" from stripping to ''.
  const colorSubject = label.replace(/\s*colou?rs?\s*$/i, '') || label;

  return (
    <div>
      <SettingsLabel icon={icon} as="span" id={surfaceLabelId}>
        {label}
      </SettingsLabel>
      <div
        className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
        role="group"
        aria-labelledby={surfaceLabelId}
      >
        <ColorPresetPicker
          hideLabel
          label={`${colorSubject} color`}
          subject={`${colorSubject.toLowerCase()} color`}
          presets={SURFACE_COLOR_PRESETS}
          value={cardColor}
          fallback="#ffffff"
          onChange={(color) => updateConfig({ cardColor: color } as Partial<T>)}
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
            aria-label={`${label} opacity`}
          />
        </div>
      </div>
    </div>
  );
};

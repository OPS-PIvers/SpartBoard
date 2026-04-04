import React from 'react';
import { Type, Palette } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { FONTS } from '@/config/fonts';
import { TEXT_COLOR_PRESETS } from '@/config/widgetAppearance';
import { WidgetConfig } from '@/types';

interface TypographySettingsProps<T extends WidgetConfig> {
  config: T;
  updateConfig: (updates: Partial<T>) => void;
}

export const TypographySettings = <
  T extends WidgetConfig & { fontFamily?: string; fontColor?: string },
>({
  config,
  updateConfig,
}: TypographySettingsProps<T>) => {
  const { fontFamily = 'global', fontColor = '#334155' } = config;

  return (
    <>
      <div>
        <SettingsLabel icon={Type}>Typography</SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => updateConfig({ fontFamily: f.id } as Partial<T>)}
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                fontFamily === f.id || (!fontFamily && f.id === 'global')
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.className} text-slate-900`}>
                {f.icon}
              </span>
              <span className="text-xxxs uppercase text-slate-600 font-bold">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel icon={Palette}>Text Color</SettingsLabel>
        <div className="flex flex-wrap gap-2 px-1 mb-2">
          {TEXT_COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => updateConfig({ fontColor: color } as Partial<T>)}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                fontColor === color
                  ? 'border-slate-800 scale-110 shadow-sm'
                  : color === '#ffffff'
                    ? 'border-slate-300'
                    : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`Select text color ${color}`}
            />
          ))}
        </div>
        <input
          type="color"
          value={fontColor}
          onChange={(e) =>
            updateConfig({ fontColor: e.target.value } as Partial<T>)
          }
          className="h-8 w-full rounded-md border border-slate-200 bg-white"
          aria-label="Custom text color"
        />
      </div>
    </>
  );
};

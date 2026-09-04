import React, { useId } from 'react';
import { Type } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { handleRadioGroupKeyDown } from './radioGroupKeyNav';
import { FONTS } from '@/config/fonts';
import { TEXT_COLOR_SWATCHES } from '@/config/widgetAppearance';
import { ColorPresetPicker } from './ColorPresetPicker';
import { WidgetConfig } from '@/types';

interface TypographySettingsProps<T extends WidgetConfig> {
  config: T;
  updateConfig: (updates: Partial<T>) => void;
  /**
   * Whether to render the text-color picker. Defaults to `true`.
   * Set to `false` for widgets that manage their own color system
   * (e.g. ClockWidget / TimeTool use `themeColor`, not `fontColor`) so the
   * shared font-family picker can be reused without surfacing a dead control.
   */
  showColorPicker?: boolean;
}

export const TypographySettings = <
  T extends WidgetConfig & { fontFamily?: string; fontColor?: string },
>({
  config,
  updateConfig,
  showColorPicker = true,
}: TypographySettingsProps<T>) => {
  const { fontFamily = 'global', fontColor = '#334155' } = config;
  const typographyLabelId = useId();

  return (
    <>
      <div>
        <SettingsLabel icon={Type} as="span" id={typographyLabelId}>
          Typography
        </SettingsLabel>
        <div
          className="grid grid-cols-4 gap-2"
          role="radiogroup"
          aria-labelledby={typographyLabelId}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, FONTS, (f) =>
              updateConfig({
                fontFamily: f.id === 'global' ? undefined : f.id,
              } as Partial<T>)
            )
          }
        >
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fontFamily === f.id}
              tabIndex={fontFamily === f.id ? 0 : -1}
              onClick={() =>
                updateConfig({
                  // 'global' is a sentinel meaning "inherit dashboard font".
                  // Write undefined (clear the override) instead of persisting
                  // the literal string 'global', which is not a valid
                  // GlobalFontFamily value and would pollute saved configs.
                  fontFamily: f.id === 'global' ? undefined : f.id,
                } as Partial<T>)
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-[border-color,background-color] ${
                fontFamily === f.id
                  ? 'border-brand-blue-primary bg-brand-blue-lighter'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              {/* Decorative sample glyph (✏️, ☺, 𝒞, ★ …) — purely a visual
                  preview of the typeface. Without aria-hidden it is
                  concatenated into the button's accessible name, so the
                  option announces as "pencil Handwriting, radio" instead of
                  "Handwriting, radio". The {f.label} span below carries the
                  real name. */}
              <span
                aria-hidden="true"
                className={`text-sm ${f.className} text-slate-900`}
              >
                {f.icon}
              </span>
              <span className="text-xxxs uppercase text-slate-600 font-bold">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showColorPicker && (
        <ColorPresetPicker
          label="Text Color"
          subject="text color"
          presets={TEXT_COLOR_SWATCHES}
          value={fontColor}
          fallback="#334155"
          onChange={(color) => updateConfig({ fontColor: color } as Partial<T>)}
        />
      )}
    </>
  );
};

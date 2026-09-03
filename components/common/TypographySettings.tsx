import React, { useId } from 'react';
import { Type, Palette } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { FONTS } from '@/config/fonts';
import { TEXT_COLOR_PRESETS } from '@/config/widgetAppearance';
import { WidgetConfig } from '@/types';

// Roving-tabindex arrow-key nav for a `role="radiogroup"` of `role="radio"` buttons — mirrors SegmentedControl.tsx's onKeyDown, generalized over the option list.
function handleRadioGroupKeyDown<O>(
  e: React.KeyboardEvent<HTMLDivElement>,
  options: readonly O[],
  onSelect: (option: O) => void
): void {
  if (
    e.key !== 'ArrowRight' &&
    e.key !== 'ArrowLeft' &&
    e.key !== 'Home' &&
    e.key !== 'End'
  )
    return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const nodes = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
  );
  if (nodes.length === 0) return;
  e.preventDefault();
  const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
  const safeIdx = idx < 0 ? 0 : idx;
  let nextIdx: number;
  if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = nodes.length - 1;
  else if (e.key === 'ArrowRight') nextIdx = (safeIdx + 1) % nodes.length;
  else nextIdx = (safeIdx - 1 + nodes.length) % nodes.length;
  const nextOption = options[nextIdx];
  if (!nextOption) return;
  nodes[nextIdx].focus();
  onSelect(nextOption);
}

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
  const textColorLabelId = useId();
  // The default/custom fontColor isn't always one of the presets (unlike 'global' for fontFamily) — fall back to tabbing preset 0 so the group stays keyboard-reachable.
  const hasSelectedColorPreset = TEXT_COLOR_PRESETS.some(
    (c) => c === fontColor
  );

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
        <div>
          <SettingsLabel icon={Palette} as="span" id={textColorLabelId}>
            Text Color
          </SettingsLabel>
          <div
            className="flex flex-wrap gap-2 px-1 mb-2"
            role="radiogroup"
            aria-labelledby={textColorLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, TEXT_COLOR_PRESETS, (color) =>
                updateConfig({ fontColor: color } as Partial<T>)
              )
            }
          >
            {TEXT_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={fontColor === color}
                tabIndex={
                  fontColor === color ||
                  (!hasSelectedColorPreset && color === TEXT_COLOR_PRESETS[0])
                    ? 0
                    : -1
                }
                onClick={() => updateConfig({ fontColor: color } as Partial<T>)}
                className={`w-6 h-6 rounded-full border-2 transition hover:scale-110 ${
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
      )}
    </>
  );
};

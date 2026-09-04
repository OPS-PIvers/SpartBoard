import React, { useId } from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { WidgetConfig } from '@/types';
import { SettingsLabel } from './SettingsLabel';
import { SURFACE_COLOR_PRESETS } from '@/config/widgetAppearance';

// Roving-tabindex arrow-key nav for a `role="radiogroup"` of `role="radio"` buttons — mirrors TypographySettings.tsx / SegmentedControl.tsx's onKeyDown.
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
  // A custom color (from the picker below) isn't always one of the presets — fall back to tabbing preset 0 so the group stays keyboard-reachable.
  const hasSelectedColorPreset = SURFACE_COLOR_PRESETS.some(
    (c) => c === cardColor
  );
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
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={`${colorSubject} color`}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, SURFACE_COLOR_PRESETS, (color) =>
              updateConfig({ cardColor: color } as Partial<T>)
            )
          }
        >
          {SURFACE_COLOR_PRESETS.map((color, idx) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={cardColor === color}
              tabIndex={
                cardColor === color || (!hasSelectedColorPreset && idx === 0)
                  ? 0
                  : -1
              }
              onClick={() => updateConfig({ cardColor: color } as Partial<T>)}
              className={`h-6 w-6 rounded-md border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                cardColor === color
                  ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                  : 'border-slate-200'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select ${colorSubject.toLowerCase()} color ${color}`}
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
          aria-label={`Custom ${colorSubject.toLowerCase()} color`}
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

import React from 'react';
import { Check } from 'lucide-react';
import type { ActivityWallAppearance } from '@/types';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS } from '@/config/backgrounds';
import { useBackgrounds } from '@/hooks/useBackgrounds';

interface AppearancePickerProps {
  value: ActivityWallAppearance;
  onChange: (appearance: ActivityWallAppearance) => void;
}

const swatchClass = (selected: boolean) =>
  `relative h-12 w-full overflow-hidden rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
    selected
      ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/40'
      : 'border-slate-200 hover:border-slate-300'
  }`;

const SelectedMark: React.FC = () => (
  <span className="absolute inset-0 flex items-center justify-center bg-slate-900/30">
    <Check className="h-5 w-5 text-white" />
  </span>
);

/**
 * Wall background picker. Presets come from `admin_backgrounds` via
 * `useBackgrounds()`, which is teacher-context only — student and gallery
 * pages read the stored `{kind, value}` instead.
 */
export const AppearancePicker: React.FC<AppearancePickerProps> = ({
  value,
  onChange,
}) => {
  const { presets } = useBackgrounds();

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
          Gradients
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {BACKGROUND_GRADIENTS.map((gradient) => {
            const selected =
              value.kind === 'gradient' && value.value === gradient.id;
            return (
              <button
                key={gradient.id}
                type="button"
                aria-label={`Gradient ${gradient.label}`}
                aria-pressed={selected}
                onClick={() =>
                  onChange({ kind: 'gradient', value: gradient.id })
                }
                className={`${swatchClass(selected)} ${gradient.id}`}
              >
                {selected && <SelectedMark />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
          Colors
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {BACKGROUND_COLORS.map((color) => {
            const selected = value.kind === 'color' && value.value === color.id;
            return (
              <button
                key={color.id}
                type="button"
                aria-label={`Color ${color.id.replace('bg-', '')}`}
                aria-pressed={selected}
                onClick={() => onChange({ kind: 'color', value: color.id })}
                className={`${swatchClass(selected)} ${color.id}`}
              >
                {selected && <SelectedMark />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
          Images
        </p>
        {presets.length === 0 ? (
          <p className="text-xs text-slate-600">
            No background images are available for your account.
          </p>
        ) : (
          <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
            {presets.map((preset) => {
              const selected =
                value.kind === 'image' && value.value === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={`Image ${preset.label}`}
                  aria-pressed={selected}
                  onClick={() => onChange({ kind: 'image', value: preset.id })}
                  className={swatchClass(selected)}
                >
                  <img
                    src={preset.thumbnailUrl ?? preset.id}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {selected && <SelectedMark />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

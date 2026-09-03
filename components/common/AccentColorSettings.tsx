import React, { useId } from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { TEXT_COLOR_PRESETS } from '@/config/widgetAppearance';

interface AccentColorSettingsProps {
  label: string;
  value?: string;
  fallback: string;
  fallbackLabel?: string;
  onChange: (color: string | undefined) => void;
  icon?: LucideIcon | React.ElementType;
}

// Single accent-color picker (presets + custom); clearing falls back to `fallback`.
export const AccentColorSettings: React.FC<AccentColorSettingsProps> = ({
  label,
  value,
  fallback,
  fallbackLabel = 'Match',
  onChange,
  icon = Palette,
}) => {
  const labelId = useId();
  const current = value ?? fallback;
  const subject = label.toLowerCase();

  return (
    <div>
      <div className="flex items-center justify-between">
        <SettingsLabel icon={icon} as="span" id={labelId}>
          {label}
        </SettingsLabel>
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="mb-2 text-xxs font-black uppercase text-brand-blue-primary hover:text-brand-blue-dark"
          >
            {fallbackLabel}
          </button>
        )}
      </div>
      <div
        className="mb-2 flex flex-wrap gap-2 px-1"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {TEXT_COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={current === color}
            onClick={() => onChange(color)}
            className={`h-6 w-6 rounded-full border-2 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
              current === color
                ? 'border-slate-800 scale-110 shadow-sm'
                : color === '#ffffff'
                  ? 'border-slate-300'
                  : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={color}
            aria-label={`Select ${subject} ${color}`}
          />
        ))}
      </div>
      <input
        type="color"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white"
        aria-label={`Custom ${subject}`}
      />
    </div>
  );
};

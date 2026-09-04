import React from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { TEXT_COLOR_SWATCHES } from '@/config/widgetAppearance';
import { ColorPresetPicker } from './ColorPresetPicker';

interface AccentColorSettingsProps {
  label: string;
  value?: string;
  fallback: string;
  fallbackLabel?: string;
  onChange: (color: string | undefined) => void;
  icon?: LucideIcon | React.ElementType;
}

// Single accent-color picker (presets + custom); the leading dashed swatch clears back to `fallback`.
export const AccentColorSettings: React.FC<AccentColorSettingsProps> = ({
  label,
  value,
  fallback,
  fallbackLabel = 'Match',
  onChange,
  icon = Palette,
}) => (
  <ColorPresetPicker
    label={label}
    presets={TEXT_COLOR_SWATCHES}
    value={value}
    fallback={fallback}
    onChange={onChange}
    onClear={() => onChange(undefined)}
    clearLabel={fallbackLabel}
    icon={icon}
  />
);

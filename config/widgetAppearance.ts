import { FONT_COLORS } from '@/config/fonts';
import type { TextSizePreset } from '@/types';

export const TEXT_SIZE_PRESETS = [
  { id: 'small', label: 'Small', multiplier: 0.85 },
  { id: 'medium', label: 'Medium', multiplier: 1 },
  { id: 'large', label: 'Large', multiplier: 1.2 },
  { id: 'x-large', label: 'X-Large', multiplier: 1.4 },
] as const;

export const SURFACE_COLOR_PRESETS = [
  '#ffffff',
  '#f8fafc',
  '#eef2ff',
  '#e0f2fe',
  '#dcfce7',
  '#fef3c7',
  '#fee2e2',
  '#e9d5ff',
] as const;

export const TEXT_COLOR_PRESETS = FONT_COLORS;

export const resolveTextPresetMultiplier = (
  textSizePreset?: TextSizePreset,
  fallback = 1
): number => {
  if (!textSizePreset) return fallback;
  const preset = TEXT_SIZE_PRESETS.find((item) => item.id === textSizePreset);
  return preset?.multiplier ?? fallback;
};

export const presetFromScale = (scale: number): TextSizePreset => {
  if (scale <= 0.92) return 'small';
  if (scale >= 1.32) return 'x-large';
  if (scale >= 1.1) return 'large';
  return 'medium';
};

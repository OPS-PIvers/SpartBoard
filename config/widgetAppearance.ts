import { FONT_COLORS } from '@/config/fonts';
import type { TextSizePreset } from '@/types';

export const TEXT_SIZE_PRESETS = [
  { id: 'small', label: 'Small', multiplier: 0.85 },
  { id: 'medium', label: 'Medium', multiplier: 1 },
  { id: 'large', label: 'Large', multiplier: 1.2 },
  { id: 'x-large', label: 'X-Large', multiplier: 1.4 },
] as const;

export interface ColorPreset {
  name: string;
  hex: string;
}

// Curated 5-swatch sets for ColorPresetPicker; any other color comes from its custom picker.
export const SURFACE_COLOR_PRESETS: readonly ColorPreset[] = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Slate', hex: '#f8fafc' },
  { name: 'Indigo', hex: '#eef2ff' },
  { name: 'Amber', hex: '#fef3c7' },
  { name: 'Charcoal', hex: '#1e293b' },
];

export const TEXT_COLOR_SWATCHES: readonly ColorPreset[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Slate', hex: '#334155' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Brand blue', hex: '#2d3f89' },
  { name: 'Brand red', hex: '#ad2122' },
];

export const FRAME_BACKGROUND_PRESETS: readonly ColorPreset[] = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Slate', hex: '#f8fafc' },
  { name: 'Stone', hex: '#f5f5f4' },
  { name: 'Graphite', hex: '#334155' },
  { name: 'Charcoal', hex: '#0f172a' },
];

// Full 28-color palette, still used by widgets with their own inline swatch grids.
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

// Legacy Tailwind-class frame tints still stored on older boards; new selections store a hex.
export const WINDOW_BACKGROUND_OPTIONS = [
  { label: 'Default', value: '', hex: undefined },
  { label: 'White', value: 'bg-white', hex: '#ffffff' },
  { label: 'Slate', value: 'bg-slate-50', hex: '#f8fafc' },
  { label: 'Blue', value: 'bg-blue-50', hex: '#eff6ff' },
  { label: 'Indigo', value: 'bg-indigo-50', hex: '#eef2ff' },
  { label: 'Purple', value: 'bg-purple-50', hex: '#faf5ff' },
  { label: 'Rose', value: 'bg-rose-50', hex: '#fff1f2' },
  { label: 'Amber', value: 'bg-amber-50', hex: '#fffbeb' },
  { label: 'Emerald', value: 'bg-emerald-50', hex: '#ecfdf5' },
] as const;

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// An explicit hex paints solid (GlassCard forces alpha 1); legacy classes map through the table above.
export const resolveWindowBackgroundHex = (
  value: string | undefined
): string | undefined => {
  if (!value) return undefined;
  if (HEX_RE.test(value)) return value;
  return WINDOW_BACKGROUND_OPTIONS.find((o) => o.value === value)?.hex;
};

import { WIDGET_PALETTE } from '@/config/colors';

export const PEN_COLOR_COUNT = 5;

export const DEFAULT_PEN_COLORS: readonly string[] = WIDGET_PALETTE.slice(
  0,
  PEN_COLOR_COUNT
);

const HEX_6 = /^#[0-9a-f]{6}$/i;
const HEX_3 = /^#[0-9a-f]{3}$/i;

/** Lowercase `#rrggbb` (what `<input type="color">` accepts), or null. */
export const toPenHex = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (HEX_6.test(trimmed)) return trimmed.toLowerCase();
  if (HEX_3.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
};

/** Exactly PEN_COLOR_COUNT valid hex colors, or null when the input isn't a usable palette. */
export const normalizePenColors = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) return null;
  const colors = raw.map(toPenHex);
  if (colors.length !== PEN_COLOR_COUNT) return null;
  return colors.every((c): c is string => c !== null) ? colors : null;
};

/** Teacher palette, then building palette, then the app defaults. */
export const resolvePenColors = (
  userColors: unknown,
  buildingColors: unknown
): string[] =>
  normalizePenColors(userColors) ??
  normalizePenColors(buildingColors) ?? [...DEFAULT_PEN_COLORS];

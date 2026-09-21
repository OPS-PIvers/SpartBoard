import type { AppearanceKey, Field } from './types';
import { WIDGET_PALETTE } from '@/config/colors';

// Content-tier Style fields (D18): one shared field per appearance key the generic tier can render.
// `layout` is deliberately absent — its options are per-widget, so it stays a schema field in the widget's own `display` group.
// `cardOpacity` is deliberately absent — cardColor embeds opacity via opacityKey, so a bare 'cardOpacity' styleKey is ignored.
export const UNIVERSAL_STYLE_FIELDS: Partial<Record<AppearanceKey, Field>> = {
  fontFamily: {
    type: 'fontFamily',
    key: 'fontFamily',
    label: 'style.fontFamily',
  },
  fontColor: { type: 'color', key: 'fontColor', label: 'style.fontColor' },
  cardColor: {
    type: 'surfaceColor',
    key: 'cardColor',
    label: 'style.cardColor',
    opacityKey: 'cardOpacity',
  },
  textSizePreset: {
    type: 'textSizePreset',
    key: 'textSizePreset',
    label: 'style.textSizePreset',
  },
  bgColor: { type: 'color', key: 'bgColor', label: 'style.bgColor' },
  fontSize: {
    type: 'number',
    key: 'fontSize',
    label: 'style.fontSize',
    min: 8,
    max: 200,
    step: 1,
  },
  textColor: { type: 'color', key: 'textColor', label: 'style.textColor' },
  titleColor: {
    type: 'color',
    key: 'titleColor',
    label: 'style.titleColor',
    presets: WIDGET_PALETTE,
  },
  scaleMultiplier: {
    type: 'slider',
    key: 'scaleMultiplier',
    label: 'style.scaleMultiplier',
    min: 0.5,
    max: 2,
    step: 0.1,
  },
};

/** True when the widget's own Content tier sets font or text size, making the matching Window control redundant. */
export function contentTierOverrides(
  styleKeys: ReadonlyArray<AppearanceKey> | undefined
): { font: boolean; textSize: boolean } {
  const keys = new Set(styleKeys ?? []);
  return {
    font: keys.has('fontFamily'),
    textSize:
      keys.has('textSizePreset') ||
      keys.has('fontSize') ||
      keys.has('scaleMultiplier'),
  };
}

/** Resolves a schema's `styleKeys` to the Content-tier fields the drawer renders. */
export function resolveStyleFields(
  styleKeys: ReadonlyArray<AppearanceKey> | undefined
): Field[] {
  return (styleKeys ?? [])
    .map((key) => UNIVERSAL_STYLE_FIELDS[key])
    .filter((field): field is Field => field !== undefined);
}

// What marks look like comes from the print renderer, so the editor shows what prints; only editor chrome lives here.
import type {
  PaperMarkupColor,
  PaperMarkupItem,
  PaperMarkupKind,
  PaperMarkupStamp,
} from '@/types';
import {
  PAPER_MARKUP_STYLE,
  PAPER_STAMP_GLYPHS,
} from '@/utils/paperMarkupRender';

export { PAPER_MARKUP_STYLE, PAPER_STAMP_GLYPHS };

export const MARKUP_COLORS: readonly PaperMarkupColor[] = [
  'red',
  'blue',
  'green',
  'pink',
  'yellow',
];

export const STAMP_ORDER: readonly PaperMarkupStamp[] = [
  'check',
  'x',
  'question',
  'star',
];

/** Smallest box, circle or highlight; a drag under this is read as a click. */
export const MIN_SHAPE_MM = 2;
/** Pins and numbers never draw smaller than this on screen. */
export const MIN_DISC_PX = 18;
/** Every mark is at least this easy to hit. */
export const MIN_HIT_PX = 24;

export const defaultMarkupColor = (kind: PaperMarkupKind): PaperMarkupColor =>
  PAPER_MARKUP_STYLE.defaultColor[kind];

export const markupColorOf = (item: PaperMarkupItem): PaperMarkupColor =>
  item.color ?? defaultMarkupColor(item.kind);

export const inkOf = (color: PaperMarkupColor): string =>
  PAPER_MARKUP_STYLE.palette[color].ink;

export const washOf = (color: PaperMarkupColor): string =>
  PAPER_MARKUP_STYLE.palette[color].wash;

/** Half the drawn extent of a point item, for clamping it inside the crop. */
export const pointItemRadiusMm = (kind: 'stamp' | 'pin'): number =>
  kind === 'pin'
    ? PAPER_MARKUP_STYLE.pin.diameterMm / 2
    : PAPER_MARKUP_STYLE.stamp.sizeMm / 2;

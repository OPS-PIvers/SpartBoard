// How image markup looks, in sheet millimetres; the print renderer (slice D) draws with the same values.
import type {
  PaperMarkupColor,
  PaperMarkupItem,
  PaperMarkupKind,
  PaperMarkupStamp,
} from '@/types';

export const MARKUP_COLORS: readonly PaperMarkupColor[] = [
  'red',
  'blue',
  'green',
  'pink',
  'yellow',
];

/** Strokes, stamps and pins: dark enough to read on a gray scan and on a black-and-white printer. */
export const MARKUP_INK_HEX: Readonly<Record<PaperMarkupColor, string>> = {
  red: '#d11f1f',
  blue: '#1f5fcf',
  green: '#16803a',
  pink: '#c8247a',
  yellow: '#c99a00',
};

/** Highlighter fills, drawn at `HIGHLIGHT_OPACITY` with multiply so the ink shows through. */
export const MARKUP_HIGHLIGHT_HEX: Readonly<Record<PaperMarkupColor, string>> =
  {
    red: '#ff7a7a',
    blue: '#6cbcff',
    green: '#5bdc85',
    pink: '#ff8cc6',
    yellow: '#ffe100',
  };

export const HIGHLIGHT_OPACITY = 0.35;
export const SHAPE_STROKE_MM = 0.5;
export const STAMP_SIZE_MM = 6;
export const STAMP_STROKE_MM = 0.7;
export const PIN_DIAMETER_MM = 5;
export const PIN_OUTLINE_MM = 0.35;
export const PIN_FONT_MM = 3.1;
/** Number badge on a commented highlight, box, circle or stamp. */
export const COMMENT_BADGE_DIAMETER_MM = 3.8;
export const COMMENT_BADGE_FONT_MM = 2.5;

/** Smallest box, circle or highlight; a drag under this is read as a click. */
export const MIN_SHAPE_MM = 2;

/** Absent color means this default (the contract in types.ts). */
export const defaultMarkupColor = (kind: PaperMarkupKind): PaperMarkupColor =>
  kind === 'highlight' ? 'yellow' : 'red';

export const markupColorOf = (item: PaperMarkupItem): PaperMarkupColor =>
  item.color ?? defaultMarkupColor(item.kind);

/** Half the drawn extent of a point item, for clamping it inside the crop. */
export const pointItemRadiusMm = (kind: 'stamp' | 'pin'): number =>
  kind === 'pin' ? PIN_DIAMETER_MM / 2 : STAMP_SIZE_MM / 2;

/** Stamp glyphs as stroke paths centred on 0,0 inside a `STAMP_SIZE_MM` square. */
export const STAMP_GLYPHS: Readonly<
  Record<
    PaperMarkupStamp,
    { d: string; dot?: { cx: number; cy: number; r: number } }
  >
> = {
  check: { d: 'M -2.3 0.1 L -0.7 1.9 L 2.5 -2.1' },
  x: { d: 'M -2.1 -2.1 L 2.1 2.1 M 2.1 -2.1 L -2.1 2.1' },
  question: {
    d: 'M -1.6 -1.1 C -1.6 -3.1 1.7 -3.1 1.7 -1.2 C 1.7 0.1 0 0.2 0 1.3',
    dot: { cx: 0, cy: 2.45, r: 0.5 },
  },
  star: {
    d: 'M 0 -2.8 L 0.75 -0.95 L 2.65 -0.85 L 1.2 0.4 L 1.65 2.3 L 0 1.25 L -1.65 2.3 L -1.2 0.4 L -2.65 -0.85 L -0.75 -0.95 Z',
  },
};

export const STAMP_ORDER: readonly PaperMarkupStamp[] = [
  'check',
  'x',
  'question',
  'star',
];

// Image markup drawn in sheet millimetres (docs/plans/shipped/QUIZ_PAPER_KEPT_PAGES.md §3.3); one call serves a crop or a whole page.
import {
  PAPER_MARKUP_MAX_ITEMS,
  type PaperMarkupColor,
  type PaperMarkupItem,
  type PaperMarkupKind,
  type PaperMarkupStamp,
  type PaperPointMm,
  type PaperRectMm,
} from '@/types';
import { escapeHtml } from './printHtmlDocument';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './paperSheetLayout';
import { READER_THRESHOLDS } from './paperSheetReader';

/** Margin the reader adds around a box before cropping it. */
export const PAPER_CROP_MARGIN_MM = READER_THRESHOLDS.writtenCropMarginMm;

/** The whole US Letter sheet, for drawing over a kept page. */
export const FULL_PAGE_VIEWPORT_MM: Readonly<PaperRectMm> = {
  x: 0,
  y: 0,
  w: PAGE_WIDTH_MM,
  h: PAGE_HEIGHT_MM,
};

/** Natural pixel size of a loaded image (`img.naturalWidth` / `naturalHeight`). */
export interface ImageSizePx {
  width: number;
  height: number;
}

/** The sheet area a handwriting crop shows: its box plus the crop margin. */
export function cropViewportMm(boxMm: PaperRectMm): PaperRectMm {
  const m = PAPER_CROP_MARGIN_MM;
  return {
    x: boxMm.x - m,
    y: boxMm.y - m,
    w: boxMm.w + m * 2,
    h: boxMm.h + m * 2,
  };
}

// Scales come from the image's real size, so a crop the encoder halved still maps exactly.
const scaleOf = (viewport: PaperRectMm, image: ImageSizePx) => ({
  x: image.width / viewport.w,
  y: image.height / viewport.h,
});

/** A point in crop pixels (natural size) to sheet millimetres. */
export function cropPxToSheetMm(
  px: PaperPointMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperPointMm {
  const view = cropViewportMm(boxMm);
  const s = scaleOf(view, image);
  return { x: view.x + px.x / s.x, y: view.y + px.y / s.y };
}

/** A point in sheet millimetres to crop pixels (natural size). */
export function sheetMmToCropPx(
  mm: PaperPointMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperPointMm {
  const view = cropViewportMm(boxMm);
  const s = scaleOf(view, image);
  return { x: (mm.x - view.x) * s.x, y: (mm.y - view.y) * s.y };
}

/** A rect in crop pixels to sheet millimetres. */
export function cropRectPxToSheetMm(
  rect: PaperRectMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperRectMm {
  const a = cropPxToSheetMm({ x: rect.x, y: rect.y }, boxMm, image);
  const b = cropPxToSheetMm(
    { x: rect.x + rect.w, y: rect.y + rect.h },
    boxMm,
    image
  );
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** A rect in sheet millimetres to crop pixels. */
export function sheetRectMmToCropPx(
  rect: PaperRectMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperRectMm {
  const a = sheetMmToCropPx({ x: rect.x, y: rect.y }, boxMm, image);
  const b = sheetMmToCropPx(
    { x: rect.x + rect.w, y: rect.y + rect.h },
    boxMm,
    image
  );
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** One numbered comment printed under its answer (K10). */
export interface PaperMarkupComment {
  /** 1-based, per answer, in item order. */
  number: number;
  itemId: string;
  text: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const commentOf = (item: unknown): string =>
  isRecord(item) && typeof item.comment === 'string' ? item.comment.trim() : '';

/** Stored items, minus anything that is not an object, capped at the editor's limit. */
const usable = (items: readonly unknown[]): Record<string, unknown>[] => {
  const list: readonly unknown[] = Array.isArray(items) ? items : [];
  return list.filter(isRecord).slice(0, PAPER_MARKUP_MAX_ITEMS);
};

const commentsOf = (
  list: readonly Record<string, unknown>[]
): PaperMarkupComment[] => {
  const out: PaperMarkupComment[] = [];
  for (const item of list) {
    const text = commentOf(item);
    if (text) {
      out.push({
        number: out.length + 1,
        itemId: typeof item.id === 'string' ? item.id : '',
        text,
      });
    }
  }
  return out;
};

/** Items carrying a non-blank comment, numbered 1..n in item order; the pin numbers match. */
export function numberMarkupComments(
  items: readonly PaperMarkupItem[]
): PaperMarkupComment[] {
  return commentsOf(usable(items));
}

interface Wash {
  /** Highlighter color, laid at 35% over the work. */
  wash: string;
  /** Strokes, stamps and number fills: bright, standard pen colours that stand out on handwriting. */
  ink: string;
}

/** One style for the editor and the print, in sheet millimetres (QUIZ_PAPER_KEPT_PAGES.md K9, K11, K21). */
export const PAPER_MARKUP_STYLE = {
  highlight: { opacity: 0.35, blend: 'multiply' },
  /** Box and circle. */
  shape: { strokeMm: 0.5 },
  stamp: { sizeMm: 6, strokeMm: 0.7 },
  pin: { diameterMm: 5, haloMm: 0.4 },
  /** The small number on an item that has a comment but is not a pin. */
  badge: { diameterMm: 4.2, haloMm: 0.3 },
  defaultColor: {
    highlight: 'yellow',
    rect: 'red',
    ellipse: 'red',
    stamp: 'red',
    pin: 'red',
  } satisfies Record<PaperMarkupKind, PaperMarkupColor>,
  palette: {
    yellow: { wash: '#ffe600', ink: '#ffd500' },
    green: { wash: '#00e63c', ink: '#00b832' },
    pink: { wash: '#ff33c8', ink: '#ff00aa' },
    blue: { wash: '#1a9dff', ink: '#0066ff' },
    red: { wash: '#ff1a1a', ink: '#ff0000' },
  } satisfies Record<PaperMarkupColor, Wash>,
} as const;

export interface StampGlyph {
  /** Path in a 0..1 box; stroked, and filled too when `solid`. */
  d: string;
  solid?: boolean;
}

const starPath = (): string => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 0.47 : 0.2;
    const a = (-90 + i * 36) * (Math.PI / 180);
    return `${(0.5 + r * Math.cos(a)).toFixed(3)} ${(0.54 + r * Math.sin(a)).toFixed(3)}`;
  });
  return `M${pts.join(' L')} Z`;
};

/** Stamp shapes in a unit box, so a stamp reads by shape in black and white (K9, K11). */
export const PAPER_STAMP_GLYPHS: Readonly<
  Record<PaperMarkupStamp, StampGlyph>
> = {
  check: { d: 'M0.1 0.56 L0.38 0.84 L0.92 0.14' },
  x: { d: 'M0.14 0.14 L0.86 0.86 M0.86 0.14 L0.14 0.86' },
  question: {
    d: 'M0.26 0.3 C0.26 -0.02 0.74 -0.02 0.74 0.3 C0.74 0.52 0.5 0.54 0.5 0.7 M0.5 0.92 L0.5 0.93',
  },
  star: { d: starPath(), solid: true },
};

const KINDS: readonly PaperMarkupKind[] = [
  'highlight',
  'rect',
  'ellipse',
  'stamp',
  'pin',
];
const COLORS = Object.keys(PAPER_MARKUP_STYLE.palette) as PaperMarkupColor[];
const STAMPS = Object.keys(PAPER_STAMP_GLYPHS) as PaperMarkupStamp[];

const kindOf = (item: Record<string, unknown>): PaperMarkupKind | null =>
  KINDS.find((k) => k === item.kind) ?? null;

const colorOf = (
  item: Record<string, unknown>,
  kind: PaperMarkupKind | null
): PaperMarkupColor =>
  COLORS.find((c) => c === item.color) ??
  PAPER_MARKUP_STYLE.defaultColor[kind ?? 'pin'];

/** The dark fill a comment's number sits on, for the pin, the badge and the list. */
const inkOf = (item: Record<string, unknown>): string =>
  PAPER_MARKUP_STYLE.palette[colorOf(item, kindOf(item))].ink;

/** Shorter than `toFixed`, and never `-0`. */
const n = (v: number, digits = 3): string =>
  String(Math.round(v * 10 ** digits) / 10 ** digits + 0);

const rectOf = (v: unknown): PaperRectMm | null => {
  if (!isRecord(v) || !isNum(v.x) || !isNum(v.y) || !isNum(v.w) || !isNum(v.h))
    return null;
  const w = Math.abs(v.w);
  const h = Math.abs(v.h);
  if (w === 0 || h === 0) return null;
  return { x: v.w < 0 ? v.x + v.w : v.x, y: v.h < 0 ? v.y + v.h : v.y, w, h };
};

const pointOf = (v: unknown): PaperPointMm | null =>
  isRecord(v) && isNum(v.x) && isNum(v.y) ? { x: v.x, y: v.y } : null;

const clamp = (v: number, lo: number, hi: number): number =>
  hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));

export interface Disc {
  x: number;
  y: number;
  r: number;
}

/** Keeps a numbered disc fully inside the viewport and off any disc already placed, sliding it left along the top edge. */
export function placeDisc(
  want: PaperPointMm,
  r: number,
  view: PaperRectMm,
  taken: Disc[]
): PaperPointMm {
  const at = (dx: number): PaperPointMm => ({
    x: clamp(want.x - dx, view.x + r, view.x + view.w - r),
    y: clamp(want.y, view.y + r, view.y + view.h - r),
  });
  for (let step = 0; step < 8; step += 1) {
    const p = at(step * r * 1.7);
    if (taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= t.r + r)) {
      return p;
    }
  }
  return at(0);
}

/** Number colour on an ink fill: white when it reads (WCAG 3.9+ for a bold chip), else near-black. */
export const onInk = (ink: string): string => {
  const lin = (i: number): number => {
    const c = parseInt(ink.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  const white = 1.05 / (l + 0.05);
  return white >= 3.9 || white > (l + 0.05) / 0.0556 ? '#fff' : '#111';
};

const FONT = 'font-family="Arial,Helvetica,sans-serif" font-weight="700"';

/** An ink disc with a contrasting number, haloed in white so it holds up over pencil. */
function discSvg(
  at: PaperPointMm,
  d: number,
  halo: number,
  ink: string,
  label: string
): string {
  const r = d / 2;
  const size = label.length > 1 ? d * 0.6 : d * 0.68;
  return (
    `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r + halo / 2)}" fill="#fff"/>` +
    `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r)}" fill="${ink}"/>` +
    (label
      ? `<text x="${n(at.x)}" y="${n(at.y)}" dy="0.35em" text-anchor="middle" font-size="${n(size)}" fill="${onInk(ink)}" ${FONT}>${label}</text>`
      : '')
  );
}

export interface PaperMarkupRenderOptions {
  /** Class on the `<svg>`, so the caller can position it over the image; anything but letters, digits, `-` and `_` is dropped. */
  className?: string;
  /** Stretches the `<svg>` over its positioned parent, so it scales with it. */
  overlay?: boolean;
  /** Printed size over sheet size, when the viewport prints smaller than life: strokes, stamps and numbers grow to stay their printed size (up to 1.4x). */
  scale?: number;
}

export interface PaperMarkupRender {
  /** `<svg viewBox>` in millimetres of the viewport; scales to whatever box holds it. */
  svg: string;
  /** The numbered comment list for under the answer. */
  comments: PaperMarkupComment[];
}

const PRINT_EXACT = '-webkit-print-color-adjust:exact;print-color-adjust:exact';

function svgShell(
  view: PaperRectMm,
  body: string,
  options: PaperMarkupRenderOptions
): string {
  const safe = (options.className ?? '').replace(/[^\w -]/g, '').trim();
  const cls = safe ? ` class="${escapeHtml(safe)}"` : '';
  const pos = options.overlay
    ? ';position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${cls} viewBox="${n(view.x)} ${n(view.y)} ${n(view.w)} ${n(view.h)}" preserveAspectRatio="none" overflow="hidden" aria-hidden="true" focusable="false" style="${PRINT_EXACT}${pos}">${body}</svg>`;
}

/** One answer's shapes, then its stamps, then its numbers on top, appended to the layers. */
function drawAnswer(
  items: readonly unknown[],
  view: PaperRectMm,
  taken: Disc[],
  layers: { wash: string[]; line: string[]; top: string[] },
  pen: number
): PaperMarkupComment[] {
  const list = usable(items);
  const comments = commentsOf(list);
  const numberOf = new Map<Record<string, unknown>, number>();
  let next = 0;
  for (const item of list) {
    if (commentOf(item)) numberOf.set(item, comments[next++].number);
  }
  const { stamp, pin, badge, shape, highlight } = PAPER_MARKUP_STYLE;
  for (const item of list) {
    const kind = kindOf(item);
    if (!kind) continue;
    const color = PAPER_MARKUP_STYLE.palette[colorOf(item, kind)];
    const num = numberOf.get(item);
    const label = num === undefined ? '' : String(num);
    if (kind === 'pin') {
      const at = pointOf(item.atMm);
      if (!at) continue;
      const d = pin.diameterMm * pen;
      const p = placeDisc(at, d / 2, view, taken);
      taken.push({ ...p, r: d / 2 });
      layers.top.push(discSvg(p, d, pin.haloMm * pen, color.ink, label));
      continue;
    }
    // The corner a badge hangs from: the top right of the item's box.
    let corner: PaperPointMm | null = null;
    if (kind === 'stamp') {
      const at = pointOf(item.atMm);
      const symbol = STAMPS.find((s) => s === item.symbol);
      if (!at || !symbol) continue;
      const glyph = PAPER_STAMP_GLYPHS[symbol];
      const s = stamp.sizeMm * pen;
      layers.line.push(
        `<path transform="translate(${n(at.x - s / 2)} ${n(at.y - s / 2)}) scale(${s})" d="${glyph.d}" fill="${glyph.solid ? color.ink : 'none'}" stroke="${color.ink}" stroke-width="${n((stamp.strokeMm * pen) / s, 5)}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
      corner = { x: at.x + s / 2, y: at.y - s / 2 };
    } else {
      const r = rectOf(item.rectMm);
      if (!r) continue;
      if (kind === 'highlight') {
        layers.wash.push(
          `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${color.wash}" fill-opacity="${highlight.opacity}" style="mix-blend-mode:${highlight.blend}"/>`
        );
      } else if (kind === 'rect') {
        layers.line.push(
          `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="none" stroke="${color.ink}" stroke-width="${n(shape.strokeMm * pen)}" stroke-linejoin="round"/>`
        );
      } else {
        layers.line.push(
          `<ellipse cx="${n(r.x + r.w / 2)}" cy="${n(r.y + r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}" fill="none" stroke="${color.ink}" stroke-width="${n(shape.strokeMm * pen)}"/>`
        );
      }
      corner = { x: r.x + r.w, y: r.y };
    }
    if (label && corner) {
      const d = badge.diameterMm * pen;
      const r = d / 2;
      // Hangs off the corner, mostly outside the box, so the work stays visible.
      const p = placeDisc(
        { x: corner.x + r * 0.3, y: corner.y - r * 0.3 },
        r,
        view,
        taken
      );
      taken.push({ ...p, r });
      layers.top.push(discSvg(p, d, badge.haloMm * pen, color.ink, label));
    }
  }
  return comments;
}

/** Several answers' markup in one `<svg>` over one viewport (a whole page); numbers restart per answer. */
export function renderPaperMarkupAnswers(
  answers: readonly (readonly PaperMarkupItem[])[],
  viewportMm: PaperRectMm,
  options: PaperMarkupRenderOptions = {}
): { svg: string; comments: PaperMarkupComment[][] } {
  const layers = {
    wash: [] as string[],
    line: [] as string[],
    top: [] as string[],
  };
  const taken: Disc[] = [];
  const pen =
    options.scale && options.scale > 0 && options.scale < 1
      ? Math.min(1.4, 1 / options.scale)
      : 1;
  const comments = answers.map((items) =>
    drawAnswer(items, viewportMm, taken, layers, pen)
  );
  const body = `${layers.wash.join('')}<g>${layers.line.join('')}</g><g>${layers.top.join('')}</g>`;
  return { svg: svgShell(viewportMm, body, options), comments };
}

/** One answer's markup as an SVG drawn over `viewportMm` (a crop's `cropViewportMm` or `FULL_PAGE_VIEWPORT_MM`). Items outside it are clipped; numbers stay inside. */
export function renderPaperMarkup(
  items: readonly PaperMarkupItem[],
  viewportMm: PaperRectMm,
  options: PaperMarkupRenderOptions = {}
): PaperMarkupRender {
  const out = renderPaperMarkupAnswers([items], viewportMm, options);
  return { svg: out.svg, comments: out.comments[0] };
}

const BADGE_BASE =
  'display:inline-block;font-weight:700;text-align:center;text-indent:0;white-space:nowrap;box-sizing:border-box;';

/** The number as it prints in a list: the same dark disc the pin and badge use. */
export function markupNumberChipHtml(
  num: number,
  ink: string,
  sizeMm = 4.2,
  fontPt = 8,
  inline = true
): string {
  const place = inline ? 'margin-right:1.2mm;vertical-align:1px' : 'margin:0';
  return `<span style="${BADGE_BASE}min-width:${sizeMm}mm;height:${sizeMm}mm;line-height:${sizeMm}mm;padding:0 0.7mm;border-radius:${sizeMm / 2}mm;font-size:${fontPt}pt;color:${onInk(ink)};background:${ink};${place}">${num}</span>`;
}

/** The numbered comment list for under an answer: each number matches its pin or badge. Empty when nothing is commented. */
export function markupCommentListHtml(
  items: readonly PaperMarkupItem[]
): string {
  const list = usable(items);
  const rows = list
    .filter((item) => commentOf(item))
    .map(
      (item, i) =>
        `<li style="display:flex;align-items:flex-start;margin:0 0 2mm;break-inside:avoid"><span style="flex:none;width:6mm;height:4.4mm;display:flex;align-items:center">${markupNumberChipHtml(i + 1, inkOf(item), 4.2, 8, false)}</span><span style="flex:1;min-width:0;line-height:4.4mm;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(commentOf(item))}</span></li>`
    );
  if (rows.length === 0) return '';
  return `<ol class="notes" style="list-style:none;padding-left:0;margin:1mm 0 1.5mm;${PRINT_EXACT}">${rows.join('')}</ol>`;
}

/** The ink and text of each numbered comment, in order, for a caller laying out its own strip. */
export function markupCommentRows(
  items: readonly PaperMarkupItem[]
): { number: number; text: string; ink: string }[] {
  return usable(items)
    .filter((item) => commentOf(item))
    .map((item, i) => ({
      number: i + 1,
      text: commentOf(item),
      ink: inkOf(item),
    }));
}

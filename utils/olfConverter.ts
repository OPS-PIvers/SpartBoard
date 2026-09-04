import JSZip from 'jszip';
import { NotebookObjectLink } from '@/types';
import { ensureSvgNamespaces } from './smartNotebook';
import { canvasOptimizeImage, ImageOptimizer } from './notebookConverter';

/**
 * ViewSonic myViewBoard `.olf` -> SpartBoard `.spartnb` converter.
 *
 * An `.olf` is a zip holding a single `content.json` describing pages, their
 * elements (textareas, shapes, pen strokes, images) and backgrounds, plus the
 * image files those elements reference. There is no public
 * spec, so every read is tolerant: anything unrecognised is counted in
 * `skipped` and never throws. Output is the same bundle shape the SMART
 * converter emits (`pages/{i}.svg` + `manifest.json`), so the parser, upload,
 * viewer and editor all work unchanged.
 */

/** Measures the advance width of `text` rendered with a CSS `font` shorthand. */
export type MeasureText = (text: string, fontCss: string) => number;

export interface OlfConvertOptions {
  /** Override text measurement (tests inject a monospace stub). */
  measureText?: MeasureText;
  /** Progress callback, fired after each page is written. */
  onProgress?: (done: number, total: number) => void;
  /** Cap the longest edge of embedded images, px. 0 disables resizing. */
  maxEdge?: number;
  /** WebP quality 0..1 for lossy re-encode. */
  quality?: number;
  /** Override the image optimizer (tests pass a canvas-free stub). */
  optimizeImage?: ImageOptimizer;
}

export interface OlfConvertResult {
  blob: Blob;
  title: string;
  pageCount: number;
  hiddenPageCount: number;
  /** Element type (or reason) → how many were dropped. */
  skipped: Record<string, number>;
  warnings: string[];
}

/** `hiddenPages` is written even though BundleManifest doesn't declare it yet. */
interface OlfBundleManifest {
  version: number;
  title: string;
  pageCount: number;
  pages: { file: string; width: number; height: number }[];
  sections: never[];
  hiddenPages?: number[];
  objectLinks?: NotebookObjectLink[];
}

export const isOlfFile = (name: string): boolean => /\.olf$/i.test(name.trim());

// ---------------------------------------------------------------------------
// Tolerant JSON accessors
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const num = (o: Json, key: string, fallback: number): number => {
  const v = o[key];
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

const str = (o: Json, key: string): string =>
  typeof o[key] === 'string' ? o[key] : '';

/** Unwraps myViewBoard's `{ wrapperName: {...} }` envelopes. */
const unwrap = (entry: unknown): { kind: string; body: Json } | null => {
  const obj = asObject(entry);
  if (!obj) return null;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return null;
  const body = asObject(obj[keys[0]]);
  return body ? { kind: keys[0], body } : null;
};

// ---------------------------------------------------------------------------
// Encoding repair
// ---------------------------------------------------------------------------

const MOJIBAKE_RE = /[Â-Ã][-¿]/;

/**
 * Some `.olf` writers emit UTF-8 bytes that were already decoded as latin1,
 * so "Ausdrücke" arrives as "AusdrÃ¼cke". Repair only when the string both
 * looks like mojibake and round-trips cleanly; otherwise leave it alone.
 */
export const repairEncoding = (input: string): string => {
  if (!MOJIBAKE_RE.test(input)) return input;
  try {
    const bytes = Uint8Array.from(input, (c) => {
      const code = c.charCodeAt(0);
      if (code > 0xff) throw new Error('not latin1');
      return code;
    });
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.includes('�') ? input : decoded;
  } catch {
    return input;
  }
};

const isBroken = (s: string): boolean => s.includes('�');

// ---------------------------------------------------------------------------
// RTF (`custom-data`) fallback
// ---------------------------------------------------------------------------

const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

const cp1252 = (byte: number): string =>
  String.fromCharCode(CP1252_HIGH[byte] ?? byte);

export interface RtfInfo {
  /** One entry per `\par`-delimited paragraph, control words resolved. */
  paragraphs: string[];
  /** Exact line spacing in px, from `\slN` (twips), when present. */
  lineHeightPx?: number;
  /** Explicit tab stops in px, from `\txN` (twips). */
  tabStopsPx: number[];
}

const TWIPS_TO_PX = 96 / 72 / 20;

/** Parses the RTF blob myViewBoard stores alongside each textarea. */
export const parseRtf = (rtf: string): RtfInfo => {
  const paragraphs: string[] = [];
  const tabStopsPx: number[] = [];
  let lineHeightPx: number | undefined;
  let current = '';
  let i = 0;

  const skipGroup = (start: number): number => {
    let depth = 0;
    for (let j = start; j < rtf.length; j++) {
      const c = rtf[j];
      if (c === '\\') {
        j += 1;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
    }
    return rtf.length;
  };

  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      const ahead = rtf.slice(i + 1, i + 12);
      if (/^\\(\*|fonttbl|colortbl|stylesheet|info)/.test(ahead)) {
        i = skipGroup(i);
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === '}') {
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }
    if (ch !== '\\') {
      current += ch;
      i += 1;
      continue;
    }

    // Control sequence.
    const rest = rtf.slice(i);
    const hex = /^\\'([0-9a-fA-F]{2})/.exec(rest);
    if (hex) {
      current += cp1252(parseInt(hex[1], 16));
      i += hex[0].length;
      continue;
    }
    const uni = /^\\u(-?\d+)\s?/.exec(rest);
    if (uni) {
      const code = parseInt(uni[1], 10);
      current += String.fromCharCode(code < 0 ? code + 65536 : code);
      i += uni[0].length;
      // The following replacement character is the fallback glyph.
      if (rtf[i] === '?') i += 1;
      continue;
    }
    const escaped = /^\\([\\{}])/.exec(rest);
    if (escaped) {
      current += escaped[1];
      i += 2;
      continue;
    }
    const word = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rest);
    if (word) {
      const name = word[1];
      const value = word[2] ? parseInt(word[2], 10) : undefined;
      if (name === 'par') {
        paragraphs.push(current);
        current = '';
      } else if (name === 'tab') {
        current += '\t';
      } else if (name === 'line') {
        current += '\n';
      } else if (name === 'sl' && value !== undefined && value !== 0) {
        lineHeightPx = Math.abs(value) * TWIPS_TO_PX;
      } else if (name === 'tx' && value !== undefined) {
        tabStopsPx.push(value * TWIPS_TO_PX);
      }
      i += word[0].length;
      continue;
    }
    i += 1;
  }
  if (current.trim().length > 0) paragraphs.push(current);
  return {
    paragraphs,
    lineHeightPx,
    tabStopsPx: tabStopsPx.sort((a, b) => a - b),
  };
};

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export interface SplitColor {
  hex: string;
  opacity: number;
}

/** Splits `#AARRGGBB` (or passes through `#RRGGBB`) into hex + opacity. */
export const splitArgb = (value: string): SplitColor | null => {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return {
      hex: `#${raw.slice(2).toLowerCase()}`,
      opacity: parseInt(raw.slice(0, 2), 16) / 255,
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return { hex: `#${raw.toLowerCase()}`, opacity: 1 };
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.toLowerCase();
    return { hex: `#${r}${r}${g}${g}${b}${b}`, opacity: 1 };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * `.olf` matrices are 3x3 row-major "a,b,c,d,e,f,g,h,i" where a row maps
 * x' = a*x + b*y + c. SVG's `matrix(a b c d e f)` is column-major, so the
 * middle two entries swap.
 */
export const matrixToSvg = (value: string): string | null => {
  const m = parseOlfMatrix(value);
  if (!m) return null;
  return `matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})`;
};

/** SVG matrix `[a, b, c, d, e, f]`. */
type Mat = [number, number, number, number, number, number];

const IDENTITY_MAT: Mat = [1, 0, 0, 1, 0, 0];

/** Parses a 3x3 `.olf` matrix into an SVG matrix; null when absent/identity. */
const parseOlfMatrix = (value: string): Mat | null => {
  const parts = value
    .split(',')
    .map((p) => parseFloat(p.trim()))
    .filter((p) => Number.isFinite(p));
  if (parts.length !== 9) return null;
  if (parts.every((p, idx) => Math.abs(p - IDENTITY[idx]) < 1e-9)) return null;
  const [a, b, c, d, e, f] = parts;
  return [a, d, b, e, c, f];
};

const mulMat = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const applyMat = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const parseViewbox = (
  value: string
): { width: number; height: number } | null => {
  const parts = value
    .split(/[\s,]+/)
    .map((p) => parseFloat(p))
    .filter((p) => Number.isFinite(p));
  if (parts.length !== 4 || parts[2] <= 0 || parts[3] <= 0) return null;
  return { width: parts[2], height: parts[3] };
};

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attrs = (map: Record<string, string | number | undefined>): string =>
  Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${xmlEscape(String(v))}"`)
    .join('');

const round = (n: number): number => Math.round(n * 100) / 100;

/** Breathing room added on any side the content overflows the declared page. */
const PAGE_PADDING = 24;

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

const DEFAULT_TAB_PX = 48;
const FONT_FALLBACK = "'Segoe UI', Lexend, Arial, sans-serif";

const fontStack = (family: string): string => {
  const name = family.trim();
  if (!name) return FONT_FALLBACK;
  if (/^segoe ui$/i.test(name)) return FONT_FALLBACK;
  return `'${name.replace(/'/g, '')}', ${FONT_FALLBACK}`;
};

const fontCss = (
  size: number,
  family: string,
  weight: string,
  style: string
): string =>
  `${style && style !== 'normal' ? `${style} ` : ''}${
    weight && weight !== 'normal' ? `${weight} ` : ''
  }${size}px ${fontStack(family)}`;

const estimateMeasure: MeasureText = (text, css) => {
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(css)?.[1] ?? '16');
  return text.length * size * 0.5;
};

const canvasMeasure = (): MeasureText => {
  let ctx: CanvasRenderingContext2D | null | undefined;
  return (text, css) => {
    if (ctx === undefined) {
      // jsdom hands back a context object with no measureText — treat it as absent.
      const candidate =
        typeof document === 'undefined'
          ? null
          : document.createElement('canvas').getContext('2d');
      ctx = typeof candidate?.measureText === 'function' ? candidate : null;
    }
    if (!ctx) return estimateMeasure(text, css);
    ctx.font = css;
    return ctx.measureText(text).width;
  };
};

const nextTabStop = (x: number, origin: number, stops: number[]): number => {
  for (const stop of stops) {
    if (origin + stop > x + 0.01) return origin + stop;
  }
  const base = stops.length > 0 ? origin + stops[stops.length - 1] : origin;
  const offset = x - base;
  return base + (Math.floor(offset / DEFAULT_TAB_PX) + 1) * DEFAULT_TAB_PX;
};

interface RunStyle {
  size: number;
  family: string;
  weight: string;
  style: string;
  decoration: string;
  fill: SplitColor | null;
  background: SplitColor | null;
  backgroundOpacity: number;
}

interface Cell {
  x: number;
  width: number;
  text: string;
  style: RunStyle;
  column: number;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

interface ElementMeta {
  locked: boolean;
  moveLocked: boolean;
  flip: string;
}

interface PageContext {
  skipped: Record<string, number>;
  warnings: string[];
  meta: Map<string, ElementMeta>;
  measure: MeasureText;
  pageBackgroundHex: string | null;
  /** `source` path → optimized data URI, resolved before rendering. */
  imageUris: Map<string, string>;
  /** Arrow marker id → `<marker>` markup, one per stroke colour per page. */
  markers: Map<string, string>;
  /** Union of every emitted element's bounds, in page coordinates. */
  bounds: Bounds | null;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Grows the page bounds by the transformed points, plus a stroke margin. */
const extendBounds = (
  ctx: PageContext,
  mat: Mat,
  points: [number, number][],
  margin = 0
): void => {
  for (const [px, py] of points) {
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const [x, y] = applyMat(mat, px, py);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const next = {
      minX: x - margin,
      minY: y - margin,
      maxX: x + margin,
      maxY: y + margin,
    };
    ctx.bounds = ctx.bounds
      ? {
          minX: Math.min(ctx.bounds.minX, next.minX),
          minY: Math.min(ctx.bounds.minY, next.minY),
          maxX: Math.max(ctx.bounds.maxX, next.maxX),
          maxY: Math.max(ctx.bounds.maxY, next.maxY),
        }
      : next;
  }
};

const cornersOf = (box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): [number, number][] => [
  [box.x, box.y],
  [box.x + box.width, box.y],
  [box.x, box.y + box.height],
  [box.x + box.width, box.y + box.height],
];

const parsePointList = (raw: string): [number, number][] => {
  const out: [number, number][] = [];
  for (const pair of raw.trim().split(/\s+/)) {
    const [x, y] = pair.split(',').map((p) => parseFloat(p));
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
};

const bump = (bag: Record<string, number>, key: string): void => {
  bag[key] = (bag[key] ?? 0) + 1;
};

const metaAttrs = (meta: ElementMeta | undefined): string => {
  if (!meta) return '';
  return attrs({
    'data-olf-locked': meta.locked ? 'true' : undefined,
    'data-olf-move-locked': meta.moveLocked ? 'true' : undefined,
  });
};

const flipTransform = (
  meta: ElementMeta | undefined,
  box: { x: number; y: number; width: number; height: number }
): string | null => {
  const flip = meta?.flip;
  if (!flip || flip === 'none') return null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (flip === 'horizontal') return `translate(${round(2 * cx)} 0) scale(-1 1)`;
  if (flip === 'vertical') return `translate(0 ${round(2 * cy)}) scale(1 -1)`;
  if (flip === 'both') {
    return `translate(${round(2 * cx)} ${round(2 * cy)}) scale(-1 -1)`;
  }
  return null;
};

const flipMatrix = (
  meta: ElementMeta | undefined,
  box: { x: number; y: number; width: number; height: number }
): Mat | null => {
  const flip = meta?.flip;
  if (!flip || flip === 'none') return null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (flip === 'horizontal') return [-1, 0, 0, 1, 2 * cx, 0];
  if (flip === 'vertical') return [1, 0, 0, -1, 0, 2 * cy];
  if (flip === 'both') return [-1, 0, 0, -1, 2 * cx, 2 * cy];
  return null;
};

/** Numeric twin of `elementTransform`, used to place bounds. */
const elementMatrix = (
  body: Json,
  meta: ElementMeta | undefined,
  box: { x: number; y: number; width: number; height: number }
): Mat => {
  const flip = flipMatrix(meta, box);
  const matrix = parseOlfMatrix(str(body, 'matrix'));
  if (flip && matrix) return mulMat(flip, matrix);
  return flip ?? matrix ?? IDENTITY_MAT;
};

/** Combines an element's own matrix with any flip mirror. */
const elementTransform = (
  body: Json,
  meta: ElementMeta | undefined,
  box: { x: number; y: number; width: number; height: number }
): string | undefined => {
  const parts: string[] = [];
  const flip = flipTransform(meta, box);
  if (flip) parts.push(flip);
  const matrix = matrixToSvg(str(body, 'matrix'));
  if (matrix) parts.push(matrix);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

const readRunStyle = (run: Json, paragraphSize: number): RunStyle => ({
  size: num(run, 'font-size', paragraphSize),
  family: str(run, 'font-family'),
  weight: str(run, 'font-weight') || 'normal',
  style: str(run, 'font-style') || 'normal',
  decoration: str(run, 'text-decoration') || 'normal',
  fill: splitArgb(str(run, 'fill')),
  background: splitArgb(str(run, 'background')),
  backgroundOpacity: num(run, 'background-opacity', 0),
});

const cellFont = (style: RunStyle): string =>
  fontCss(style.size, style.family, style.weight, style.style);

/** Groups cells into the columns produced by tab / wide-space breaks. */
const groupColumns = (cells: Cell[]): Cell[][] => {
  const groups: Cell[][] = [];
  cells.forEach((cell) => {
    const last = groups[groups.length - 1];
    if (last && last[0].column === cell.column) last.push(cell);
    else groups.push([cell]);
  });
  return groups;
};

/** Trims each column's outer whitespace, shifting x by the dropped prefix. */
const trimColumns = (groups: Cell[][], ctx: PageContext): Cell[][] =>
  groups
    .map((group) => {
      const kept: Cell[] = [];
      let leading = true;
      group.forEach((cell) => {
        let { x, text, width } = cell;
        if (leading) {
          const lead = /^\s*/.exec(text)?.[0] ?? '';
          if (lead) {
            const shift = ctx.measure(lead, cellFont(cell.style));
            x += shift;
            width -= shift;
            text = text.slice(lead.length);
          }
          if (text.length > 0) leading = false;
        }
        if (text.length > 0) kept.push({ ...cell, x, text, width });
      });
      while (kept.length > 0) {
        const last = kept[kept.length - 1];
        const trail = /\s*$/.exec(last.text)?.[0] ?? '';
        if (trail) {
          last.width -= ctx.measure(trail, cellFont(last.style));
          last.text = last.text.slice(0, last.text.length - trail.length);
        }
        if (last.text.length === 0) kept.pop();
        else break;
      }
      return kept;
    })
    .filter((group) => group.length > 0);

/** Splits a paragraph's runs into tab-delimited, absolutely positioned cells. */
const layoutParagraph = (
  runs: Json[],
  paragraphSize: number,
  originX: number,
  ctx: PageContext,
  rtfFallback: string | undefined,
  tabStops: number[]
): Cell[][] => {
  const cells: Cell[] = [];
  let cursor = originX;
  let pendingX = originX;
  let pendingText = '';
  let pendingStyle: RunStyle | null = null;
  let column = 0;

  const flush = (): void => {
    if (pendingText.length > 0 && pendingStyle) {
      const style = pendingStyle;
      const width = ctx.measure(pendingText, cellFont(style));
      cells.push({ x: pendingX, width, text: pendingText, style, column });
    }
    pendingText = '';
    pendingStyle = null;
  };

  const sameStyle = (a: RunStyle, b: RunStyle): boolean =>
    a.size === b.size &&
    a.family === b.family &&
    a.weight === b.weight &&
    a.style === b.style &&
    a.decoration === b.decoration &&
    a.fill?.hex === b.fill?.hex &&
    a.background?.hex === b.background?.hex &&
    a.backgroundOpacity === b.backgroundOpacity;

  runs.forEach((run) => {
    const style = readRunStyle(run, paragraphSize);
    if (pendingStyle && !sameStyle(pendingStyle, style)) flush();
    let text = repairEncoding(str(run, 'text'));
    if (isBroken(text) && rtfFallback !== undefined) {
      text = rtfFallback;
      bump(ctx.skipped, 'text-encoding-repaired-from-rtf');
    }
    // A run of 3+ spaces reads as a column gap, like a tab.
    const parts = text.split(/(\t| {3,})/);
    parts.forEach((part, partIndex) => {
      if (partIndex % 2 === 1) {
        flush();
        column += 1;
        cursor =
          part === '\t'
            ? nextTabStop(cursor, originX, tabStops)
            : cursor + ctx.measure(part, cellFont(style));
        return;
      }
      if (part.length === 0) return;
      if (!pendingStyle) {
        pendingX = cursor;
        pendingStyle = style;
      }
      pendingText += part;
      cursor += ctx.measure(part, cellFont(style));
    });
  });
  flush();
  return trimColumns(groupColumns(cells), ctx).map((group, index) =>
    group.map((cell) => ({ ...cell, column: index }))
  );
};

const renderTextarea = (body: Json, ctx: PageContext, id: string): string => {
  const x = num(body, 'x', 0);
  const y = num(body, 'y', 0);
  const width = num(body, 'width', 0);
  const height = num(body, 'height', 0);
  const rtf = parseRtf(str(body, 'custom-data'));
  const blocks = asArray(body['text-blocks-container'])
    .map((b) => unwrap(b))
    .filter((b): b is { kind: string; body: Json } => b?.kind === 'paragraph');

  const meta = ctx.meta.get(id);
  const transform = elementTransform(body, meta, { x, y, width, height });
  const mat = elementMatrix(body, meta, { x, y, width, height });
  const pieces: string[] = [];

  let offset = 0;
  blocks.forEach((block, index) => {
    const paragraphSize = num(block.body, 'font-size', 20);
    const lineHeight = rtf.lineHeightPx ?? paragraphSize * 1.3;
    const runs = asArray(block.body['text-list-container'])
      .map((r) => unwrap(r))
      .filter((r): r is { kind: string; body: Json } => r?.kind === 'text')
      .map((r) => r.body);

    if (runs.length === 0) {
      offset += lineHeight;
      return;
    }
    const columns = layoutParagraph(
      runs,
      paragraphSize,
      x,
      ctx,
      rtf.paragraphs[index],
      rtf.tabStopsPx
    );
    if (columns.length === 0) {
      offset += lineHeight;
      return;
    }
    const baseline = y + offset + paragraphSize * 0.8;
    const ownAttrs = `${metaAttrs(meta)}${transform ? attrs({ transform }) : ''}`;

    // Each column is its own editable object so cells drag independently.
    columns.forEach((cells, columnIndex) => {
      const first = cells[0].style;
      cells.forEach((cell) => {
        extendBounds(ctx, mat, [
          [cell.x, baseline - cell.style.size],
          [cell.x + cell.width, baseline - cell.style.size],
          [cell.x, baseline + cell.style.size * 0.3],
          [cell.x + cell.width, baseline + cell.style.size * 0.3],
        ]);
      });

      const highlights = cells
        .filter(
          (cell) =>
            cell.style.backgroundOpacity > 0 &&
            cell.style.background !== null &&
            cell.style.background.hex !== ctx.pageBackgroundHex
        )
        .map(
          (cell) =>
            `<rect${attrs({
              x: round(cell.x),
              y: round(baseline - cell.style.size * 0.8),
              width: round(cell.width),
              height: round(cell.style.size * 1.2),
              fill: cell.style.background?.hex,
              'fill-opacity':
                cell.style.backgroundOpacity < 1
                  ? round(cell.style.backgroundOpacity)
                  : undefined,
            })}/>`
        )
        .join('');

      const tspans = cells
        .map(
          (cell) =>
            `<tspan${attrs({
              x: round(cell.x),
              'font-size':
                cell.style.size !== first.size ? cell.style.size : undefined,
              'font-family':
                cell.style.family !== first.family
                  ? fontStack(cell.style.family)
                  : undefined,
              'font-weight':
                cell.style.weight !== first.weight
                  ? cell.style.weight
                  : undefined,
              fill:
                cell.style.fill?.hex !== first.fill?.hex
                  ? cell.style.fill?.hex
                  : undefined,
            })}>${xmlEscape(cell.text)}</tspan>`
        )
        .join('');

      // One id per column — ids must be unique within a page.
      const base = id ? `${id}-p${index}` : '';
      const cellId =
        base && columns.length > 1 ? `${base}-c${columnIndex}` : base;
      const text = `<text${attrs({
        'xml:space': 'preserve',
        x: round(cells[0].x),
        y: round(baseline),
        'font-family': fontStack(first.family),
        'font-size': first.size,
        'font-weight': first.weight !== 'normal' ? first.weight : undefined,
        'font-style': first.style !== 'normal' ? first.style : undefined,
        'text-decoration':
          first.decoration !== 'normal' ? first.decoration : undefined,
        fill: first.fill?.hex ?? '#000000',
        'fill-opacity':
          first.fill && first.fill.opacity < 1
            ? round(first.fill.opacity)
            : undefined,
        ...(highlights ? {} : { 'data-olf-id': cellId }),
      })}${highlights ? '' : ownAttrs}>${tspans}</text>`;

      // Highlight rects and their text must be one editable object for the editor.
      pieces.push(
        highlights
          ? `<g${attrs({ 'data-olf-id': cellId })}${ownAttrs}>${highlights}${text}</g>`
          : text
      );
    });

    offset += lineHeight;
  });

  return pieces.join('');
};

const shapeAttrs = (
  body: Json,
  ctx: PageContext,
  id: string,
  box: { x: number; y: number; width: number; height: number }
): string => {
  const meta = ctx.meta.get(id);
  const stroke = splitArgb(str(body, 'stroke'));
  const fill = splitArgb(str(body, 'fill'));
  const fillOpacity = num(body, 'fill-opacity', 1);
  const strokeOpacity = num(body, 'stroke-opacity', 1);
  const transform = elementTransform(body, meta, box);
  return (
    attrs({
      stroke: stroke?.hex,
      'stroke-width': num(body, 'stroke-width', 1),
      'stroke-opacity':
        strokeOpacity < 1
          ? round(strokeOpacity * (stroke?.opacity ?? 1))
          : undefined,
      fill: fillOpacity > 0 ? (fill?.hex ?? 'none') : 'none',
      'fill-opacity':
        fillOpacity > 0 && fillOpacity < 1 ? round(fillOpacity) : undefined,
      'data-olf-id': id,
      transform,
    }) + metaAttrs(meta)
  );
};

/** Reads the x scale out of a 3x3 `stylus-tip-transform`; 1 when absent. */
const stylusScale = (value: string): number => {
  const first = parseFloat(value.split(',')[0]);
  return Number.isFinite(first) && first > 0 ? first : 1;
};

/** Rounds to 2dp and drops consecutive duplicates (the writer repeats points). */
const compactPoints = (raw: string): string => {
  const out: string[] = [];
  let previous = '';
  for (const pair of raw.trim().split(/\s+/)) {
    const [x, y] = pair.split(',').map((p) => parseFloat(p));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const point = `${round(x)},${round(y)}`;
    if (point === previous) continue;
    out.push(point);
    previous = point;
  }
  return out.join(' ');
};

const renderStroke = (
  body: Json,
  ctx: PageContext,
  id: string,
  box: { x: number; y: number; width: number; height: number }
): string | null => {
  const points = compactPoints(str(body, 'points'));
  if (!points) {
    bump(ctx.skipped, 'stroke');
    return null;
  }
  const stroke = splitArgb(str(body, 'stroke')) ?? {
    hex: '#000000',
    opacity: 1,
  };
  const highlighter = body['is-highlighter'] === true;
  const width =
    num(body, 'pen-width', 1) * stylusScale(str(body, 'stylus-tip-transform'));
  const opacity =
    num(body, 'opacity', 1) * stroke.opacity * (highlighter ? 0.4 : 1);
  extendBounds(
    ctx,
    elementMatrix(body, ctx.meta.get(id), box),
    parsePointList(points),
    width / 2
  );
  return `<polyline${attrs({
    points,
    fill: 'none',
    stroke: stroke.hex,
    'stroke-width': round(width),
    'stroke-linecap': highlighter ? 'butt' : 'round',
    'stroke-linejoin': highlighter ? 'miter' : 'round',
    'stroke-opacity': opacity < 1 ? round(opacity) : undefined,
    'data-olf-id': id,
    transform: elementTransform(body, ctx.meta.get(id), box),
  })}${metaAttrs(ctx.meta.get(id))}/>`;
};

/** Registers (once per colour) an arrowhead marker and returns its id. */
const arrowMarker = (ctx: PageContext, hex: string): string => {
  const id = `olf-arrow-${hex.replace('#', '')}`;
  if (!ctx.markers.has(id)) {
    ctx.markers.set(
      id,
      `<marker${attrs({
        id,
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 5,
        markerHeight: 5,
        markerUnits: 'strokeWidth',
        orient: 'auto-start-reverse',
      })}><path d="M0,0 L10,5 L0,10 z"${attrs({ fill: hex })}/></marker>`
    );
  }
  return id;
};

/** `marker-start` / `marker-end` attributes for `lineshape-*: "arrow"` ends. */
const lineShapeAttrs = (body: Json, ctx: PageContext): string => {
  const hex = splitArgb(str(body, 'stroke'))?.hex ?? '#000000';
  const marker = (key: string): string | undefined =>
    str(body, key) === 'arrow' ? `url(#${arrowMarker(ctx, hex)})` : undefined;
  return attrs({
    'marker-start': marker('lineshape-start'),
    'marker-end': marker('lineshape-end'),
    'stroke-linecap': str(body, 'stroke-linecap') || undefined,
  });
};

const DEG = Math.PI / 180;

/** Pie wedge path for an ellipse with a partial `angle-start`..`angle-end` sweep. */
const pieWedge = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  end: number
): string => {
  const at = (deg: number): string =>
    `${round(cx + rx * Math.cos(deg * DEG))} ${round(cy + ry * Math.sin(deg * DEG))}`;
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${round(cx)} ${round(cy)} L ${at(start)} A ${round(rx)} ${round(ry)} 0 ${large} ${sweep} ${at(end)} Z`;
};

const renderElement = (entry: unknown, ctx: PageContext): string | null => {
  const wrapped = unwrap(entry);
  if (!wrapped) {
    bump(ctx.skipped, 'unrecognized');
    return null;
  }
  const { kind, body } = wrapped;
  const id = str(body, 'id');
  const box = {
    x: num(body, 'x', 0),
    y: num(body, 'y', 0),
    width: num(body, 'width', 0),
    height: num(body, 'height', 0),
  };

  const mat = elementMatrix(body, ctx.meta.get(id), box);
  const halfStroke = num(body, 'stroke-width', 1) / 2;

  switch (kind) {
    case 'textarea':
      return renderTextarea(body, ctx, id);
    case 'polygon':
    case 'polyline': {
      const points = str(body, 'points');
      if (!points) {
        bump(ctx.skipped, kind);
        return null;
      }
      extendBounds(ctx, mat, parsePointList(points), halfStroke);
      return `<${kind}${attrs({ points })}${shapeAttrs(body, ctx, id, box)}${
        kind === 'polyline' ? lineShapeAttrs(body, ctx) : ''
      }/>`;
    }
    case 'stroke':
      return renderStroke(body, ctx, id, box);
    case 'rect':
    case 'rectangle':
      extendBounds(ctx, mat, cornersOf(box), halfStroke);
      return `<rect${attrs({
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
        rx: body['rx'] !== undefined ? num(body, 'rx', 0) : undefined,
      })}${shapeAttrs(body, ctx, id, box)}/>`;
    case 'ellipse':
    case 'circle': {
      // cx/cy/rx/ry are authoritative; width/height are the transformed bounds.
      const cx =
        body['cx'] !== undefined ? num(body, 'cx', 0) : box.x + box.width / 2;
      const cy =
        body['cy'] !== undefined ? num(body, 'cy', 0) : box.y + box.height / 2;
      const rx = body['rx'] !== undefined ? num(body, 'rx', 0) : box.width / 2;
      const ry = body['ry'] !== undefined ? num(body, 'ry', 0) : box.height / 2;
      const start = num(body, 'angle-start', 0);
      const end = num(body, 'angle-end', 360);
      const isPie = body['is-pie'] === true && Math.abs(end - start) < 359;
      extendBounds(
        ctx,
        mat,
        cornersOf({ x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry }),
        halfStroke
      );
      if (isPie) {
        return `<path${attrs({ d: pieWedge(cx, cy, rx, ry, start, end) })}${shapeAttrs(body, ctx, id, box)}/>`;
      }
      return `<ellipse${attrs({
        cx: round(cx),
        cy: round(cy),
        rx: round(rx),
        ry: round(ry),
      })}${shapeAttrs(body, ctx, id, box)}/>`;
    }
    case 'line': {
      const x1 = num(body, 'x1', box.x);
      const y1 = num(body, 'y1', box.y);
      const x2 = num(body, 'x2', box.x + box.width);
      const y2 = num(body, 'y2', box.y + box.height);
      extendBounds(
        ctx,
        mat,
        [
          [x1, y1],
          [x2, y2],
        ],
        halfStroke
      );
      return `<line${attrs({
        x1: round(x1),
        y1: round(y1),
        x2: round(x2),
        y2: round(y2),
      })}${shapeAttrs(body, ctx, id, box)}${lineShapeAttrs(body, ctx)}/>`;
    }
    case 'path':
    case 'ink':
    case 'pen': {
      const d = str(body, 'd') || str(body, 'path');
      if (!d) {
        bump(ctx.skipped, kind);
        return null;
      }
      return `<path${attrs({ d })}${shapeAttrs(body, ctx, id, box)}/>`;
    }
    case 'image':
    case 'picture': {
      const source = str(body, 'source');
      const href = source
        ? (ctx.imageUris.get(source) ?? '')
        : str(body, 'href') || str(body, 'src') || str(body, 'data');
      if (!/^data:/i.test(href)) {
        bump(ctx.skipped, source ? 'image-missing' : kind);
        return null;
      }
      const meta = ctx.meta.get(id);
      extendBounds(ctx, mat, cornersOf(box));
      return `<image${attrs({
        href,
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
        'data-olf-id': id,
        transform: elementTransform(body, meta, box),
      })}${metaAttrs(meta)}/>`;
    }
    default:
      bump(ctx.skipped, kind);
      return null;
  }
};

const renderBackground = (
  entry: unknown,
  size: { x: number; y: number; width: number; height: number },
  ctx: PageContext
): { markup: string; hex: string | null } => {
  const wrapped = unwrap(entry);
  if (!wrapped || wrapped.kind !== 'background') {
    bump(ctx.skipped, 'background');
    return { markup: '', hex: null };
  }
  const body = wrapped.body;
  const type = str(body, 'type');
  const opacity = num(body, 'opacity', 1);
  if (type === 'color') {
    const fill = splitArgb(str(body, 'fill'));
    if (!fill) {
      bump(ctx.skipped, 'background-color');
      return { markup: '', hex: null };
    }
    return {
      hex: fill.hex,
      markup: `<rect${attrs({
        x: size.x,
        y: size.y,
        width: size.width,
        height: size.height,
        fill: fill.hex,
        opacity: opacity < 1 ? round(opacity) : undefined,
      })}/>`,
    };
  }
  if (type === 'image') {
    const href = str(body, 'href') || str(body, 'src') || str(body, 'data');
    if (/^data:/i.test(href)) {
      return {
        hex: null,
        markup: `<image${attrs({
          href,
          x: size.x,
          y: size.y,
          width: size.width,
          height: size.height,
          preserveAspectRatio: 'xMidYMid slice',
          opacity: opacity < 1 ? round(opacity) : undefined,
        })}/>`,
      };
    }
    bump(ctx.skipped, 'background-image');
    return { markup: '', hex: null };
  }
  bump(ctx.skipped, `background-${type || 'unknown'}`);
  return { markup: '', hex: null };
};

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

/** Finds a zip entry by exact path, then case-insensitively, then by basename. */
const findZipEntry = (zip: JSZip, source: string): JSZip.JSZipObject | null => {
  const direct = zip.file(source);
  if (direct) return direct;
  const wanted = source.toLowerCase().replace(/^\.?\//, '');
  const base = wanted.split('/').pop() ?? wanted;
  let byBase: JSZip.JSZipObject | null = null;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const lower = name.toLowerCase();
    if (lower === wanted) return entry;
    if (!byBase && (lower.split('/').pop() ?? lower) === base) byBase = entry;
  }
  return byBase;
};

const stripExtension = (name: string): string =>
  name.replace(/\.[^./\\]+$/, '');

export const convertOlfToBundle = async (
  file: File | Blob,
  options: OlfConvertOptions = {}
): Promise<OlfConvertResult> => {
  const measure = options.measureText ?? canvasMeasure();
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];

  const zip = await new JSZip().loadAsync(file);
  const contentEntry =
    zip.file('content.json') ?? zip.file(/(^|\/)content\.json$/i)[0] ?? null;
  if (!contentEntry) {
    throw new Error('No content.json found in this .olf file.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await contentEntry.async('string'));
  } catch {
    throw new Error('content.json in this .olf file is not valid JSON.');
  }

  const olf = asObject(asObject(parsed)?.['olf']) ?? asObject(parsed);
  if (!olf) throw new Error('Unrecognized .olf structure.');

  const docWidth = num(olf, 'width', 1920);
  const docHeight = num(olf, 'height', 1080);
  const docBox = parseViewbox(str(olf, 'viewbox')) ?? {
    width: docWidth,
    height: docHeight,
  };

  const meta = new Map<string, ElementMeta>();
  for (const entry of asArray(olf['additional'])) {
    const wrapped = unwrap(entry);
    if (wrapped?.kind !== 'element') continue;
    const ref = str(wrapped.body, 'ref');
    if (!ref) continue;
    meta.set(ref, {
      locked: wrapped.body['is-locked'] === true,
      moveLocked: wrapped.body['is-moveable-locked'] === true,
      flip: str(wrapped.body, 'flip'),
    });
  }

  const pages = asArray(olf['pageset'])
    .map((p) => unwrap(p))
    .filter((p): p is { kind: string; body: Json } => p?.kind === 'page')
    .map((p) => p.body);
  if (pages.length === 0) {
    throw new Error('This .olf file contains no pages.');
  }

  const groupCount = asArray(olf['groups']).length;
  if (groupCount > 0) {
    warnings.push(
      `${groupCount} group(s) could not be reconstructed; their members were kept ungrouped.`
    );
  }

  // Resolve every referenced image once, up front, so a source reused across
  // pages is read and optimized a single time.
  const optimizeImage = options.optimizeImage ?? canvasOptimizeImage;
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const imageUris = new Map<string, string>();
  const sources = new Map<string, string>();
  for (const page of pages) {
    for (const entry of asArray(page['elements'])) {
      const wrapped = unwrap(entry);
      if (
        !wrapped ||
        (wrapped.kind !== 'image' && wrapped.kind !== 'picture')
      ) {
        continue;
      }
      const source = str(wrapped.body, 'source');
      if (source && !sources.has(source)) {
        sources.set(source, str(wrapped.body, 'mime-type'));
      }
    }
  }
  for (const [source, declaredMime] of sources) {
    const entry = findZipEntry(zip, source);
    if (!entry) continue;
    const ext = /\.([a-z0-9]+)$/i.exec(source)?.[1]?.toLowerCase() ?? '';
    const mime = declaredMime || MIME_BY_EXT[ext] || 'image/png';
    const bytes = await entry.async('uint8array');
    imageUris.set(source, await optimizeImage(bytes, mime, maxEdge, quality));
  }

  const out = new JSZip();
  const manifestPages: { file: string; width: number; height: number }[] = [];
  const pageOrigins: { x: number; y: number }[] = [];
  const hiddenPages: number[] = [];
  const elementBoxes = new Map<string, { page: number } & Json>();

  pages.forEach((page, index) => {
    const size = parseViewbox(str(page, 'viewbox')) ?? docBox;
    const width = Math.round(size.width);
    const height = Math.round(size.height);
    if (page['is-hidden'] === true) hiddenPages.push(index);

    const ctx: PageContext = {
      skipped,
      warnings,
      meta,
      measure,
      pageBackgroundHex: null,
      imageUris,
      markers: new Map(),
      bounds: null,
    };

    // Peeked up front so text can drop highlights matching the page colour.
    for (const entry of asArray(page['backgrounds'])) {
      const wrapped = unwrap(entry);
      if (
        wrapped?.kind !== 'background' ||
        str(wrapped.body, 'type') !== 'color'
      ) {
        continue;
      }
      const hex = splitArgb(str(wrapped.body, 'fill'))?.hex;
      if (hex) ctx.pageBackgroundHex = hex;
    }

    const elements = asArray(page['elements']);
    elements.forEach((entry) => {
      const wrapped = unwrap(entry);
      if (wrapped && str(wrapped.body, 'id')) {
        elementBoxes.set(str(wrapped.body, 'id'), {
          page: index,
          ...wrapped.body,
        });
      }
    });
    const foreground = elements
      .map((entry) => renderElement(entry, ctx))
      .filter((markup): markup is string => markup !== null)
      .join('');

    // The page `matrix` is myViewBoard's saved camera, not a content transform.
    const b = ctx.bounds;
    const x0 = b && b.minX < 0 ? Math.round(b.minX) - PAGE_PADDING : 0;
    const y0 = b && b.minY < 0 ? Math.round(b.minY) - PAGE_PADDING : 0;
    const x1 = b && b.maxX > width ? Math.round(b.maxX) + PAGE_PADDING : width;
    const y1 =
      b && b.maxY > height ? Math.round(b.maxY) + PAGE_PADDING : height;
    const pageWidth = x1 - x0;
    const pageHeight = y1 - y0;

    const backgroundMarkup = asArray(page['backgrounds'])
      .map(
        (bg) =>
          renderBackground(
            bg,
            { x: x0, y: y0, width: pageWidth, height: pageHeight },
            ctx
          ).markup
      )
      .join('');

    const svg = ensureSvgNamespaces(
      `<svg${attrs({
        width: pageWidth,
        height: pageHeight,
        viewBox: `${x0} ${y0} ${pageWidth} ${pageHeight}`,
      })}>` +
        (ctx.markers.size > 0
          ? `<defs>${[...ctx.markers.values()].join('')}</defs>`
          : '') +
        `<g class="background">${backgroundMarkup}</g>` +
        `<g class="foreground">${foreground}</g>` +
        `</svg>`
    );

    const outName = `pages/${index}.svg`;
    out.file(outName, svg);
    pageOrigins.push({ x: x0, y: y0 });
    manifestPages.push({ file: outName, width: pageWidth, height: pageHeight });
    options.onProgress?.(index + 1, pages.length);
  });

  const pageIdToIndex = new Map<string, number>();
  pages.forEach((page, index) => {
    const id = str(page, 'id');
    if (id) pageIdToIndex.set(id, index);
  });

  const objectLinks: NotebookObjectLink[] = [];
  for (const entry of asArray(olf['links'])) {
    const wrapped = unwrap(entry);
    if (!wrapped) continue;
    const body = wrapped.body;
    const ref = str(body, 'ref');
    const targetId =
      str(body, 'target-page') || str(body, 'page') || str(body, 'target');
    const source = ref ? elementBoxes.get(ref) : undefined;
    const targetPage = pageIdToIndex.get(targetId);
    const sourcePage = source?.page;
    const dims =
      sourcePage !== undefined ? manifestPages[sourcePage] : undefined;
    const origin =
      sourcePage !== undefined ? pageOrigins[sourcePage] : { x: 0, y: 0 };
    if (
      !source ||
      sourcePage === undefined ||
      targetPage === undefined ||
      !dims ||
      targetPage === sourcePage
    ) {
      bump(skipped, 'link');
      continue;
    }
    const w = num(source, 'width', 0);
    const h = num(source, 'height', 0);
    if (w <= 0 || h <= 0) {
      bump(skipped, 'link');
      continue;
    }
    objectLinks.push({
      id: `link-${ref}`,
      objectId: `link-${ref}`,
      sourcePage,
      targetPage,
      xFrac: (num(source, 'x', 0) - origin.x) / dims.width,
      yFrac: (num(source, 'y', 0) - origin.y) / dims.height,
      wFrac: w / dims.width,
      hFrac: h / dims.height,
    });
  }

  const title =
    stripExtension(
      (file as File).name ?? str(asObject(olf['meta']) ?? {}, 'description')
    ) || 'Untitled';

  const manifest: OlfBundleManifest = {
    version: 1,
    title,
    pageCount: manifestPages.length,
    pages: manifestPages,
    sections: [],
    ...(hiddenPages.length > 0
      ? { hiddenPages: Array.from(new Set(hiddenPages)).sort((a, b) => a - b) }
      : {}),
    ...(objectLinks.length > 0 ? { objectLinks } : {}),
  };
  out.file('manifest.json', JSON.stringify(manifest, null, 2));

  const blob = await out.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });

  return {
    blob,
    title,
    pageCount: manifestPages.length,
    hiddenPageCount: hiddenPages.length,
    skipped,
    warnings,
  };
};

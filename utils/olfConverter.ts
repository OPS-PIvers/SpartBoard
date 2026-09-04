import JSZip from 'jszip';
import { NotebookObjectLink } from '@/types';
import { ensureSvgNamespaces } from './smartNotebook';

/**
 * ViewSonic myViewBoard `.olf` -> SpartBoard `.spartnb` converter.
 *
 * An `.olf` is a zip holding a single `content.json` describing pages, their
 * elements (textareas, polygons, shapes) and backgrounds. There is no public
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
  const parts = value
    .split(',')
    .map((p) => parseFloat(p.trim()))
    .filter((p) => Number.isFinite(p));
  if (parts.length !== 9) return null;
  if (parts.every((p, idx) => Math.abs(p - IDENTITY[idx]) < 1e-9)) return null;
  const [a, b, c, d, e, f] = parts;
  return `matrix(${a} ${d} ${b} ${e} ${c} ${f})`;
};

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
}

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

/** Splits a paragraph's runs into tab-delimited, absolutely positioned cells. */
const layoutParagraph = (
  runs: Json[],
  paragraphSize: number,
  originX: number,
  ctx: PageContext,
  rtfFallback: string | undefined,
  tabStops: number[]
): Cell[] => {
  const cells: Cell[] = [];
  let cursor = originX;
  let pendingX = originX;
  let pendingText = '';
  let pendingStyle: RunStyle | null = null;

  const flush = (): void => {
    if (pendingText.length > 0 && pendingStyle) {
      const style = pendingStyle;
      const width = ctx.measure(
        pendingText,
        fontCss(style.size, style.family, style.weight, style.style)
      );
      cells.push({ x: pendingX, width, text: pendingText, style });
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
    a.fill?.hex === b.fill?.hex;

  runs.forEach((run) => {
    const style = readRunStyle(run, paragraphSize);
    if (pendingStyle && !sameStyle(pendingStyle, style)) flush();
    let text = repairEncoding(str(run, 'text'));
    if (isBroken(text) && rtfFallback !== undefined) {
      text = rtfFallback;
      bump(ctx.skipped, 'text-encoding-repaired-from-rtf');
    }
    const segments = text.split('\t');
    segments.forEach((segment, segIndex) => {
      if (segIndex > 0) {
        flush();
        cursor = nextTabStop(cursor, originX, tabStops);
      }
      if (segment.length === 0) return;
      if (!pendingStyle) {
        pendingX = cursor;
        pendingStyle = style;
      }
      pendingText += segment;
      cursor += ctx.measure(
        segment,
        fontCss(style.size, style.family, style.weight, style.style)
      );
    });
  });
  flush();
  return cells;
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
    const cells = layoutParagraph(
      runs,
      paragraphSize,
      x,
      ctx,
      rtf.paragraphs[index],
      rtf.tabStopsPx
    );
    if (cells.length === 0) {
      offset += lineHeight;
      return;
    }
    const baseline = y + offset + paragraphSize * 0.8;
    const first = cells[0].style;

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

    // One id per paragraph — ids must be unique within a page.
    const paragraphId = id ? `${id}-p${index}` : '';
    const ownAttrs = `${metaAttrs(meta)}${transform ? attrs({ transform }) : ''}`;
    const text = `<text${attrs({
      'xml:space': 'preserve',
      x: round(x),
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
      ...(highlights ? {} : { 'data-olf-id': paragraphId }),
    })}${highlights ? '' : ownAttrs}>${tspans}</text>`;

    // Highlight rects and their text must be one editable object for the editor.
    pieces.push(
      highlights
        ? `<g${attrs({ 'data-olf-id': paragraphId })}${ownAttrs}>${highlights}${text}</g>`
        : text
    );
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
      return `<${kind}${attrs({ points })}${shapeAttrs(body, ctx, id, box)}/>`;
    }
    case 'rect':
    case 'rectangle':
      return `<rect${attrs({
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
        rx: body['rx'] !== undefined ? num(body, 'rx', 0) : undefined,
      })}${shapeAttrs(body, ctx, id, box)}/>`;
    case 'ellipse':
    case 'circle':
      return `<ellipse${attrs({
        cx: round(box.x + box.width / 2),
        cy: round(box.y + box.height / 2),
        rx: round(box.width / 2),
        ry: round(box.height / 2),
      })}${shapeAttrs(body, ctx, id, box)}/>`;
    case 'line':
      return `<line${attrs({
        x1: round(num(body, 'x1', box.x)),
        y1: round(num(body, 'y1', box.y)),
        x2: round(num(body, 'x2', box.x + box.width)),
        y2: round(num(body, 'y2', box.y + box.height)),
      })}${shapeAttrs(body, ctx, id, box)}/>`;
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
      const href = str(body, 'href') || str(body, 'src') || str(body, 'data');
      if (!/^data:/i.test(href)) {
        bump(ctx.skipped, kind);
        return null;
      }
      const meta = ctx.meta.get(id);
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
  size: { width: number; height: number },
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
        x: 0,
        y: 0,
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
          x: 0,
          y: 0,
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

  const out = new JSZip();
  const manifestPages: { file: string; width: number; height: number }[] = [];
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
    };

    const backgroundMarkup = asArray(page['backgrounds'])
      .map((b) => {
        const rendered = renderBackground(b, { width, height }, ctx);
        if (rendered.hex) ctx.pageBackgroundHex = rendered.hex;
        return rendered.markup;
      })
      .join('');

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

    const pageTransform = matrixToSvg(str(page, 'matrix'));
    const svg = ensureSvgNamespaces(
      `<svg${attrs({
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
      })}>` +
        `<g class="background">${backgroundMarkup}</g>` +
        `<g class="foreground"${pageTransform ? attrs({ transform: pageTransform }) : ''}>${foreground}</g>` +
        `</svg>`
    );

    const outName = `pages/${index}.svg`;
    out.file(outName, svg);
    manifestPages.push({ file: outName, width, height });
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
      xFrac: num(source, 'x', 0) / dims.width,
      yFrac: num(source, 'y', 0) / dims.height,
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

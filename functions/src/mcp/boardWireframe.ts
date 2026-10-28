import { deflateSync } from 'zlib';
import { LABEL_FONT_DATA, TITLE_FONT_DATA } from './wireframeFont';

// Server-drawn board wireframe (AI_BOARDS.md D6): labelled widget boxes, shaded app chrome, hatched overlaps.

export interface WireframeScreen {
  w: number;
  h: number;
}

export type WireframeRectKind = 'widget' | 'slot';

export interface WireframeRect {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: WireframeRectKind;
}

export interface WireframeBand {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WireframeInput {
  name: string;
  screen: WireframeScreen;
  rects: readonly WireframeRect[];
  bands?: readonly WireframeBand[];
}

export interface WireframeImage {
  png: Buffer;
  width: number;
  height: number;
  overlapCount: number;
  chromeCollisionCount: number;
}

export const WIREFRAME_WIDTH = 1200;
export const WIREFRAME_MAX_RECTS = 200;
const DEFAULT_SCREEN: WireframeScreen = { w: 1920, h: 1080 };
const MARGIN = 16;
const HEADER_H = 40;
const FOOTER_H = 36;
const MAX_ASPECT = 2;
const LABEL_PAD = 6;

type Rgb = readonly [number, number, number];
const PAGE_BG: Rgb = [248, 250, 252];
const BOARD_BG: Rgb = [255, 255, 255];
const BOARD_BORDER: Rgb = [100, 116, 139];
const BAND_FILL: Rgb = [226, 232, 240];
const BAND_TEXT: Rgb = [71, 85, 105];
const WIDGET_FILL: Rgb = [219, 234, 254];
const WIDGET_BORDER: Rgb = [29, 78, 216];
const SLOT_FILL: Rgb = [241, 245, 249];
const SLOT_BORDER: Rgb = [100, 116, 139];
const TEXT: Rgb = [15, 23, 42];
const LABEL_BG: Rgb = [255, 255, 255];
const HATCH: Rgb = [220, 38, 38];

interface Glyph {
  advance: number;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: Uint8Array;
}

interface Font {
  ascent: number;
  descent: number;
  glyphs: Map<string, Glyph>;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const parseFont = (data: string): Font => {
  const [ascent, descent, records] = data.split('|');
  const glyphs = new Map<string, Glyph>();
  for (const record of records.split(';')) {
    const [code, advance, x, y, w, h, hex] = record.split(',');
    const alpha = new Uint8Array(hex.length);
    for (let i = 0; i < hex.length; i++) {
      alpha[i] = parseInt(hex[i], 16) * 17;
    }
    glyphs.set(String.fromCodePoint(Number(code)), {
      advance: Number(advance),
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
      alpha,
    });
  }
  return { ascent: Number(ascent), descent: Number(descent), glyphs };
};

let fonts: { label: Font; title: Font } | null = null;
const getFonts = () => {
  fonts ??= {
    label: parseFont(LABEL_FONT_DATA),
    title: parseFont(TITLE_FONT_DATA),
  };
  return fonts;
};

const PUNCTUATION: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '×': 'x',
  '•': '·',
};

const normalizeText = (text: string, font: Font): string => {
  const plain = String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  let out = '';
  for (const ch of plain) {
    const mapped = PUNCTUATION[ch] ?? ch;
    out += font.glyphs.has(mapped) ? mapped : '?';
  }
  return out;
};

const measure = (text: string, font: Font): number => {
  let width = 0;
  for (const ch of text) width += font.glyphs.get(ch)?.advance ?? 0;
  return width;
};

/** Normalises text to the font's characters and truncates it with an ellipsis to fit maxWidth. */
export const fitText = (
  text: string,
  maxWidth: number,
  which: 'label' | 'title' = 'label'
): string => {
  const font = getFonts()[which];
  const clean = normalizeText(text, font);
  if (measure(clean, font) <= maxWidth) return clean;
  const ellipsisWidth = font.glyphs.get('…')?.advance ?? 0;
  if (ellipsisWidth > maxWidth) return '';
  const chars = Array.from(clean);
  let width = ellipsisWidth;
  let out = '';
  for (const ch of chars) {
    const advance = font.glyphs.get(ch)?.advance ?? 0;
    if (width + advance > maxWidth) break;
    width += advance;
    out += ch;
  }
  return out.trimEnd() + '…';
};

const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const resolveScreen = (screen: WireframeScreen | undefined) => {
  if (!screen || !finite(screen.w) || !finite(screen.h)) return DEFAULT_SCREEN;
  const w = Math.min(Math.max(screen.w, 320), 10000);
  const h = Math.min(Math.max(screen.h, 200), 10000, w * MAX_ASPECT);
  return { w, h };
};

const intersect = (a: Box, b: Box): Box | null => {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
};

class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    bg: Rgb
  ) {
    this.pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < this.pixels.length; i += 3) {
      this.pixels[i] = bg[0];
      this.pixels[i + 1] = bg[1];
      this.pixels[i + 2] = bg[2];
    }
  }

  private set(x: number, y: number, c: Rgb, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    if (alpha >= 255) {
      this.pixels[i] = c[0];
      this.pixels[i + 1] = c[1];
      this.pixels[i + 2] = c[2];
      return;
    }
    const inv = 255 - alpha;
    this.pixels[i] = (c[0] * alpha + this.pixels[i] * inv + 127) / 255;
    this.pixels[i + 1] = (c[1] * alpha + this.pixels[i + 1] * inv + 127) / 255;
    this.pixels[i + 2] = (c[2] * alpha + this.pixels[i + 2] * inv + 127) / 255;
  }

  fill(b: Box, c: Rgb) {
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) this.set(x, y, c);
    }
  }

  stroke(b: Box, c: Rgb, thickness: number, dash = 0) {
    const on = (i: number) => dash === 0 || Math.floor(i / dash) % 2 === 0;
    for (let t = 0; t < thickness; t++) {
      for (let x = b.x0; x < b.x1; x++) {
        if (!on(x - b.x0)) continue;
        this.set(x, b.y0 + t, c);
        this.set(x, b.y1 - 1 - t, c);
      }
      for (let y = b.y0; y < b.y1; y++) {
        if (!on(y - b.y0)) continue;
        this.set(b.x0 + t, y, c);
        this.set(b.x1 - 1 - t, y, c);
      }
    }
  }

  hatch(b: Box, c: Rgb) {
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        if ((x + y) % 10 < 3) this.set(x, y, c);
      }
    }
  }

  text(text: string, font: Font, x: number, baseline: number, c: Rgb) {
    let pen = x;
    for (const ch of text) {
      const g = font.glyphs.get(ch);
      if (!g) continue;
      for (let gy = 0; gy < g.h; gy++) {
        for (let gx = 0; gx < g.w; gx++) {
          const a = g.alpha[gy * g.w + gx];
          if (a) this.set(pen + g.x + gx, baseline + g.y + gy, c, a);
        }
      }
      pen += g.advance;
    }
  }

  /** Draws text truncated to fit inside the box, on a white chip, top-left aligned. */
  label(
    text: string,
    which: 'label' | 'title',
    b: Box,
    c: Rgb,
    chip: Rgb | null
  ) {
    const font = getFonts()[which];
    const maxWidth = b.x1 - b.x0 - LABEL_PAD * 2;
    const lineH = font.ascent + font.descent;
    if (maxWidth <= 0 || b.y1 - b.y0 < lineH + 4) return;
    const fitted = fitText(text, maxWidth, which);
    if (!fitted) return;
    const x = b.x0 + LABEL_PAD;
    const top =
      b.y0 + Math.min(LABEL_PAD, Math.floor((b.y1 - b.y0 - lineH) / 2));
    if (chip) {
      this.fill(
        {
          x0: x - 3,
          y0: top,
          x1: Math.min(x + measure(fitted, font) + 3, b.x1 - 2),
          y1: top + lineH,
        },
        chip
      );
    }
    this.text(fitted, font, x, top + font.ascent, c);
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const encodePng = (canvas: Canvas): Buffer => {
  const { width, height, pixels } = canvas;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(
      pixels.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** Renders the board as a PNG about 1200px wide; rects and bands are in screen pixels. */
export const renderBoardWireframe = (input: WireframeInput): WireframeImage => {
  const labelFont = getFonts().label;
  const screen = resolveScreen(input.screen);
  const boardW = WIREFRAME_WIDTH - MARGIN * 2;
  const scale = boardW / screen.w;
  const boardH = Math.round(screen.h * scale);
  const height = HEADER_H + boardH + FOOTER_H;
  const canvas = new Canvas(WIREFRAME_WIDTH, height, PAGE_BG);
  const board: Box = {
    x0: MARGIN,
    y0: HEADER_H,
    x1: MARGIN + boardW,
    y1: HEADER_H + boardH,
  };

  const toBox = (r: { x: number; y: number; w: number; h: number }) => {
    if (![r.x, r.y, r.w, r.h].every(finite) || r.w <= 0 || r.h <= 0)
      return null;
    return intersect(board, {
      x0: board.x0 + Math.round(r.x * scale),
      y0: board.y0 + Math.round(r.y * scale),
      x1: board.x0 + Math.round((r.x + r.w) * scale),
      y1: board.y0 + Math.round((r.y + r.h) * scale),
    });
  };

  const title = `${String(input.name ?? '').trim() || 'Untitled board'} (${Math.round(screen.w)} x ${Math.round(screen.h)})`;
  canvas.label(
    title,
    'title',
    {
      x0: MARGIN - LABEL_PAD,
      y0: 6,
      x1: WIREFRAME_WIDTH - MARGIN,
      y1: HEADER_H,
    },
    TEXT,
    null
  );

  canvas.fill(board, BOARD_BG);

  const bands = (input.bands ?? [])
    .slice(0, WIREFRAME_MAX_RECTS)
    .flatMap((b) => {
      const box = toBox(b);
      return box ? [{ box, label: b.label }] : [];
    });
  for (const band of bands) canvas.fill(band.box, BAND_FILL);
  for (const band of bands)
    canvas.label(band.label, 'label', band.box, BAND_TEXT, null);

  const rects = (input.rects ?? [])
    .slice(0, WIREFRAME_MAX_RECTS)
    .flatMap((r) => {
      const box = toBox(r);
      return box ? [{ box, label: r.label, kind: r.kind ?? 'widget' }] : [];
    });
  for (const r of rects) {
    const slot = r.kind === 'slot';
    canvas.fill(r.box, slot ? SLOT_FILL : WIDGET_FILL);
    canvas.stroke(r.box, slot ? SLOT_BORDER : WIDGET_BORDER, 2, slot ? 8 : 0);
  }

  let overlapCount = 0;
  let chromeCollisionCount = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const hit = intersect(rects[i].box, rects[j].box);
      if (hit) {
        overlapCount++;
        canvas.hatch(hit, HATCH);
      }
    }
    for (const band of bands) {
      const hit = intersect(rects[i].box, band.box);
      if (hit) {
        chromeCollisionCount++;
        canvas.hatch(hit, HATCH);
      }
    }
  }

  for (const r of rects) canvas.label(r.label, 'label', r.box, TEXT, LABEL_BG);
  canvas.stroke(board, BOARD_BORDER, 1);

  const legendY = board.y1 + 10;
  const swatch = 16;
  let x = MARGIN;
  const legendItem = (draw: (b: Box) => void, text: string) => {
    const b = { x0: x, y0: legendY, x1: x + swatch, y1: legendY + swatch };
    draw(b);
    x = b.x1 + 6;
    canvas.text(
      normalizeText(text, labelFont),
      labelFont,
      x,
      legendY + 13,
      BAND_TEXT
    );
    x += measure(normalizeText(text, labelFont), labelFont) + 20;
  };
  legendItem((b) => {
    canvas.fill(b, WIDGET_FILL);
    canvas.stroke(b, WIDGET_BORDER, 2);
  }, 'Widget');
  legendItem((b) => {
    canvas.fill(b, SLOT_FILL);
    canvas.stroke(b, SLOT_BORDER, 2, 4);
  }, 'Empty slot');
  legendItem((b) => canvas.fill(b, BAND_FILL), 'App controls (keep clear)');
  legendItem((b) => {
    canvas.fill(b, BOARD_BG);
    canvas.hatch(b, HATCH);
  }, 'Overlap');

  return {
    png: encodePng(canvas),
    width: WIREFRAME_WIDTH,
    height,
    overlapCount,
    chromeCollisionCount,
  };
};

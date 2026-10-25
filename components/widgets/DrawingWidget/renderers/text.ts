import { DrawableObject, TextObject } from '@/types';

// Pure Canvas 2D renderer for TextObject. Wrapped in save/restore so font /
// fillStyle / textBaseline never leak into other objects in the dispatcher
// render loop. Multi-line content is split on '\n' and laid out by advancing
// y by `fontSize * 1.2` (a standard line-height ratio) per line. When
// `obj.wrap` is set (a resize handle fixed the width) each line is further
// word-wrapped to `obj.w`.
//
// Rotation: when `obj.rotation` is non-zero, the canvas is rotated around
// the bbox center BEFORE the per-line `fillText` calls so the entire text
// block rotates together (rather than each line rotating around its own
// baseline).
//
// Known limitation: `TextEditorOverlay` is intentionally NOT rotation-aware —
// it positions the contenteditable with `left`/`top` only, so editing a
// rotated `TextObject` opens the editor at the object's unrotated top-left
// (the world-coord anchor), not at its visual rotated position. The persisted
// draw still rotates correctly on commit.

export const LINE_HEIGHT_RATIO = 1.2;

// Horizontal padding mirrors the editor's `px-1` so canvas and editor agree.
export const TEXT_PAD_X = 4;

let measureCtx: CanvasRenderingContext2D | null | undefined;
const getMeasureCtx = (): CanvasRenderingContext2D | null => {
  if (measureCtx !== undefined) return measureCtx;
  measureCtx =
    typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d');
  return measureCtx;
};

const measureWidth = (
  ctx: CanvasRenderingContext2D | null,
  text: string,
  fontSize: number
): number =>
  // jsdom/SSR fallback: average glyph width approximation.
  typeof ctx?.measureText === 'function'
    ? ctx.measureText(text).width
    : text.length * fontSize * 0.55;

const wrapLine = (
  ctx: CanvasRenderingContext2D | null,
  line: string,
  maxWidth: number,
  fontSize: number
): string[] => {
  if (maxWidth <= 0) return [line];
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureWidth(ctx, candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
    } else {
      out.push(current);
      current = word;
    }
  }
  out.push(current);
  return out;
};

/** Lines as they will be painted, honoring hard breaks and `wrap`. */
export const layoutTextLines = (
  ctx: CanvasRenderingContext2D | null,
  obj: TextObject
): string[] => {
  const hard = obj.content.split('\n');
  if (!obj.wrap) return hard;
  const maxWidth = obj.w - TEXT_PAD_X * 2;
  return hard.flatMap((line) => wrapLine(ctx, line, maxWidth, obj.fontSize));
};

/** Natural size of the object's laid-out text (w is content width, not `obj.w`). */
export const measureTextObject = (
  obj: TextObject
): { w: number; h: number } => {
  const ctx = getMeasureCtx();
  if (ctx) ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
  const lines = layoutTextLines(ctx, obj);
  const widest = lines.reduce(
    (max, l) => Math.max(max, measureWidth(ctx, l, obj.fontSize)),
    0
  );
  return {
    w: Math.ceil(widest + TEXT_PAD_X * 2),
    h: Math.ceil(lines.length * obj.fontSize * LINE_HEIGHT_RATIO),
  };
};

// A handle-driven width change flips a text box into wrap mode and lets its
// height follow the wrapped content.
export const applyTextWrapOnResize = (
  next: DrawableObject,
  before: DrawableObject
): DrawableObject => {
  if (next.kind !== 'text' || before.kind !== 'text') return next;
  // A sticky keeps the size it was dragged to; its text refits instead.
  if (next.sticky) return next;
  if (next.w === before.w) return next;
  const wrapped: TextObject = { ...next, wrap: true };
  return { ...wrapped, h: measureTextObject(wrapped).h };
};

export const STICKY_SIZE = 180;
export const STICKY_PAD = 12;
const STICKY_MIN_FONT = 10;

/** The sticky's text box inside its padding, as a wrapping TextObject. */
const stickyInner = (obj: TextObject, fontSize: number): TextObject => ({
  ...obj,
  x: obj.x + STICKY_PAD - TEXT_PAD_X,
  y: obj.y + STICKY_PAD,
  w: Math.max(1, obj.w - (STICKY_PAD - TEXT_PAD_X) * 2),
  h: Math.max(1, obj.h - STICKY_PAD * 2),
  fontSize,
  wrap: true,
});

const fitCache = new Map<string, number>();

/** Largest font size, up to the note's own, at which the text fits; cached so drags don't re-measure. */
export const fitStickyFontSize = (obj: TextObject): number => {
  // Font load state is in the key so a fallback-font fit is re-measured once Lexend arrives.
  const fonts = typeof document === 'undefined' ? '' : document.fonts?.status;
  const key = `${fonts}|${obj.w}|${obj.h}|${obj.fontSize}|${obj.fontFamily}|${obj.content}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;
  const size = measureStickyFontSize(obj);
  if (fitCache.size > 500) fitCache.clear();
  fitCache.set(key, size);
  return size;
};

const measureStickyFontSize = (obj: TextObject): number => {
  const innerH = obj.h - STICKY_PAD * 2;
  // Capped so a corrupt font size can't spin this loop.
  const start = Math.min(Math.floor(obj.fontSize), 400);
  for (let size = start; size > STICKY_MIN_FONT; size -= 1) {
    const inner = stickyInner(obj, size);
    const m = measureTextObject(inner);
    if (m.h <= innerH && m.w <= inner.w + 1) return size;
  }
  return STICKY_MIN_FONT;
};

const renderSticky = (
  ctx: CanvasRenderingContext2D,
  obj: TextObject,
  fill: string
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const rot = obj.rotation ?? 0;
  if (Number.isFinite(rot) && rot !== 0) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
  }
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = fill;
  ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
  ctx.restore();
  if (obj.content === '') return;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  // Text that still overflows at the smallest size stays inside the note.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Number.isFinite(rot) ? rot : 0);
  ctx.beginPath();
  ctx.rect(-obj.w / 2, -obj.h / 2, obj.w, obj.h);
  ctx.clip();
  ctx.rotate(Number.isFinite(rot) ? -rot : 0);
  ctx.translate(-cx, -cy);
  renderPlainText(ctx, stickyInner(obj, fitStickyFontSize(obj)), {
    x: cx,
    y: cy,
  });
  ctx.restore();
};

export const renderText = (
  ctx: CanvasRenderingContext2D,
  obj: TextObject
): void => {
  if (obj.sticky) {
    renderSticky(ctx, obj, obj.sticky.fill);
    return;
  }
  renderPlainText(ctx, obj);
};

const renderPlainText = (
  ctx: CanvasRenderingContext2D,
  obj: TextObject,
  pivot?: { x: number; y: number }
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
  ctx.fillStyle = obj.color;
  ctx.textBaseline = 'alphabetic';

  // Rotation pivots around the bbox center.
  const rot = obj.rotation ?? 0;
  if (Number.isFinite(rot) && rot !== 0) {
    const cx = pivot?.x ?? obj.x + obj.w / 2;
    const cy = pivot?.y ?? obj.y + obj.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
  }

  // First baseline sits one full font-size below the top of the bbox so the
  // glyph caps land roughly at the top edge of the object — matches what the
  // contenteditable overlay shows during editing.
  const lineHeight = obj.fontSize * LINE_HEIGHT_RATIO;
  const lines = layoutTextLines(ctx, obj);
  lines.forEach((line, i) => {
    const baselineY = obj.y + obj.fontSize + i * lineHeight;
    ctx.fillText(line, obj.x + TEXT_PAD_X, baselineY);
  });
  ctx.restore();
};

import type { WebTourLocator } from '@/types';

export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Mirrors the recorder's crop (extension/src/recorder/geometry.ts cropRect).
const MARGIN_PX = 200;
const MIN_CROP = { w: 640, h: 360 };
/** The recorder keeps no viewport size, so the stage assumes a common laptop one. */
export const ASSUMED_VIEWPORT = { w: 1440, h: 900 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Where the step's target sits in its picture, as 0-1 fractions; null when the recording kept no box. */
export function targetInPicture(
  locator: Pick<WebTourLocator, 'box'> | undefined,
  viewport = ASSUMED_VIEWPORT
): FracRect | null {
  const box = locator?.box;
  if (!box || box.w <= 0 || box.h <= 0) return null;
  const t = {
    x: box.x * viewport.w,
    y: box.y * viewport.h,
    w: box.w * viewport.w,
    h: box.h * viewport.h,
  };
  const cw = Math.min(Math.max(t.w + 2 * MARGIN_PX, MIN_CROP.w), viewport.w);
  const ch = Math.min(Math.max(t.h + 2 * MARGIN_PX, MIN_CROP.h), viewport.h);
  const cx = clamp(t.x + t.w / 2 - cw / 2, 0, viewport.w - cw);
  const cy = clamp(t.y + t.h / 2 - ch / 2, 0, viewport.h - ch);
  const x = clamp((t.x - cx) / cw, 0, 1);
  const y = clamp((t.y - cy) / ch, 0, 1);
  return {
    x,
    y,
    w: clamp(t.w / cw, 0, 1 - x),
    h: clamp(t.h / ch, 0, 1 - y),
  };
}

const TIP_W = 320;
const GUTTER = 12;

export interface TipPlace {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
}

// Mirrors the extension overlay's placeTip: below the target when it fits, else above, else centred.
export function placePreviewTip(
  rect: { x: number; y: number; width: number; height: number } | null,
  view: { w: number; h: number },
  tipH: number
): TipPlace {
  const width = Math.max(0, Math.min(TIP_W, view.w - GUTTER * 2));
  if (!rect) return { left: (view.w - width) / 2, top: view.h / 3, width };
  const left = Math.min(
    Math.max(GUTTER, rect.x + rect.width / 2 - width / 2),
    view.w - width - GUTTER
  );
  const below = rect.y + rect.height + GUTTER * 2;
  if (below < view.h * 0.75) return { left, top: below, width };
  if (rect.y - GUTTER * 2 >= tipH + GUTTER)
    return { left, bottom: view.h - rect.y + GUTTER * 2, width };
  return { left, top: GUTTER, width };
}

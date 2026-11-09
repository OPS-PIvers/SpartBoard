import type { WebTourFrame } from '@/types';
import { toUrlPattern } from '@/components/tours/web/studentData';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Room kept around the target so the picture shows where it sits. */
const MARGIN_PX = 200;
const MIN_CROP: Size = { w: 640, h: 360 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A crop as 0-1 fractions of the picture it was cut from. */
export interface CropFraction {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropFraction = { x: 0, y: 0, w: 1, h: 1 };

/** A crop in screenshot pixels as fractions of the screenshot. */
export const cropFraction = (crop: Rect, image: Size): CropFraction => {
  const r = (n: number) => Math.round(clamp(n, 0, 1) * 10000) / 10000;
  return {
    x: r(crop.x / image.w),
    y: r(crop.y / image.h),
    w: r(crop.width / image.w),
    h: r(crop.height / image.h),
  };
};

/** Blur boxes drawn on a crop (percent of the crop), moved onto the screen it was cut from. */
export const blurInOriginal = <
  T extends { xPct: number; yPct: number; wPct: number; hPct: number },
>(
  boxes: readonly T[],
  crop: CropFraction
): T[] =>
  boxes.map((b) => ({
    ...b,
    xPct: crop.x * 100 + b.xPct * crop.w,
    yPct: crop.y * 100 + b.yPct * crop.h,
    wPct: b.wPct * crop.w,
    hPct: b.hPct * crop.h,
  }));

/** The target plus its surroundings, in viewport (CSS) pixels. */
export function cropCss(target: Rect, viewport: Size): Rect {
  const want = {
    w: Math.max(target.width + 2 * MARGIN_PX, MIN_CROP.w),
    h: Math.max(target.height + 2 * MARGIN_PX, MIN_CROP.h),
  };
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const w = Math.min(want.w, viewport.w);
  const h = Math.min(want.h, viewport.h);
  return {
    x: clamp(cx - w / 2, 0, viewport.w - w),
    y: clamp(cy - h / 2, 0, viewport.h - h),
    width: w,
    height: h,
  };
}

/** The target plus its surroundings, in screenshot pixels; the whole picture when the target is unknown. */
export function cropRect(
  target: Rect | null,
  viewport: Size,
  image: Size
): Rect {
  const full = { x: 0, y: 0, width: image.w, height: image.h };
  if (!target || viewport.w <= 0 || viewport.h <= 0) return full;
  const sx = image.w / viewport.w;
  const sy = image.h / viewport.h;
  const c = cropCss(target, viewport);
  return {
    x: Math.round(c.x * sx),
    y: Math.round(c.y * sy),
    width: Math.round(c.width * sx),
    height: Math.round(c.height * sy),
  };
}

/** Where the target sits in its cropped picture (0-1 of the picture) and the picture's CSS width, for previews drawn to scale. */
export function pictureTarget(
  target: Rect,
  viewport: Size
): {
  target: { x: number; y: number; w: number; h: number };
  cssW: number;
} | null {
  if (viewport.w <= 0 || viewport.h <= 0) return null;
  const c = cropCss(target, viewport);
  if (c.width <= 0 || c.height <= 0) return null;
  const r = (n: number) => Math.round(clamp(n, 0, 1) * 10000) / 10000;
  const x = r((target.x - c.x) / c.width);
  const y = r((target.y - c.y) / c.height);
  return {
    target: {
      x,
      y,
      w: Math.min(r(target.width / c.width), r(1 - x)),
      h: Math.min(r(target.height / c.height), r(1 - y)),
    },
    cssW: Math.round(c.width),
  };
}

/** The target's place in the top viewport as 0-1 fractions, used only to break ties at playback. */
export function toBox(
  target: Rect,
  viewport: Size
): { x: number; y: number; w: number; h: number } | undefined {
  if (viewport.w <= 0 || viewport.h <= 0) return undefined;
  const r = (n: number) => Math.round(clamp(n, 0, 1) * 1000) / 1000;
  return {
    x: r(target.x / viewport.w),
    y: r(target.y / viewport.h),
    w: r(target.width / viewport.w),
    h: r(target.height / viewport.h),
  };
}

/** A frame as `webNavigation.getAllFrames` reports it. */
export interface FrameInfo {
  frameId: number;
  parentFrameId: number;
  url: string;
}

/** Frames from the top page down to the target's frame, each as its address pattern and place among its siblings. */
export function framePath(
  frames: readonly FrameInfo[],
  frameId: number
): WebTourFrame[] | null {
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const chain: FrameInfo[] = [];
  for (let f = byId.get(frameId); f && f.frameId !== 0;) {
    chain.unshift(f);
    if (chain.length > 10) return null;
    f = byId.get(f.parentFrameId);
  }
  if (frameId !== 0 && chain[0]?.parentFrameId !== 0) return null;
  const out: WebTourFrame[] = [];
  for (const f of chain) {
    const siblings = frames
      .filter((s) => s.parentFrameId === f.parentFrameId)
      .sort((a, b) => a.frameId - b.frameId);
    out.push({
      urlPattern: toUrlPattern(f.url) ?? '*',
      index: siblings.findIndex((s) => s.frameId === f.frameId),
    });
  }
  return out;
}

/** Moves a rect from a frame's viewport into its parent's, given the frame element's content box there. */
export const offsetRect = (r: Rect, by: { x: number; y: number }): Rect => ({
  ...r,
  x: r.x + by.x,
  y: r.y + by.y,
});

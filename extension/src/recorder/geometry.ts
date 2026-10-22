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
  const want = {
    w: Math.max(target.width + 2 * MARGIN_PX, MIN_CROP.w),
    h: Math.max(target.height + 2 * MARGIN_PX, MIN_CROP.h),
  };
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const w = Math.min(want.w, viewport.w);
  const h = Math.min(want.h, viewport.h);
  const x = clamp(cx - w / 2, 0, viewport.w - w);
  const y = clamp(cy - h / 2, 0, viewport.h - h);
  return {
    x: Math.round(x * sx),
    y: Math.round(y * sy),
    width: Math.round(w * sx),
    height: Math.round(h * sy),
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

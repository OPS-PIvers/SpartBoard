import type { WebTourLocator, WebTourPicture } from '@/types';

export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Mirrors the recorder's crop (extension/src/recorder/geometry.ts cropCss).
const MARGIN_PX = 200;
const MIN_CROP = { w: 640, h: 360 };
/** Older recordings kept no viewport size, so their estimate assumes a common laptop one. */
export const ASSUMED_VIEWPORT = { w: 1440, h: 900 };
/** How far the estimated crop's shape may differ from the picture's before the estimate is refused. */
const ASPECT_TOLERANCE = 0.04;
const MIN_FRAC = 0.005;
const MAX_FRAC = 0.95;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The recorder's crop for a viewport box, unclamped target included, in assumed viewport pixels. */
function estimateCrop(box: FracRect, viewport: { w: number; h: number }) {
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
  return {
    cw,
    ch,
    rect: {
      x: (t.x - cx) / cw,
      y: (t.y - cy) / ch,
      w: t.w / cw,
      h: t.h / ch,
    },
  };
}

const plausible = (r: FracRect) =>
  r.x >= 0 &&
  r.y >= 0 &&
  r.x + r.w <= 1 &&
  r.y + r.h <= 1 &&
  r.w >= MIN_FRAC &&
  r.h >= MIN_FRAC &&
  r.w <= MAX_FRAC &&
  r.h <= MAX_FRAC;

export interface StagePlacement {
  /** The target in the picture as 0-1 fractions; null when it can't be placed with confidence. */
  rect: FracRect | null;
  /** The picture's width in CSS pixels at capture, which sets the tour chrome's scale. */
  cssW: number;
  source: 'recorded' | 'estimate' | 'none';
}

/** Where to draw the ring on a step's picture: the recorded place, else an estimate that passes its checks, else none. */
export function stagePlacement(
  picture: Pick<WebTourPicture, 'w' | 'h' | 'target' | 'cssW'>,
  locator: Pick<WebTourLocator, 'box'> | undefined,
  viewport = ASSUMED_VIEWPORT
): StagePlacement {
  const fallbackCss = Math.min(picture.w, 1280);
  const recorded = picture.target;
  if (recorded && plausible(recorded))
    return {
      rect: recorded,
      cssW: picture.cssW ?? fallbackCss,
      source: 'recorded',
    };
  const box = locator?.box;
  if (box && box.w > 0 && box.h > 0 && picture.w > 0 && picture.h > 0) {
    const { cw, ch, rect } = estimateCrop(box, viewport);
    const aspect = cw / ch / (picture.w / picture.h);
    if (plausible(rect) && Math.abs(aspect - 1) <= ASPECT_TOLERANCE)
      return { rect, cssW: picture.cssW ?? cw, source: 'estimate' };
    // Too unsure for a ring, but the crop's width still sizes the chrome better than a guess.
    return { rect: null, cssW: picture.cssW ?? cw, source: 'none' };
  }
  return { rect: null, cssW: picture.cssW ?? fallbackCss, source: 'none' };
}

const TIP_W = 320;
const GUTTER = 12;

export interface TipPlace {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  /** Set when neither side fits the whole tip: the tip's height on the side it was given. */
  maxH?: number;
}

// A side with less room than this can't hold a readable tip, so the tip may cover the target instead.
export const MIN_TIP_ROOM = 120;

/** The extension overlay's tip placement, shared with the editor preview so both put the tip in the same spot. */
export function placeTourTip(
  rect: { x: number; y: number; width: number; height: number } | null,
  view: { w: number; h: number },
  tipH: number,
  minRoom = MIN_TIP_ROOM
): TipPlace {
  const width = Math.max(0, Math.min(TIP_W, view.w - GUTTER * 2));
  if (!rect) return { left: (view.w - width) / 2, top: view.h / 3, width };
  const left = Math.min(
    Math.max(GUTTER, rect.x + rect.width / 2 - width / 2),
    view.w - width - GUTTER
  );
  const below = rect.y + rect.height + GUTTER * 2;
  if (below + tipH + GUTTER <= view.h) return { left, top: below, width };
  // Above is pinned by its bottom edge, so a tip that grows after it is measured still clears the target.
  if (rect.y - GUTTER * 2 >= tipH + GUTTER)
    return { left, bottom: view.h - rect.y + GUTTER * 2, width };
  const roomBelow = view.h - below - GUTTER;
  const roomAbove = rect.y - GUTTER * 3;
  if (Math.max(roomBelow, roomAbove) < minRoom)
    return { left, top: GUTTER, width };
  return roomBelow >= roomAbove
    ? { left, top: below, width, maxH: roomBelow }
    : { left, bottom: view.h - rect.y + GUTTER * 2, width, maxH: roomAbove };
}

export const placePreviewTip = placeTourTip;

/** Largest picture magnification, so a capture never goes soft on a big screen. */
export const MAX_MAGNIFY = 1.5;

/** The scale for the frame drawn at CSS size: fits the room and never magnifies the picture's pixels past MAX_MAGNIFY. */
export function stageScale(
  css: { w: number; h: number },
  pictureW: number,
  room: { w: number; h: number }
): number {
  if (css.w <= 0 || css.h <= 0) return 1;
  const fitW = room.w > 0 ? room.w / css.w : Infinity;
  const fitH = room.h > 0 ? room.h / css.h : Infinity;
  const fit = Math.min(fitW, fitH);
  const sharp = (MAX_MAGNIFY * pictureW) / css.w;
  const k = Math.min(fit, sharp);
  return Number.isFinite(k) && k > 0 ? k : 1;
}

import { SNAP_LAYOUT_CONSTANTS } from './layoutMath';

/**
 * Reference viewport used to convert pixel-based widget defaults into
 * proportional storage. Picking a fixed reference (rather than the user's
 * current viewport) means a widget added on a 1366×768 laptop and one added
 * on a 1920×1080 projector get identical proportional bounds.
 */
export const REFERENCE_VIEWPORT = { w: 1920, h: 1080 } as const;

/** Minimum pixel size a widget can render at, regardless of proportions. */
export const MIN_PIXEL_W = 100;
export const MIN_PIXEL_H = 60;

/** Stretch behavior for a widget's pixel rect inside its proportional rect. */
export type StretchBehavior = 'fill' | 'preserve-aspect';

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProportionalRect {
  xProp: number;
  yProp: number;
  wProp: number;
  hProp: number;
}

/** Pure helper: returns the safe board (viewport minus PADDING on each side). */
export const getSafeViewport = (vpW: number, vpH: number) => {
  const { PADDING } = SNAP_LAYOUT_CONSTANTS;
  return {
    safeW: Math.max(1, vpW - PADDING * 2),
    safeH: Math.max(1, vpH - PADDING * 2),
    padding: PADDING,
  };
};

/**
 * Convert a pixel rect (relative to viewport origin) to a proportional rect
 * (fraction of the safe board). Output values are unclamped — drag math may
 * legitimately produce x < 0 or x+w > 1 when widgets sit in the world overhang
 * outside the viewport.
 */
export const pixelToProp = (
  rect: PixelRect,
  vpW: number,
  vpH: number
): ProportionalRect => {
  const { safeW, safeH, padding } = getSafeViewport(vpW, vpH);
  return {
    xProp: (rect.x - padding) / safeW,
    yProp: (rect.y - padding) / safeH,
    wProp: rect.w / safeW,
    hProp: rect.h / safeH,
  };
};

/**
 * Convert a proportional rect back to pixels at the given viewport. Does NOT
 * apply aspect-ratio fitting or min-size floors — callers that need rendering
 * geometry should use {@link computeWidgetPixelRect} instead.
 */
export const propToPixel = (
  prop: ProportionalRect,
  vpW: number,
  vpH: number
): PixelRect => {
  const { safeW, safeH, padding } = getSafeViewport(vpW, vpH);
  return {
    x: padding + prop.xProp * safeW,
    y: padding + prop.yProp * safeH,
    w: prop.wProp * safeW,
    h: prop.hProp * safeH,
  };
};

/**
 * Fit a rect with the given aspect ratio (w/h) inside an outer rect, centered.
 * If aspectRatio <= 0 or NaN, falls back to the outer rect unchanged.
 */
export const fitAspectInside = (
  outer: PixelRect,
  aspectRatio: number
): PixelRect => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return outer;
  const outerAspect = outer.w / Math.max(1, outer.h);
  if (outerAspect > aspectRatio) {
    // Outer is wider than target: clamp width
    const fittedW = outer.h * aspectRatio;
    return {
      x: outer.x + (outer.w - fittedW) / 2,
      y: outer.y,
      w: fittedW,
      h: outer.h,
    };
  }
  // Outer is taller than (or equal to) target: clamp height
  const fittedH = outer.w / aspectRatio;
  return {
    x: outer.x,
    y: outer.y + (outer.h - fittedH) / 2,
    w: outer.w,
    h: fittedH,
  };
};

/** Apply pixel min-size floors to a rect, clamping w and h up to the floor. */
export const applyMinSize = (
  rect: PixelRect,
  minW = MIN_PIXEL_W,
  minH = MIN_PIXEL_H
): PixelRect => ({
  x: rect.x,
  y: rect.y,
  w: Math.max(rect.w, minW),
  h: Math.max(rect.h, minH),
});

/**
 * Compute the pixel rect a widget should render at, given its proportional
 * bounds and the current viewport. Applies aspect-ratio fitting (when
 * stretchBehavior is 'preserve-aspect') and min-size floors.
 *
 * Output values are rounded to whole pixels.
 */
export interface ComputeWidgetPixelRectInput {
  xProp: number;
  yProp: number;
  wProp: number;
  hProp: number;
  aspectRatio?: number;
}

export const computeWidgetPixelRect = (
  widget: ComputeWidgetPixelRectInput,
  vpW: number,
  vpH: number,
  stretchBehavior: StretchBehavior = 'preserve-aspect',
  minW = MIN_PIXEL_W,
  minH = MIN_PIXEL_H
): PixelRect => {
  const outer = propToPixel(widget, vpW, vpH);
  let rect = outer;
  if (
    stretchBehavior === 'preserve-aspect' &&
    typeof widget.aspectRatio === 'number' &&
    Number.isFinite(widget.aspectRatio) &&
    widget.aspectRatio > 0
  ) {
    rect = fitAspectInside(outer, widget.aspectRatio);
  }
  rect = applyMinSize(rect, minW, minH);
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
};

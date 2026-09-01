/**
 * Utility functions for handling image footprint and coordinate conversion
 * in the Guided Learning widget.
 */

export interface ImageFootprint {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface ImageOffset {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Calculates the actual rendered footprint (draw size and offsets)
 * of an image using `object-contain` within a container.
 */
export function calculateImageFootprint(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number
): ImageFootprint | null {
  if (
    naturalWidth === 0 ||
    naturalHeight === 0 ||
    containerWidth === 0 ||
    containerHeight === 0
  ) {
    return null;
  }

  const imageAspect = naturalWidth / naturalHeight;
  const containerAspect = containerWidth / containerHeight;

  const width =
    imageAspect > containerAspect
      ? containerWidth
      : containerHeight * imageAspect;
  const height =
    imageAspect > containerAspect
      ? containerWidth / imageAspect
      : containerHeight;

  return {
    width,
    height,
    offsetLeft: (containerWidth - width) / 2,
    offsetTop: (containerHeight - height) / 2,
  };
}

/**
 * Converts a measured image footprint into container-relative offsets/scales.
 */
export function toImageOffset(
  footprint: ImageFootprint | null,
  containerWidth: number,
  containerHeight: number
): ImageOffset | null {
  if (!footprint || containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  return {
    left: (footprint.offsetLeft / containerWidth) * 100,
    top: (footprint.offsetTop / containerHeight) * 100,
    scaleX: footprint.width / containerWidth,
    scaleY: footprint.height / containerHeight,
  };
}

/**
 * Converts image-relative percentage coordinates (0-100) back to
 * container-relative percentage coordinates (0-100).
 * Returns null when the image footprint has not been measured yet —
 * callers must not treat image-% as container-%.
 */
export function toContainerCoords(
  xPct: number,
  yPct: number,
  imgOffset: ImageOffset | null
): { xPct: number; yPct: number } | null {
  if (!imgOffset) return null;

  return {
    xPct: imgOffset.left + xPct * imgOffset.scaleX,
    yPct: imgOffset.top + yPct * imgOffset.scaleY,
  };
}

/**
 * Converts an image-relative spotlight radius (% of the image footprint's
 * smaller dimension) to a container-relative radius (% of the container's
 * smaller dimension). Falls back to the input when unmeasured.
 */
export function toContainerSpotlightRadiusPct(
  radiusPct: number,
  imgOffset: ImageOffset | null,
  containerWidth: number,
  containerHeight: number
): number {
  if (!imgOffset || containerWidth === 0 || containerHeight === 0) {
    return radiusPct;
  }
  const imageMin = Math.min(
    containerWidth * imgOffset.scaleX,
    containerHeight * imgOffset.scaleY
  );
  const containerMin = Math.min(containerWidth, containerHeight);
  return containerMin === 0 ? radiusPct : (radiusPct * imageMin) / containerMin;
}

/**
 * Exact inverse of `toContainerSpotlightRadiusPct`: converts a
 * container-relative spotlight radius to an image-relative one.
 * Falls back to the input when unmeasured.
 */
export function toImageSpotlightRadiusPct(
  radiusPct: number,
  imgOffset: ImageOffset | null,
  containerWidth: number,
  containerHeight: number
): number {
  if (!imgOffset || containerWidth === 0 || containerHeight === 0) {
    return radiusPct;
  }
  const imageMin = Math.min(
    containerWidth * imgOffset.scaleX,
    containerHeight * imgOffset.scaleY
  );
  const containerMin = Math.min(containerWidth, containerHeight);
  return imageMin === 0 ? radiusPct : (radiusPct * containerMin) / imageMin;
}

/** Translation (px, pre-scale-division) that centers a container-relative point at the given zoom scale. */
export function computePanZoomTranslate(
  xPct: number,
  yPct: number,
  scale: number,
  containerWidth: number,
  containerHeight: number
): { tx: number; ty: number } {
  return {
    tx: containerWidth / 2 - (xPct / 100) * containerWidth * scale,
    ty: containerHeight / 2 - (yPct / 100) * containerHeight * scale,
  };
}

/** Unzoomed-container px rect a pan-zoom step will frame; null when not zoomed. */
export function computeZoomExtentRect(
  xPct: number,
  yPct: number,
  scale: number,
  containerWidth: number,
  containerHeight: number
): { left: number; top: number; width: number; height: number } | null {
  if (scale <= 1 || containerWidth === 0 || containerHeight === 0) return null;
  const { tx, ty } = computePanZoomTranslate(
    xPct,
    yPct,
    scale,
    containerWidth,
    containerHeight
  );
  return {
    left: -tx / scale,
    top: -ty / scale,
    width: containerWidth / scale,
    height: containerHeight / scale,
  };
}

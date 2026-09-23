import type { ImageOffset } from './imageUtils';
import { effectiveRegion } from './regionGeometry';
import type { PctPoint, StageGeometry } from '../types/stage';

/** Builds the stage's coordinate helpers from one measured layout. */
export function buildStageGeometry(input: {
  containerSize: { w: number; h: number };
  imgOffset: ImageOffset;
  renderedTransform: StageGeometry['renderedTransform'];
  getMediaRect: () => DOMRect | null;
}): StageGeometry {
  const { containerSize, imgOffset, renderedTransform, getMediaRect } = input;
  const { w, h } = containerSize;
  const { scale, tx, ty } = renderedTransform;
  const imagePctToContainerPx = (p: PctPoint) => ({
    x: ((imgOffset.left + p.xPct * imgOffset.scaleX) / 100) * w * scale + tx,
    y: ((imgOffset.top + p.yPct * imgOffset.scaleY) / 100) * h * scale + ty,
  });
  const containerPxToImagePct = (x: number, y: number): PctPoint => ({
    xPct: (((x - tx) / scale / w) * 100 - imgOffset.left) / imgOffset.scaleX,
    yPct: (((y - ty) / scale / h) * 100 - imgOffset.top) / imgOffset.scaleY,
  });
  const clientToImagePct = (clientX: number, clientY: number): PctPoint => {
    // The media box spans the container, so its painted rect already carries
    // every transform above it (pan-zoom, device frame, canvas zoom).
    const rect = getMediaRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { xPct: 0, yPct: 0 };
    }
    return {
      xPct:
        (((clientX - rect.left) / rect.width) * 100 - imgOffset.left) /
        imgOffset.scaleX,
      yPct:
        (((clientY - rect.top) / rect.height) * 100 - imgOffset.top) /
        imgOffset.scaleY,
    };
  };
  const geometry: StageGeometry = {
    containerSize,
    imgOffset,
    renderedTransform,
    imagePctToContainerPx,
    containerPxToImagePct,
    clientToImagePct,
    regionFor: (step) => effectiveRegion(step, geometry),
  };
  return geometry;
}

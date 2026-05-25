import { DrawableObject, Point } from '@/types';
import { renderArrow, renderEllipse, renderLine, renderRect } from './shapes';
import { renderText } from './text';
import { renderImage } from './image';

// Shared object-kind dispatcher. Owned in this module (not inside
// `useDrawingCanvas`) so the export pipeline can reuse the exact same
// kind → renderer mapping when painting to an offscreen canvas. Keeping a
// single dispatcher prevents the live canvas and exported PNG from drifting
// in how they paint any kind.

/**
 * Render a single `DrawableObject` onto the given 2D context. Each underlying
 * renderer is responsible for save/restore so style state never leaks across
 * objects in a paint loop.
 *
 * `onImageLoad` is forwarded to the ImageObject branch so the live canvas can
 * trigger a redraw when async image bytes arrive. Export callers omit it (the
 * offscreen export uses pre-loaded images so no second pass is needed).
 */
export const renderObject = (
  ctx: CanvasRenderingContext2D,
  obj: DrawableObject,
  onImageLoad?: () => void
): void => {
  switch (obj.kind) {
    case 'path':
      renderPathPoints(ctx, obj.points, obj.color, obj.width);
      return;
    case 'rect':
      renderRect(ctx, obj);
      return;
    case 'ellipse':
      renderEllipse(ctx, obj);
      return;
    case 'line':
      renderLine(ctx, obj);
      return;
    case 'arrow':
      renderArrow(ctx, obj);
      return;
    case 'text':
      // Skip rendering empty text — empty content is the "in-edit" sentinel
      // for a freshly-spawned object before the user types anything, and we
      // don't want an invisible-but-still-allocating-baseline draw call.
      if (obj.content === '') return;
      renderText(ctx, obj);
      return;
    case 'image':
      // Image cache is module-level inside the renderer; the onload callback
      // fires the canvas-level redraw so freshly-decoded images appear without
      // needing another React state nudge.
      renderImage(ctx, obj, onImageLoad);
      return;
  }
};

/**
 * Pure path-points renderer. Shared by the dispatcher (committed PathObjects)
 * and the live-preview path renderer in `useDrawingCanvas` (in-flight stroke).
 * Resets `globalCompositeOperation` back to `source-over` at the end so eraser
 * strokes don't leak their composite mode into subsequent paints.
 */
export const renderPathPoints = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number
): void => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (color === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
  }
  ctx.lineWidth = width;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
};

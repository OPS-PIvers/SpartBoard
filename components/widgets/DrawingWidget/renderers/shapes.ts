import { ArrowObject, EllipseObject, LineObject, RectObject } from '@/types';

// Pure Canvas 2D renderers for the shape primitives. Each function wraps its
// work in save()/restore() so style state (strokeStyle, lineWidth, fillStyle,
// globalCompositeOperation) never leaks across objects in the dispatcher's
// render loop.
//
// Rotation: rect and ellipse honor `obj.rotation` (radians) by rotating the
// context around the bbox center INSIDE their save/restore bracket. Line and
// arrow are endpoint-defined — their geometry IS their rotation — so they
// intentionally ignore `obj.rotation` (applying it here would double-rotate
// because rotation is already encoded in the endpoints).

/**
 * Apply `obj.rotation` to the current context, pivoting around the center of
 * the unrotated bbox. Caller must already be inside a save()/restore() pair
 * — this only mutates the transform, it does not bracket its own state.
 */
const applyRotation = (
  ctx: CanvasRenderingContext2D,
  obj: { x: number; y: number; w: number; h: number; rotation?: number }
): void => {
  const rot = obj.rotation ?? 0;
  if (!Number.isFinite(rot) || rot === 0) return;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(-cx, -cy);
};

export const renderRect = (
  ctx: CanvasRenderingContext2D,
  obj: RectObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Rotation pivots around the bbox center. Done inside the existing
  // save/restore bracket so the parent transform is restored even if a
  // subsequent draw call throws.
  applyRotation(ctx, obj);
  if (obj.fill !== undefined) {
    ctx.fillStyle = obj.fill;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
  }
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
  ctx.restore();
};

export const renderEllipse = (
  ctx: CanvasRenderingContext2D,
  obj: EllipseObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // Rotation pivots around the bbox center BEFORE the ellipse path is
  // constructed so the implicit rx/ry axes rotate with it.
  applyRotation(ctx, obj);
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const rx = Math.abs(obj.w / 2);
  const ry = Math.abs(obj.h / 2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (obj.fill !== undefined) {
    ctx.fillStyle = obj.fill;
    ctx.fill();
  }
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.stroke();
  ctx.restore();
};

/**
 * Line renderer. Intentionally ignores `obj.rotation` — a line is fully
 * specified by its two endpoints, and any rotation is already encoded in
 * those endpoints (rotating the endpoints is how `useSelection` would
 * "rotate" a line in the first place). Applying rotation here would
 * double-rotate the visible line.
 */
export const renderLine = (
  ctx: CanvasRenderingContext2D,
  obj: LineObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.beginPath();
  ctx.moveTo(obj.x1, obj.y1);
  ctx.lineTo(obj.x2, obj.y2);
  ctx.stroke();
  ctx.restore();
};

/**
 * Arrow renderer. Like `renderLine`, intentionally ignores `obj.rotation` —
 * the shaft endpoints and head direction are derived from the two endpoints
 * directly, so rotation is already encoded there.
 */
export const renderArrow = (
  ctx: CanvasRenderingContext2D,
  obj: ArrowObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = obj.stroke;
  // Set fillStyle consistently so the head triangle paints in the same color
  // as the shaft regardless of whatever fillStyle the previous draw left
  // behind (the save() guards across objects, but not within this function).
  ctx.fillStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;

  ctx.beginPath();
  ctx.moveTo(obj.x1, obj.y1);
  ctx.lineTo(obj.x2, obj.y2);
  ctx.stroke();

  // Head: isoceles triangle pointed at (x2, y2). Length scales with stroke
  // width so thin arrows get small heads and thick ones get big heads.
  // Wing angle 30° (Math.PI/6) matches the Phase 2 design plan's arrowhead
  // proportions.
  const headLen = Math.max(12, obj.strokeWidth * 3);
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const wingAngle = Math.PI / 6; // 30°
  const leftX = obj.x2 - headLen * Math.cos(angle - wingAngle);
  const leftY = obj.y2 - headLen * Math.sin(angle - wingAngle);
  const rightX = obj.x2 - headLen * Math.cos(angle + wingAngle);
  const rightY = obj.y2 - headLen * Math.sin(angle + wingAngle);

  ctx.beginPath();
  // Reset fillStyle right before fill in case any intervening branch above
  // mutated it — keeps the head triangle visibly the same color as the shaft.
  ctx.fillStyle = obj.stroke;
  ctx.moveTo(obj.x2, obj.y2);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

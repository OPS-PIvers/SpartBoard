import { ArrowObject, EllipseObject, LineObject, RectObject } from '@/types';

// Pure Canvas 2D renderers for the shape primitives. Each function wraps its
// work in save()/restore() so style state (strokeStyle, lineWidth, fillStyle,
// globalCompositeOperation) never leaks across objects in the dispatcher's
// render loop.

export const renderRect = (
  ctx: CanvasRenderingContext2D,
  obj: RectObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
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

export const renderArrow = (
  ctx: CanvasRenderingContext2D,
  obj: ArrowObject
): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = obj.stroke;
  ctx.fillStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;

  ctx.beginPath();
  ctx.moveTo(obj.x1, obj.y1);
  ctx.lineTo(obj.x2, obj.y2);
  ctx.stroke();

  // Head: isoceles triangle pointed at (x2, y2). Length scales with stroke
  // width so thin arrows get small heads and thick ones get big heads.
  const headLen = Math.max(12, obj.strokeWidth * 3);
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const wingAngle = Math.PI / 7; // ~25.7°
  const leftX = obj.x2 - headLen * Math.cos(angle - wingAngle);
  const leftY = obj.y2 - headLen * Math.sin(angle - wingAngle);
  const rightX = obj.x2 - headLen * Math.cos(angle + wingAngle);
  const rightY = obj.y2 - headLen * Math.sin(angle + wingAngle);

  ctx.beginPath();
  ctx.moveTo(obj.x2, obj.y2);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

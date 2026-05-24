import { DrawableObject } from '@/types';
import { getBoundingBox, getHandlePositions } from '../hitTest';

// Selection chrome renderer. Painted INSIDE the canvas after the object loop
// (not as a sibling SVG/DOM overlay) — keeps `useDrawingCanvas` the single
// rendering surface and means future PNG/PDF export can skip chrome by
// rendering with `selection: null`.

const HANDLE_BORDER = '#3b82f6'; // Tailwind blue-500
const HANDLE_FILL = '#ffffff';
const BBOX_STROKE = 'rgba(59, 130, 246, 0.9)';
const BBOX_DASH: [number, number] = [6, 4];

export interface TransformChromeState {
  /** When non-null, the chrome dims its handle fills to signal an active drag. */
  active: boolean;
}

/**
 * Paint selection chrome (1px dashed bbox + 8 resize handles + 1 rotation
 * handle) for the given object. Sizes scale inversely with `scale` so a 10px
 * screen handle stays pointer-friendly at any canvas zoom. Wrapped in
 * save()/restore() so style state never leaks into the next paint.
 */
export const renderSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  obj: DrawableObject,
  transformState: TransformChromeState | null,
  scale: number
): void => {
  const bbox = getBoundingBox(obj);
  const positions = getHandlePositions(bbox);
  // Inverse-scale all sizes so on-screen pixel dimensions stay constant
  // regardless of canvas zoom.
  const inv = 1 / Math.max(scale, 0.0001);
  const lineWidth = 1 * inv;
  const handleSize = 10 * inv;
  const handleHalf = handleSize / 2;
  const handleStroke = 2 * inv;
  const dash: [number, number] = [BBOX_DASH[0] * inv, BBOX_DASH[1] * inv];

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = transformState?.active ? 0.75 : 1;

  // Bounding box: 1px dashed indigo.
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = BBOX_STROKE;
  ctx.setLineDash(dash);
  ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.setLineDash([]);

  // Rotation handle: line from top-center down to the bbox top + circle.
  const rot = positions.rotate;
  const topMid = positions.n;
  ctx.beginPath();
  ctx.moveTo(topMid.x, topMid.y);
  ctx.lineTo(rot.x, rot.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = HANDLE_FILL;
  ctx.strokeStyle = HANDLE_BORDER;
  ctx.lineWidth = handleStroke;
  ctx.arc(rot.x, rot.y, handleSize * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 8 resize handles: white squares with a 2px blue border.
  const handleNames = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
  for (const name of handleNames) {
    const p = positions[name];
    ctx.fillStyle = HANDLE_FILL;
    ctx.strokeStyle = HANDLE_BORDER;
    ctx.lineWidth = handleStroke;
    ctx.fillRect(p.x - handleHalf, p.y - handleHalf, handleSize, handleSize);
    ctx.strokeRect(p.x - handleHalf, p.y - handleHalf, handleSize, handleSize);
  }

  ctx.restore();
};

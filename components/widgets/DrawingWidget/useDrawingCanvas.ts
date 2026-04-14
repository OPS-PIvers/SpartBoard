import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  LineObject,
  PathObject,
  Point,
  RectObject,
  ShapeTool,
} from '@/types';

interface UseDrawingCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  width: number;
  objects: DrawableObject[];
  onObjectComplete: (obj: DrawableObject) => void;
  /** CSS transform scale applied to the canvas by a parent ScalableWidget.
   *  Pass `1` for full-viewport overlays where no parent scaling applies. */
  scale?: number;
  /** If true, pointer events are ignored (e.g. student read-only view). */
  disabled?: boolean;
  /** Internal canvas resolution. Re-applies on change. */
  canvasSize: { width: number; height: number };
  /** Generate an id for a newly-completed object. Injected so tests can
   *  produce deterministic output without mocking crypto. */
  generateId?: () => string;
  /** Next z-index to assign to the completed object. */
  nextZ: number;
  /** Active drawing tool. Defaults to 'pen'. */
  activeTool?: ShapeTool;
  /** If true, rect and ellipse shapes are filled with the current color. */
  shapeFill?: boolean;
}

interface UseDrawingCanvasResult {
  handleStart: (e: React.PointerEvent) => void;
  handleMove: (e: React.PointerEvent) => void;
  handleEnd: () => void;
  isDrawing: boolean;
}

// Discriminated union for the in-progress gesture
type InProgress =
  | { kind: 'path'; points: Point[] }
  | { kind: 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number };

/**
 * Shared canvas-drawing logic for the DrawingWidget and the AnnotationOverlay.
 * Renders a polymorphic list of DrawableObjects and captures gestures as new
 * objects (pen, eraser, rect, ellipse, line, arrow). Text and image kinds are
 * recognized by the dispatcher but render nothing until PRs 2.1d / 2.2.
 */
export const useDrawingCanvas = ({
  canvasRef,
  color,
  width,
  objects,
  onObjectComplete,
  scale = 1,
  disabled = false,
  canvasSize,
  generateId = () => crypto.randomUUID(),
  nextZ,
  activeTool = 'pen',
  shapeFill = false,
}: UseDrawingCanvasOptions): UseDrawingCanvasResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const inProgressRef = useRef<InProgress | null>(null);
  // Capture activeTool at gesture start so mid-drag tool switches are ignored
  const activeToolAtStartRef = useRef<ShapeTool>('pen');

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      allObjects: DrawableObject[],
      preview?: DrawableObject
    ) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      const sorted = [...allObjects].sort((a, b) => a.z - b.z);
      sorted.forEach((obj) => renderObject(ctx, obj));

      if (preview) renderObject(ctx, preview);
    },
    []
  );

  // Apply canvas resolution + redraw on size / object-list change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    draw(ctx, objects);
  }, [canvasRef, canvasSize.width, canvasSize.height, objects, draw]);

  const getPos = useCallback(
    (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    },
    [canvasRef, scale]
  );

  const handleStart = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      setIsDrawing(true);
      const pos = getPos(e);
      const tool = activeTool;
      activeToolAtStartRef.current = tool;

      if (tool === 'pen' || tool === 'eraser') {
        inProgressRef.current = { kind: 'path', points: [pos] };

        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          setPathContextStyles(ctx, color, width, tool === 'eraser');
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        }
      } else if (tool === 'rect' || tool === 'ellipse') {
        inProgressRef.current = {
          kind: tool,
          x0: pos.x,
          y0: pos.y,
          x1: pos.x,
          y1: pos.y,
        };
      } else {
        // line | arrow
        inProgressRef.current = {
          kind: tool,
          x1: pos.x,
          y1: pos.y,
          x2: pos.x,
          y2: pos.y,
        };
      }
    },
    [disabled, getPos, canvasRef, color, width, activeTool]
  );

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isDrawing) return;
      const ip = inProgressRef.current;
      if (!ip) return;

      const pos = getPos(e);

      if (ip.kind === 'path') {
        ip.points.push(pos);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && ip.points.length > 1) {
          const isEraser = activeToolAtStartRef.current === 'eraser';
          setPathContextStyles(ctx, color, width, isEraser);
          const prev = ip.points[ip.points.length - 2];
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
      } else if (ip.kind === 'rect' || ip.kind === 'ellipse') {
        ip.x1 = pos.x;
        ip.y1 = pos.y;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const preview = buildRectEllipsePreview(
            ip.kind,
            ip.x0,
            ip.y0,
            ip.x1,
            ip.y1,
            color,
            width,
            shapeFill,
            nextZ
          );
          draw(ctx, objects, preview);
        }
      } else if (ip.kind === 'line' || ip.kind === 'arrow') {
        ip.x2 = pos.x;
        ip.y2 = pos.y;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const preview = buildLineArrowPreview(
            ip.kind,
            ip.x1,
            ip.y1,
            ip.x2,
            ip.y2,
            color,
            width,
            nextZ
          );
          draw(ctx, objects, preview);
        }
      }
    },
    [
      disabled,
      isDrawing,
      getPos,
      canvasRef,
      color,
      width,
      shapeFill,
      objects,
      draw,
      nextZ,
    ]
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const ip = inProgressRef.current;
    inProgressRef.current = null;

    if (!ip) return;

    if (ip.kind === 'path') {
      if (ip.points.length > 1) {
        const isEraser = activeToolAtStartRef.current === 'eraser';
        const completed: PathObject = {
          id: generateId(),
          kind: 'path',
          z: nextZ,
          points: ip.points,
          color: isEraser ? 'eraser' : color,
          width,
        };
        onObjectComplete(completed);
      }
    } else if (ip.kind === 'rect' || ip.kind === 'ellipse') {
      const x = Math.min(ip.x0, ip.x1);
      const y = Math.min(ip.y0, ip.y1);
      const w = Math.abs(ip.x1 - ip.x0);
      const h = Math.abs(ip.y1 - ip.y0);
      if (w === 0 && h === 0) return; // degenerate — drop
      const obj: RectObject | EllipseObject = {
        id: generateId(),
        kind: ip.kind,
        z: nextZ,
        x,
        y,
        w,
        h,
        stroke: color,
        strokeWidth: width,
        fill: shapeFill ? color : undefined,
      };
      onObjectComplete(obj);
    } else if (ip.kind === 'line' || ip.kind === 'arrow') {
      if (ip.x1 === ip.x2 && ip.y1 === ip.y2) return; // degenerate — drop
      const obj: LineObject | ArrowObject = {
        id: generateId(),
        kind: ip.kind,
        z: nextZ,
        x1: ip.x1,
        y1: ip.y1,
        x2: ip.x2,
        y2: ip.y2,
        stroke: color,
        strokeWidth: width,
      };
      onObjectComplete(obj);
    }
  }, [isDrawing, onObjectComplete, color, width, shapeFill, generateId, nextZ]);

  return { handleStart, handleMove, handleEnd, isDrawing };
};

// --- Context style helpers ---

const setPathContextStyles = (
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  isEraser: boolean
) => {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
  }
  ctx.lineWidth = width;
};

// --- Preview object builders (ephemeral, not stored) ---

const buildRectEllipsePreview = (
  kind: 'rect' | 'ellipse',
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
  shapeFill: boolean,
  z: number
): RectObject | EllipseObject => ({
  id: '__preview__',
  kind,
  z,
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
  stroke: color,
  strokeWidth: width,
  fill: shapeFill ? color : undefined,
});

const buildLineArrowPreview = (
  kind: 'line' | 'arrow',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  z: number
): LineObject | ArrowObject => ({
  id: '__preview__',
  kind,
  z,
  x1,
  y1,
  x2,
  y2,
  stroke: color,
  strokeWidth: width,
});

// --- Object dispatcher ---
// Phase 2.1b renders path, rect, ellipse, line, and arrow.
// text / image remain no-ops until PRs 2.1d / 2.2.

const renderObject = (
  ctx: CanvasRenderingContext2D,
  obj: DrawableObject
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
    case 'image':
      return; // land in 2.1d / 2.2
  }
};

const renderPathPoints = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number
): void => {
  if (points.length < 2) return;
  ctx.save();
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
  ctx.restore();
};

const renderRect = (ctx: CanvasRenderingContext2D, obj: RectObject): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (obj.fill) {
    ctx.fillStyle = obj.fill;
    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
  }
  ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
  ctx.restore();
};

const renderEllipse = (
  ctx: CanvasRenderingContext2D,
  obj: EllipseObject
): void => {
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const rx = Math.abs(obj.w / 2);
  const ry = Math.abs(obj.h / 2);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (obj.fill) {
    ctx.fillStyle = obj.fill;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
};

const renderLine = (ctx: CanvasRenderingContext2D, obj: LineObject): void => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(obj.x1, obj.y1);
  ctx.lineTo(obj.x2, obj.y2);
  ctx.stroke();
  ctx.restore();
};

const renderArrow = (ctx: CanvasRenderingContext2D, obj: ArrowObject): void => {
  const headLen = Math.max(12, obj.strokeWidth * 3);
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = obj.stroke;
  ctx.fillStyle = obj.stroke;
  ctx.lineWidth = obj.strokeWidth;
  ctx.lineCap = 'round';

  // Line body
  ctx.beginPath();
  ctx.moveTo(obj.x1, obj.y1);
  ctx.lineTo(obj.x2, obj.y2);
  ctx.stroke();

  // Triangular arrowhead at (x2, y2)
  ctx.beginPath();
  ctx.moveTo(obj.x2, obj.y2);
  ctx.lineTo(
    obj.x2 - headLen * Math.cos(angle - Math.PI / 6),
    obj.y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    obj.x2 - headLen * Math.cos(angle + Math.PI / 6),
    obj.y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

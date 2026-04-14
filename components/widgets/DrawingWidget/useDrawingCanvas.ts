import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawableObject, PathObject, Point } from '@/types';

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
  /** Generate an id for a newly-completed path object. Injected so tests can
   *  produce deterministic output without mocking crypto. */
  generateId?: () => string;
  /** Next z-index to assign to the completed path object. Owned by caller so
   *  this hook stays stateless w.r.t. object history. */
  nextZ: number;
}

interface UseDrawingCanvasResult {
  handleStart: (e: React.PointerEvent) => void;
  handleMove: (e: React.PointerEvent) => void;
  handleEnd: () => void;
  isDrawing: boolean;
}

/**
 * Shared canvas-drawing logic for the DrawingWidget and the AnnotationOverlay.
 * Renders a polymorphic list of DrawableObjects and captures freehand strokes
 * as new PathObjects (Phase 2a: path-only rendering; shape/text/image kinds
 * are recognized by the dispatcher but render nothing until their PRs land).
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
}: UseDrawingCanvasOptions): UseDrawingCanvasResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<Point[]>([]);

  const setContextStyles = useCallback(
    (ctx: CanvasRenderingContext2D) => {
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
    },
    [color, width]
  );

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      allObjects: DrawableObject[],
      current: Point[]
    ) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Render in z-order so later PRs (shapes, images, text) can layer cleanly
      // without needing to touch this call site.
      const sorted = [...allObjects].sort((a, b) => a.z - b.z);
      sorted.forEach((obj) => renderObject(ctx, obj));

      if (current.length > 1) {
        renderPathPoints(ctx, current, color, width);
      }
    },
    [color, width]
  );

  // Apply canvas resolution + redraw on size / object-list change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    draw(ctx, objects, currentPathRef.current);
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
      currentPathRef.current = [pos];

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        setContextStyles(ctx);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [disabled, getPos, canvasRef, setContextStyles]
  );

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isDrawing) return;
      const pos = getPos(e);
      currentPathRef.current.push(pos);

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && currentPathRef.current.length > 1) {
        setContextStyles(ctx);
        const prev = currentPathRef.current[currentPathRef.current.length - 2];
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    },
    [disabled, isDrawing, getPos, canvasRef, setContextStyles]
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 1) {
      const completed: PathObject = {
        id: generateId(),
        kind: 'path',
        z: nextZ,
        points: currentPathRef.current,
        color,
        width,
      };
      onObjectComplete(completed);
    }
    currentPathRef.current = [];
  }, [isDrawing, onObjectComplete, color, width, generateId, nextZ]);

  return { handleStart, handleMove, handleEnd, isDrawing };
};

// --- Object dispatcher ---
// Phase 2a only renders `path` objects. Later PRs fill in the remaining
// `kind` branches (rect, ellipse, line, arrow, text, image).

const renderObject = (
  ctx: CanvasRenderingContext2D,
  obj: DrawableObject
): void => {
  switch (obj.kind) {
    case 'path':
      renderPathPoints(ctx, obj.points, obj.color, obj.width);
      return;
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'arrow':
    case 'text':
    case 'image':
      return;
  }
};

const renderPathPoints = (
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

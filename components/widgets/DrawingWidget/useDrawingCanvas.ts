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
  TextObject,
} from '@/types';
import {
  renderArrow,
  renderEllipse,
  renderLine,
  renderRect,
} from './renderers/shapes';
import { renderText } from './renderers/text';
import { renderImage } from './renderers/image';
import { DRAWING_DEFAULTS } from './constants';

interface UseDrawingCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  width: number;
  objects: DrawableObject[];
  onObjectComplete: (obj: DrawableObject) => void;
  /** If true, pointer events are ignored (e.g. student read-only view). */
  disabled?: boolean;
  /** Internal canvas resolution. Re-applies on change. */
  canvasSize: { width: number; height: number };
  /** Generate an id for a newly-completed object. Injected so tests can
   *  produce deterministic output without mocking crypto. */
  generateId?: () => string;
  /** Next z-index to assign to the completed object. Owned by caller so
   *  this hook stays stateless w.r.t. object history. */
  nextZ: number;
  /** Active drawing tool. Defaults to `'pen'` so older callers keep working. */
  activeTool?: ShapeTool;
  /** Fill toggle for rect/ellipse. Defaults to `false`. */
  shapeFill?: boolean;
  /**
   * Fired when the user clicks the canvas with the text tool active. The
   * hook builds a fresh empty `TextObject` at the click point and hands it
   * to the caller, which is expected to (a) persist the object and (b) open
   * the contenteditable overlay scoped to its id. Text creation is a click
   * (not a drag) and routes around the in-progress shape pipeline.
   */
  onTextSpawn?: (obj: TextObject) => void;
}

interface UseDrawingCanvasResult {
  handleStart: (e: React.PointerEvent) => void;
  handleMove: (e: React.PointerEvent) => void;
  handleEnd: () => void;
  isDrawing: boolean;
}

// Discriminated in-flight state. Captures whichever geometry the active tool
// needs so handleMove/handleEnd can branch without re-reading activeTool.
type InProgress =
  | { kind: 'path'; tool: 'pen' | 'eraser'; points: Point[] }
  | {
      kind: 'rect' | 'ellipse';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | {
      kind: 'line' | 'arrow';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

/**
 * Shared canvas-drawing logic for the DrawingWidget and the AnnotationOverlay.
 * Renders a polymorphic list of DrawableObjects and captures freehand strokes
 * (pen/eraser) plus shape primitives (rect/ellipse/line/arrow) as new
 * `DrawableObject` instances.
 */
export const useDrawingCanvas = ({
  canvasRef,
  color,
  width,
  objects,
  onObjectComplete,
  disabled = false,
  canvasSize,
  generateId = () => crypto.randomUUID(),
  nextZ,
  activeTool = 'pen',
  shapeFill = false,
  onTextSpawn,
}: UseDrawingCanvasOptions): UseDrawingCanvasResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const inProgressRef = useRef<InProgress | null>(null);
  // Image renderer onload callback: stored as a ref so the (module-level)
  // dispatcher can fire a redraw without us re-binding closures each render.
  // The current draw() effect installs the latest redraw into this ref.
  const triggerRedrawRef = useRef<(() => void) | null>(null);

  const setPathContextStyles = useCallback(
    (ctx: CanvasRenderingContext2D, tool: 'pen' | 'eraser') => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'eraser') {
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
      inProgress: InProgress | null
    ) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Render in z-order so later PRs (text, image) can layer cleanly
      // without needing to touch this call site.
      const sorted = [...allObjects].sort((a, b) => a.z - b.z);
      sorted.forEach((obj) =>
        renderObject(ctx, obj, () => triggerRedrawRef.current?.())
      );

      if (inProgress) {
        renderInProgress(ctx, inProgress, color, width, shapeFill);
      }
    },
    [color, width, shapeFill]
  );

  // Apply canvas resolution + redraw on size / object-list change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    // Install the latest redraw closure for renderImage's onload callback.
    // Async image decodes resolve via this ref, so a freshly-pasted image
    // appears as soon as the bytes arrive — no polling, no setTimeout.
    triggerRedrawRef.current = () => {
      const c = canvasRef.current;
      const c2 = c?.getContext('2d');
      if (c && c2) draw(c2, objects, inProgressRef.current);
    };

    draw(ctx, objects, inProgressRef.current);
  }, [canvasRef, canvasSize.width, canvasSize.height, objects, draw]);

  // Translate a pointer event's client coords into the canvas's internal
  // resolution (which is also the coordinate space stored on DrawableObjects).
  // Using the DOM-measured ratio of internal resolution to on-screen CSS size
  // handles any parent CSS `transform: scale()` and any internal-vs-CSS size
  // mismatch in a single step — matching the pattern used by SeatingChart.
  const getPos = useCallback(
    (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [canvasRef]
  );

  const handleStart = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const pos = getPos(e);

      // Text is a click-only spawn — no drag, no in-progress preview. Emit a
      // fresh empty TextObject through the caller and return without flipping
      // `isDrawing`, so the subsequent pointer-move/up are no-ops.
      if (activeTool === 'text') {
        if (!onTextSpawn) return;
        const spawned: TextObject = {
          id: generateId(),
          kind: 'text',
          z: nextZ,
          x: pos.x,
          y: pos.y,
          w: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_W,
          h: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_H,
          content: '',
          fontFamily: DRAWING_DEFAULTS.TEXT_FONT_FAMILY,
          fontSize: DRAWING_DEFAULTS.TEXT_FONT_SIZE_PX,
          color: color ?? DRAWING_DEFAULTS.TEXT_COLOR,
        };
        onTextSpawn(spawned);
        return;
      }

      setIsDrawing(true);

      if (activeTool === 'pen' || activeTool === 'eraser') {
        inProgressRef.current = {
          kind: 'path',
          tool: activeTool,
          points: [pos],
        };
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          setPathContextStyles(ctx, activeTool);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        }
        return;
      }

      if (activeTool === 'rect' || activeTool === 'ellipse') {
        inProgressRef.current = {
          kind: activeTool,
          x0: pos.x,
          y0: pos.y,
          x1: pos.x,
          y1: pos.y,
        };
        return;
      }

      // line / arrow
      inProgressRef.current = {
        kind: activeTool,
        x1: pos.x,
        y1: pos.y,
        x2: pos.x,
        y2: pos.y,
      };
    },
    [
      disabled,
      getPos,
      canvasRef,
      setPathContextStyles,
      activeTool,
      onTextSpawn,
      generateId,
      nextZ,
      color,
    ]
  );

  const redrawWithInProgress = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, objects, inProgressRef.current);
  }, [canvasRef, draw, objects]);

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isDrawing) return;
      const pos = getPos(e);
      const inProgress = inProgressRef.current;
      if (!inProgress) return;

      if (inProgress.kind === 'path') {
        inProgress.points.push(pos);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && inProgress.points.length > 1) {
          setPathContextStyles(ctx, inProgress.tool);
          const prev = inProgress.points[inProgress.points.length - 2];
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
        return;
      }

      if (inProgress.kind === 'rect' || inProgress.kind === 'ellipse') {
        inProgress.x1 = pos.x;
        inProgress.y1 = pos.y;
      } else if (inProgress.kind === 'line' || inProgress.kind === 'arrow') {
        inProgress.x2 = pos.x;
        inProgress.y2 = pos.y;
      }
      // Shape preview re-renders the full scene; pen/eraser intentionally
      // skip this to avoid clearing every prior in-flight stroke segment.
      redrawWithInProgress();
    },
    [
      disabled,
      isDrawing,
      getPos,
      canvasRef,
      setPathContextStyles,
      redrawWithInProgress,
    ]
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const inProgress = inProgressRef.current;
    inProgressRef.current = null;
    if (!inProgress) return;

    if (inProgress.kind === 'path') {
      if (inProgress.points.length > 1) {
        // Eraser strokes still need a color string on the persisted object so
        // the renderer recognises them; using the literal 'eraser' keeps
        // dispatcher logic identical for pen-mode rehydration.
        const persistedColor = inProgress.tool === 'eraser' ? 'eraser' : color;
        const completed: PathObject = {
          id: generateId(),
          kind: 'path',
          z: nextZ,
          points: inProgress.points,
          color: persistedColor,
          width,
        };
        onObjectComplete(completed);
      }
      return;
    }

    switch (inProgress.kind) {
      case 'rect':
      case 'ellipse': {
        const x = Math.min(inProgress.x0, inProgress.x1);
        const y = Math.min(inProgress.y0, inProgress.y1);
        const w = Math.abs(inProgress.x1 - inProgress.x0);
        const h = Math.abs(inProgress.y1 - inProgress.y0);
        if (w === 0 && h === 0) return; // degenerate
        const fill = shapeFill ? color : undefined;
        if (inProgress.kind === 'rect') {
          const completed: RectObject = {
            id: generateId(),
            kind: 'rect',
            z: nextZ,
            x,
            y,
            w,
            h,
            stroke: color,
            strokeWidth: width,
            fill,
          };
          onObjectComplete(completed);
        } else {
          const completed: EllipseObject = {
            id: generateId(),
            kind: 'ellipse',
            z: nextZ,
            x,
            y,
            w,
            h,
            stroke: color,
            strokeWidth: width,
            fill,
          };
          onObjectComplete(completed);
        }
        return;
      }
      case 'line':
      case 'arrow': {
        const { x1, y1, x2, y2 } = inProgress;
        if (x1 === x2 && y1 === y2) return; // degenerate
        if (inProgress.kind === 'line') {
          const completed: LineObject = {
            id: generateId(),
            kind: 'line',
            z: nextZ,
            x1,
            y1,
            x2,
            y2,
            stroke: color,
            strokeWidth: width,
          };
          onObjectComplete(completed);
        } else {
          const completed: ArrowObject = {
            id: generateId(),
            kind: 'arrow',
            z: nextZ,
            x1,
            y1,
            x2,
            y2,
            stroke: color,
            strokeWidth: width,
          };
          onObjectComplete(completed);
        }
        return;
      }
    }
  }, [isDrawing, onObjectComplete, color, width, generateId, nextZ, shapeFill]);

  return { handleStart, handleMove, handleEnd, isDrawing };
};

// --- Object dispatcher ---

const renderObject = (
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

// Live-preview renderer for the in-flight shape. Uses the same renderers as
// committed objects so what-you-see-is-what-you-get during the drag.
const renderInProgress = (
  ctx: CanvasRenderingContext2D,
  inProgress: InProgress,
  color: string,
  width: number,
  shapeFill: boolean
): void => {
  if (inProgress.kind === 'path') {
    renderPathPoints(
      ctx,
      inProgress.points,
      inProgress.tool === 'eraser' ? 'eraser' : color,
      width
    );
    return;
  }

  switch (inProgress.kind) {
    case 'rect':
    case 'ellipse': {
      const x = Math.min(inProgress.x0, inProgress.x1);
      const y = Math.min(inProgress.y0, inProgress.y1);
      const w = Math.abs(inProgress.x1 - inProgress.x0);
      const h = Math.abs(inProgress.y1 - inProgress.y0);
      const fill = shapeFill ? color : undefined;
      if (inProgress.kind === 'rect') {
        renderRect(ctx, {
          id: '__preview__',
          kind: 'rect',
          z: 0,
          x,
          y,
          w,
          h,
          stroke: color,
          strokeWidth: width,
          fill,
        });
      } else {
        renderEllipse(ctx, {
          id: '__preview__',
          kind: 'ellipse',
          z: 0,
          x,
          y,
          w,
          h,
          stroke: color,
          strokeWidth: width,
          fill,
        });
      }
      return;
    }
    case 'line':
    case 'arrow': {
      const { x1, y1, x2, y2 } = inProgress;
      const base = {
        id: '__preview__',
        z: 0,
        x1,
        y1,
        x2,
        y2,
        stroke: color,
        strokeWidth: width,
      } as const;
      if (inProgress.kind === 'line') {
        renderLine(ctx, { ...base, kind: 'line' });
      } else {
        renderArrow(ctx, { ...base, kind: 'arrow' });
      }
      return;
    }
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

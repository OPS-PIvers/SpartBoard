import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Path, Point } from '@/types';

interface AnnotationCanvasProps {
  paths: Path[];
  color: string;
  width: number;
  canvasWidth: number;
  canvasHeight: number;
  onPathsChange: (paths: Path[]) => void;
  className?: string;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  paths,
  color,
  width,
  canvasWidth,
  canvasHeight,
  onPathsChange,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Guards against double-commit when both the canvas's onPointerUp handler (handleEnd)
  // and the window-level fallback listener (commit) fire for the same pointerup event.
  // Both handlers see isDrawing=true from their stale closures because React's setState
  // is async and not visible within the same synchronous event dispatch. This ref is set
  // synchronously by whichever handler runs first, making the second a no-op.
  const committedRef = useRef(false);

  // Mirror the latest drawing state + props into a ref so the window-level
  // pointerup/pointercancel safety-net listeners can read current values without
  // being torn down and re-registered on every pointer move (currentPath changes
  // on each move). Assigning in the render body keeps the ref in sync with the
  // latest render per React's "ref synchronization" guidance — an effect would
  // commit too late and risk a stale closure inside the listeners.
  const drawingStateRef = useRef({
    currentPath,
    paths,
    color,
    width,
    onPathsChange,
  });
  // Intentional render-body ref sync (see comment above): the listeners read
  // this lazily on pointerup, never during render, so the value is always the
  // latest committed render. react-hooks/refs can't tell that apart from a
  // render-time read, so disable it for this single assignment.
  // eslint-disable-next-line react-hooks/refs
  drawingStateRef.current = {
    currentPath,
    paths,
    color,
    width,
    onPathsChange,
  };

  // Draw function
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, allPaths: Path[], current: Point[]) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const renderPath = (p: Path) => {
        if (p.points.length === 0) return;
        ctx.beginPath();

        if (p.color === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = p.color;
          ctx.fillStyle = p.color;
        }

        ctx.lineWidth = p.width;

        if (p.points.length === 1) {
          ctx.arc(p.points[0].x, p.points[0].y, p.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(p.points[0].x, p.points[0].y);
          for (let i = 1; i < p.points.length; i++) {
            ctx.lineTo(p.points[i].x, p.points[i].y);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      };

      allPaths.forEach(renderPath);
      if (current.length > 0) {
        renderPath({ points: current, color, width });
      }
    },
    [color, width]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle resolution
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    draw(ctx, paths, currentPath);
  }, [paths, currentPath, canvasWidth, canvasHeight, draw]);

  const getPos = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleStart = (e: React.PointerEvent) => {
    // Prevent dragging the window (parent DraggableWindow)
    e.stopPropagation();

    const targetElement = e.currentTarget as HTMLElement;
    try {
      targetElement.setPointerCapture(e.pointerId);
    } catch (_err) {
      // Drawing still proceeds without capture — the window-level
      // pointerup/pointercancel listener below catches the release
      // when capture isn't available (older Safari touch, iframe
      // contexts, security-restricted environments). Refusing to
      // draw at all would lock those users out of annotations.
      console.warn('Failed to set pointer capture in AnnotationCanvas:', _err);
    }

    committedRef.current = false;
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentPath([pos]);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.stopPropagation();
    const pos = getPos(e);
    setCurrentPath((prev) => [...prev, pos]);
  };

  const handleEnd = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    // Guard: mark committed synchronously so the window-level fallback listener
    // (commit) is a no-op if it fires for the same event. Both handlers see
    // isDrawing=true from stale closures because setState is async.
    if (committedRef.current) return;
    committedRef.current = true;
    e.stopPropagation();

    const targetElement = e.currentTarget as HTMLElement;
    try {
      if (targetElement.hasPointerCapture(e.pointerId)) {
        targetElement.releasePointerCapture(e.pointerId);
      }
    } catch (_err) {
      // Ignore
    }

    setIsDrawing(false);
    if (currentPath.length > 0) {
      const newPath: Path = { points: currentPath, color, width };
      onPathsChange([...paths, newPath]);
    }
    setCurrentPath([]);
  };

  // Window-level pointerup/pointercancel safety net. The element-level
  // handleEnd is the primary completion path when setPointerCapture
  // succeeds; this listener catches the release when capture failed
  // (older Safari touch, iframe contexts, security-restricted
  // environments) so the stroke can always finalize. Active only while
  // a stroke is in progress so the listeners don't outlive the gesture.
  //
  // committedRef prevents double-commit: when capture succeeds, pointerup
  // bubbles to window AFTER handleEnd fires (React root delegation runs
  // before window listeners in the bubbling order). Both handlers see
  // isDrawing=true from stale closures because setState is async. The ref
  // is set synchronously in whichever handler fires first, making the
  // second a no-op.
  useEffect(() => {
    if (!isDrawing) return;
    const commit = () => {
      if (committedRef.current) return;
      committedRef.current = true;
      setIsDrawing(false);
      const {
        currentPath: cPath,
        paths: pList,
        color: col,
        width: w,
        onPathsChange: onChange,
      } = drawingStateRef.current;
      if (cPath.length > 0) {
        onChange([...pList, { points: cPath, color: col, width: w }]);
      }
      setCurrentPath([]);
    };
    window.addEventListener('pointerup', commit);
    window.addEventListener('pointercancel', commit);
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [isDrawing]);

  return (
    <canvas
      ref={canvasRef}
      className={`touch-none cursor-crosshair ${className ?? ''}`}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      style={{ touchAction: 'none' }}
    />
  );
};

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
  useEffect(() => {
    if (!isDrawing) return;
    const commit = () => {
      setIsDrawing(false);
      if (currentPath.length > 0) {
        onPathsChange([...paths, { points: currentPath, color, width }]);
      }
      setCurrentPath([]);
    };
    window.addEventListener('pointerup', commit);
    window.addEventListener('pointercancel', commit);
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [isDrawing, currentPath, paths, color, width, onPathsChange]);

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

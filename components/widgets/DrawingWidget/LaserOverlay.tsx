import React, {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { Point } from '@/types';
import type { DrawingView } from './viewport';

export const LASER_FADE_MS = 1000;
const LASER_COLOR = '239, 68, 68';
const LASER_WIDTH = 5;

interface TrailPoint extends Point {
  t: number;
}

export interface LaserOverlayHandle {
  start: (p: Point) => void;
  add: (p: Point) => void;
  end: () => void;
}

interface LaserOverlayProps {
  canvasSize: { width: number; height: number };
  view: DrawingView;
}

/** Laser pointer trail that fades after a second. Lives on its own canvas and is never saved. */
export const LaserOverlay = forwardRef<LaserOverlayHandle, LaserOverlayProps>(
  ({ canvasSize, view }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const trailsRef = useRef<TrailPoint[][]>([]);
    const activeRef = useRef<TrailPoint[] | null>(null);
    const frameRef = useRef<number | null>(null);
    const viewRef = useRef(view);
    useLayoutEffect(() => {
      viewRef.current = view;
    }, [view]);

    const paint = useCallback(() => {
      frameRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const now = performance.now();
      const v = viewRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const trail of trailsRef.current) {
        const live = trail.findIndex((p) => now - p.t < LASER_FADE_MS);
        trail.splice(0, live < 0 ? trail.length : live);
      }
      trailsRef.current = trailsRef.current.filter((t) => t.length > 0);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = LASER_WIDTH;
      ctx.shadowColor = `rgba(${LASER_COLOR}, 0.8)`;
      ctx.shadowBlur = 8;
      for (const trail of trailsRef.current) {
        const toBox = (p: Point) => ({
          x: p.x * v.zoom + v.x,
          y: p.y * v.zoom + v.y,
        });
        if (trail.length === 1) {
          const b = toBox(trail[0]);
          const a = 1 - (now - trail[0].t) / LASER_FADE_MS;
          ctx.fillStyle = `rgba(${LASER_COLOR}, ${a})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, LASER_WIDTH / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        for (let i = 1; i < trail.length; i++) {
          const a = 1 - (now - trail[i].t) / LASER_FADE_MS;
          const p0 = toBox(trail[i - 1]);
          const p1 = toBox(trail[i]);
          ctx.strokeStyle = `rgba(${LASER_COLOR}, ${a})`;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (trailsRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(paint);
      }
    }, []);

    const schedule = useCallback(() => {
      frameRef.current ??= requestAnimationFrame(paint);
    }, [paint]);

    useEffect(
      () => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      },
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        start: (p) => {
          const trail = [{ ...p, t: performance.now() }];
          activeRef.current = trail;
          trailsRef.current.push(trail);
          schedule();
        },
        add: (p) => {
          const trail = activeRef.current;
          if (!trail) return;
          trail.push({ ...p, t: performance.now() });
          // A pointer held still past the fade emptied this trail; bring it back.
          if (!trailsRef.current.includes(trail)) trailsRef.current.push(trail);
          schedule();
        },
        end: () => {
          activeRef.current = null;
        },
      }),
      [schedule]
    );

    return (
      <canvas
        ref={canvasRef}
        aria-hidden
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    );
  }
);

LaserOverlay.displayName = 'LaserOverlay';

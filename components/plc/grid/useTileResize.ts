import { useCallback, useRef } from 'react';
import {
  GRID_COLS,
  GRID_MIN_H,
  GRID_MIN_W,
  GRID_MAX_H,
  GRID_MAX_Y,
} from './tileGridMath';
import type { PlcGridCoords } from '@/types';

/** Directions a resize handle can pull. */
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface CellMetrics {
  /** Pixel width of a single grid cell (column width). */
  cellW: number;
  /** Pixel height of a single grid row. */
  cellH: number;
}

interface UseTileResizeArgs {
  /** The tile's current persisted coords. */
  coords: PlcGridCoords;
  /** Latest cell metrics — read at gesture start (column width follows
   *  ResizeObserver in the grid container). */
  getMetrics: () => CellMetrics;
  /** Called for every rAF frame with the in-flight ghost coords. The
   *  grid uses this to render the snap preview without committing. */
  onPreview: (next: PlcGridCoords | null) => void;
  /** Called once on pointerup with the final coords. Skipped if no change. */
  onCommit: (next: PlcGridCoords) => void;
}

/**
 * Pointer-Events + rAF resize gesture for a single PLC grid tile. Modeled
 * on `components/common/DraggableWindow.tsx`'s `handleResizeStart`
 * (`:1159-1378`) but adapted for cell-snapped output instead of
 * pixel-accurate widget bounds.
 *
 * Returns a single `onResizePointerDown(direction)(event)` handler factory
 * so the consuming tile can mount it on each of the 8 resize handles.
 *
 * Note: the hook deliberately doesn't read `coords` reactively after
 * gesture start — pointer captures behave best when the math is stable
 * across the gesture. The current `coords` are snapshotted into the
 * pointer-move closure on pointerdown.
 */
export function useTileResize({
  coords,
  getMetrics,
  onPreview,
  onCommit,
}: UseTileResizeArgs) {
  const activePointerIdRef = useRef<number | null>(null);

  const onResizePointerDown = useCallback(
    (direction: ResizeDirection) => (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== null) return;
      e.preventDefault();
      e.stopPropagation();

      const metrics = getMetrics();
      if (metrics.cellW <= 0 || metrics.cellH <= 0) return;

      const target = e.currentTarget;
      const pointerId = e.pointerId;
      activePointerIdRef.current = pointerId;

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startCoords = { ...coords };

      try {
        target.setPointerCapture(pointerId);
      } catch {
        // No-op — most browsers; pointer capture is best-effort.
      }

      document.body.classList.add('is-resizing-plc-tile');

      let frame: number | null = null;
      let latest: PlcGridCoords | null = null;

      const compute = (clientX: number, clientY: number): PlcGridCoords => {
        // Pixel delta → cell delta (rounded). Negative deltas reduce the
        // anchored edge; positive deltas grow it.
        const dxCells = Math.round((clientX - startClientX) / metrics.cellW);
        const dyCells = Math.round((clientY - startClientY) / metrics.cellH);

        let x = startCoords.x;
        let y = startCoords.y;
        let w = startCoords.w;
        let h = startCoords.h;

        if (direction.includes('e')) {
          w = clampW(startCoords.w + dxCells, x);
        }
        if (direction.includes('w')) {
          const desiredW = startCoords.w - dxCells;
          if (desiredW >= GRID_MIN_W) {
            w = desiredW;
            x = clampX(startCoords.x + dxCells, w);
            // If x got clamped, w must shrink to compensate.
            const overshootW = startCoords.x + dxCells - x;
            if (overshootW < 0) {
              w = Math.max(GRID_MIN_W, w + overshootW);
            }
          } else {
            // Tried to shrink past minimum — pin to min, anchor east edge.
            w = GRID_MIN_W;
            x = startCoords.x + startCoords.w - GRID_MIN_W;
          }
        }
        if (direction.includes('s')) {
          h = clampH(startCoords.h + dyCells);
        }
        if (direction.includes('n')) {
          const desiredH = startCoords.h - dyCells;
          if (desiredH >= GRID_MIN_H) {
            h = desiredH;
            y = Math.max(0, startCoords.y + dyCells);
            const overshootH = startCoords.y + dyCells - y;
            if (overshootH < 0) {
              h = Math.max(GRID_MIN_H, h + overshootH);
            }
          } else {
            h = GRID_MIN_H;
            y = startCoords.y + startCoords.h - GRID_MIN_H;
          }
        }

        return {
          x: clampX(x, w),
          y: Math.min(GRID_MAX_Y, Math.max(0, y)),
          w: clampW(w, x),
          h: clampH(h),
        };
      };

      const flush = () => {
        frame = null;
        if (latest) onPreview(latest);
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        latest = compute(moveEvent.clientX, moveEvent.clientY);
        frame ??= requestAnimationFrame(flush);
      };

      const cleanup = () => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        document.body.classList.remove('is-resizing-plc-tile');
        activePointerIdRef.current = null;
        try {
          if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
          }
        } catch {
          // Pointer capture release errors are non-fatal.
        }
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        cleanup();
        onPreview(null);
        if (
          latest &&
          (latest.x !== startCoords.x ||
            latest.y !== startCoords.y ||
            latest.w !== startCoords.w ||
            latest.h !== startCoords.h)
        ) {
          onCommit(latest);
        }
      };

      const onCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        cleanup();
        onPreview(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [coords, getMetrics, onPreview, onCommit]
  );

  return { onResizePointerDown };
}

function clampX(x: number, w: number): number {
  return Math.min(Math.max(0, x), GRID_COLS - w);
}

function clampW(w: number, x: number): number {
  return Math.min(Math.max(GRID_MIN_W, w), GRID_COLS - x);
}

function clampH(h: number): number {
  return Math.min(Math.max(GRID_MIN_H, h), GRID_MAX_H);
}

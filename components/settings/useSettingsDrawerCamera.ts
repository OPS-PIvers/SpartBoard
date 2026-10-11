// Auto-pan and camera restore for the settings drawer (§3 board behavior, §4.8,
// D3/D24). Local-only: a remote `flipped` snapshot never moves this tab's camera.

import { useEffect, useRef } from 'react';
import { clampPan, viewportToWrapper, type Point } from '@/utils/zoomPanMath';
import { requestPan, getPan } from './panSetterRegistry';
import type { DrawerPlacement, DrawerRect } from './useSettingsDrawerPlacement';

const PAN_DURATION_MS = 220;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ComputeDrawerPanArgs {
  rect: DrawerRect;
  currentPan: Point;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  drawerWidth: number;
  side: 'right' | 'left';
}

/** Pan that fits the widget in the free band beside the drawer; never zooms. */
export const computeDrawerPan = ({
  rect,
  currentPan,
  zoom,
  viewportWidth,
  viewportHeight,
  drawerWidth,
  side,
}: ComputeDrawerPanArgs): Point => {
  const band =
    side === 'right'
      ? { min: 0, max: viewportWidth - drawerWidth }
      : { min: drawerWidth, max: viewportWidth };
  const bandWidth = band.max - band.min;
  // Wider than the band: align its left edge rather than zooming out.
  const targetLeft =
    rect.width > bandWidth
      ? band.min
      : Math.min(Math.max(rect.left, band.min), band.max - rect.width);
  const wrapperX = viewportToWrapper(
    { x: rect.left, y: rect.top },
    zoom,
    currentPan,
    viewportWidth,
    viewportHeight
  ).x;
  const panX =
    targetLeft - (viewportWidth / 2 + (wrapperX - viewportWidth / 2) * zoom);
  return clampPan(
    { x: panX, y: currentPan.y },
    zoom,
    viewportWidth,
    viewportHeight
  );
};

export interface UseSettingsDrawerCameraArgs {
  widgetId: string | null;
  open: boolean;
  /** Only the tab that opened the drawer pans; remote snapshot flips never do. */
  originatedLocally: boolean;
  placement: DrawerPlacement;
  needsPan: boolean;
  rect: DrawerRect | null;
  drawerWidth: number;
  zoom?: number;
  boardId?: string | null;
  /** Pass false when the widget's own drag/resize closed the drawer: no restore. */
  restoreOnClose?: boolean;
}

export const useSettingsDrawerCamera = ({
  widgetId,
  open,
  originatedLocally,
  placement,
  needsPan,
  rect,
  drawerWidth,
  zoom = 1,
  boardId = null,
  restoreOnClose = true,
}: UseSettingsDrawerCameraArgs): void => {
  const savedPanRef = useRef<Point | null>(null);
  const userPannedRef = useRef(false);
  const discardedRef = useRef(false);
  const programmaticRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const panStartedRef = useRef(false);

  const openBoardIdRef = useRef<string | null>(null);
  const boardIdRef = useRef<string | null>(boardId);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, read only in handlers/effects
  boardIdRef.current = boardId;
  const wasOpenRef = useRef(false);

  const animate = (to: Point): void => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const from: Point = getPan() ?? { x: 0, y: 0 };
    const finish = () => {
      frameRef.current = null;
      // Keep the programmatic window open for one more frame: `board-pan`
      // fires from an effect after the commit that applied the last frame.
      requestAnimationFrame(() => {
        programmaticRef.current = false;
      });
    };
    if (prefersReducedMotion()) {
      programmaticRef.current = true;
      requestPan(to);
      finish();
      return;
    }
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / PAN_DURATION_MS);
      const e = easeOutCubic(t);
      programmaticRef.current = true;
      requestPan({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      });
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        finish();
      }
    };
    frameRef.current = requestAnimationFrame(step);
  };
  // Session lifecycle: listeners while open; the restore runs in the close
  // effect below so it reads the current restoreOnClose / boardId props.
  useEffect(() => {
    if (!open || !widgetId) return;
    savedPanRef.current = null;
    userPannedRef.current = false;
    discardedRef.current = false;
    panStartedRef.current = false;
    wasOpenRef.current = true;
    openBoardIdRef.current = boardIdRef.current;

    const onBoardPan = () => {
      if (programmaticRef.current) return;
      userPannedRef.current = true;
    };
    const onCameraReset = () => {
      discardedRef.current = true;
    };
    window.addEventListener('board-pan', onBoardPan);
    window.addEventListener('camera-reset', onCameraReset);

    return () => {
      window.removeEventListener('board-pan', onBoardPan);
      window.removeEventListener('camera-reset', onCameraReset);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      programmaticRef.current = false;
    };
  }, [open, widgetId]);

  // Close: restore the pre-open camera unless the teacher owns it now.
  useEffect(() => {
    if (open || !wasOpenRef.current) return;
    wasOpenRef.current = false;
    const saved = savedPanRef.current;
    savedPanRef.current = null;
    if (!saved || !restoreOnClose) return;
    if (userPannedRef.current || discardedRef.current) return;
    if (boardId !== openBoardIdRef.current) return;
    animate(saved);
  }, [open, restoreOnClose, boardId]);

  // Auto-pan once per open, after the placement hook has measured the rect.
  useEffect(() => {
    if (!open || !widgetId || panStartedRef.current) return;
    if (!originatedLocally || !needsPan || !rect || placement === 'bottom') {
      return;
    }
    panStartedRef.current = true;
    const prev = getPan() ?? { x: 0, y: 0 };
    savedPanRef.current = prev;
    const target = computeDrawerPan({
      rect,
      currentPan: prev,
      zoom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      drawerWidth,
      side: placement,
    });
    animate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawerWidth/zoom must not re-run the pan (D24)
  }, [open, widgetId, originatedLocally, needsPan, rect, placement]);
};

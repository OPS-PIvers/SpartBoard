import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Canvas zoom relative to the fitted frame, and pan in screen px. */
export interface CanvasView {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const FIT_VIEW: CanvasView = { zoom: 1, x: 0, y: 0 };

const clampZoom = (z: number) => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);

/** Zooms to `zoom` keeping the viewport-local point `at` fixed on screen. */
export function zoomAround(
  view: CanvasView,
  zoom: number,
  at: { x: number; y: number }
): CanvasView {
  const z = clampZoom(zoom);
  if (z === MIN_ZOOM) return FIT_VIEW;
  const f = z / view.zoom;
  return {
    zoom: z,
    x: at.x - (at.x - view.x) * f,
    y: at.y - (at.y - view.y) * f,
  };
}

/** CSS transform for the zoomed content inside the viewport. */
export const viewTransform = (v: CanvasView): string =>
  `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;

/** Wheel delta to a zoom factor; trackpad pinch arrives as ctrl+wheel. */
export const wheelZoomFactor = (deltaY: number): number =>
  Math.exp(-deltaY * 0.002);

/** Ctrl/⌘+wheel zoom around the pointer and Space+drag or middle-drag pan, outside the device frame. */
export function useCanvasViewport(resetKey: string) {
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<CanvasView>(FIT_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; view: CanvasView } | null>(
    null
  );
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setView(FIT_VIEW);
  }

  useEffect(() => {
    if (!rootEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = rootEl.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setView((v) => zoomAround(v, v.zoom * wheelZoomFactor(e.deltaY), at));
    };
    // Non-passive so the browser's page zoom never fires.
    rootEl.addEventListener('wheel', onWheel, { passive: false });
    return () => rootEl.removeEventListener('wheel', onWheel);
  }, [rootEl]);

  useEffect(() => {
    if (!spaceHeld) return;
    const release = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keyup', release, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keyup', release, true);
      window.removeEventListener('blur', blur);
    };
  }, [spaceHeld]);

  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!(spaceHeld && e.button === 0) && e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, view };
      setPanning(true);
    },
    [spaceHeld, view]
  );
  const onPointerMoveCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const start = panRef.current;
      if (!start) return;
      e.stopPropagation();
      setView({
        ...start.view,
        x: start.view.x + e.clientX - start.x,
        y: start.view.y + e.clientY - start.y,
      });
    },
    []
  );
  const onPointerUpCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!panRef.current) return;
      e.stopPropagation();
      panRef.current = null;
      setPanning(false);
    },
    []
  );

  const centre = useCallback(
    () =>
      rootEl
        ? { x: rootEl.clientWidth / 2, y: rootEl.clientHeight / 2 }
        : { x: 0, y: 0 },
    [rootEl]
  );
  const fit = useCallback(() => setView(FIT_VIEW), []);
  /** True pixel size, given the frame's fitted scale `k`. */
  const actualSize = useCallback(
    (k: number) => setView((v) => zoomAround(v, k > 0 ? 1 / k : 1, centre())),
    [centre]
  );
  const zoomBy = useCallback(
    (factor: number) =>
      setView((v) => zoomAround(v, v.zoom * factor, centre())),
    [centre]
  );

  return {
    rootEl,
    attachRoot: setRootEl,
    view,
    spaceHeld,
    setSpaceHeld,
    panning,
    fit,
    actualSize,
    zoomBy,
    panHandlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onPointerCancelCapture: onPointerUpCapture,
    },
  };
}

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

export interface Pt {
  x: number;
  y: number;
}

const midpoint = (a: Pt, b: Pt): Pt => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** Finger-spread ratio since the pinch began. */
export const pinchRatio = (a0: Pt, b0: Pt, a1: Pt, b1: Pt): number => {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  return d0 > 0 ? Math.hypot(a1.x - b1.x, a1.y - b1.y) / d0 : 1;
};

/** Pinch and two-finger pan: the content under the start midpoint stays under the fingers. */
export function pinchView(
  start: CanvasView,
  a0: Pt,
  b0: Pt,
  a1: Pt,
  b1: Pt
): CanvasView {
  const zoom = clampZoom(start.zoom * pinchRatio(a0, b0, a1, b1));
  const m0 = midpoint(a0, b0);
  const m1 = midpoint(a1, b1);
  return {
    zoom,
    x: m1.x - ((m0.x - start.x) / start.zoom) * zoom,
    y: m1.y - ((m0.y - start.y) / start.zoom) * zoom,
  };
}

/** A pinch that closed down to 100% snaps back to the fitted view. */
export const settlePinch = (view: CanvasView, ratio: number): CanvasView =>
  view.zoom <= MIN_ZOOM && ratio < 1 ? FIT_VIEW : view;

interface Pinch {
  a: number;
  b: number;
  a0: Pt;
  b0: Pt;
  view: CanvasView;
  ratio: number;
}

/** Ctrl/⌘+wheel zoom around the pointer, Space+drag or middle-drag pan, and touch pinch and two-finger pan. */
export function useCanvasViewport(resetKey: string) {
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<CanvasView>(FIT_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; view: CanvasView } | null>(
    null
  );
  const touchesRef = useRef(new Map<number, Pt>());
  const pinchRef = useRef<Pinch | null>(null);
  // Fingers left down after a pinch stay the pinch's until lifted.
  const spentRef = useRef(new Set<number>());
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
      if (e.pointerType === 'touch') {
        const touches = touchesRef.current;
        // A primary touch starts a fresh sequence, so fingers lifted off-canvas are forgotten.
        if (e.isPrimary !== false) {
          touches.clear();
          spentRef.current.clear();
          pinchRef.current = null;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        touches.set(e.pointerId, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        // The second finger reaches the edit layer as non-primary, which cancels its gesture.
        if (touches.size === 2 && !pinchRef.current && !panRef.current) {
          const [[a, a0], [b, b0]] = [...touches];
          pinchRef.current = { a, b, a0, b0, view, ratio: 1 };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
        return;
      }
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
      const touches = touchesRef.current;
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        const rect = e.currentTarget.getBoundingClientRect();
        touches.set(e.pointerId, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
      const pinch = pinchRef.current;
      if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
        e.stopPropagation();
        const a1 = touches.get(pinch.a) ?? pinch.a0;
        const b1 = touches.get(pinch.b) ?? pinch.b0;
        pinch.ratio = pinchRatio(pinch.a0, pinch.b0, a1, b1);
        setView(pinchView(pinch.view, pinch.a0, pinch.b0, a1, b1));
        return;
      }
      if (spentRef.current.has(e.pointerId)) {
        e.stopPropagation();
        return;
      }
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
      touchesRef.current.delete(e.pointerId);
      const pinch = pinchRef.current;
      if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
        e.stopPropagation();
        pinchRef.current = null;
        const other = e.pointerId === pinch.a ? pinch.b : pinch.a;
        if (touchesRef.current.has(other)) spentRef.current.add(other);
        setView((v) => settlePinch(v, pinch.ratio));
        return;
      }
      if (spentRef.current.delete(e.pointerId)) {
        e.stopPropagation();
        return;
      }
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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export const clampZoom = (z: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Next preset step above (dir 1) or below (dir -1) a possibly off-step zoom. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 0.001;
  if (dir === 1) return ZOOM_STEPS.find((s) => s > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps) ?? MIN_ZOOM;
}

type Focal = { x: number; y: number };

/** Zoom for a scrollable stimulus viewport: buttons, Ctrl+wheel, touch pinch, optional mouse drag-pan. */
export function useStimulusZoom(options: { dragPan?: boolean } = {}) {
  const { dragPan = false } = options;
  const [zoom, setZoom] = useState(1);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const scrollerElRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const anchorRef = useRef<{ focal: Focal; ratio: number } | null>(null);

  const scrollerRef = useCallback((el: HTMLDivElement | null) => {
    scrollerElRef.current = el;
    setScroller(el);
  }, []);

  // Keep the point under the cursor or fingers fixed across a zoom.
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const el = scrollerElRef.current;
    if (!anchor || !el) return;
    const { focal, ratio } = anchor;
    el.scrollLeft = (el.scrollLeft + focal.x) * ratio - focal.x;
    el.scrollTop = (el.scrollTop + focal.y) * ratio - focal.y;
  }, [zoom]);

  const zoomTo = useCallback((next: number, focal?: Focal) => {
    const from = zoomRef.current;
    const to = clampZoom(next);
    if (Math.abs(to - from) < 0.001) return;
    const el = scrollerElRef.current;
    const at = focal ??
      (el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : null) ?? {
        x: 0,
        y: 0,
      };
    anchorRef.current = { focal: at, ratio: to / from };
    zoomRef.current = to;
    setZoom(to);
  }, []);

  useEffect(() => {
    if (!scroller) return;
    const focalOf = (clientX: number, clientY: number): Focal => {
      const r = scroller.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(
        zoomRef.current * Math.exp(-e.deltaY * 0.01),
        focalOf(e.clientX, e.clientY)
      );
    };

    let pinch: { dist: number; zoom: number } | null = null;
    const touchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = { dist: touchDist(e.touches), zoom: zoomRef.current };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = focalOf(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2
      );
      zoomTo(pinch.zoom * (touchDist(e.touches) / pinch.dist), mid);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };

    let drag: { x: number; y: number; left: number; top: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      const el = scrollerElRef.current;
      if (!el || !dragPan || e.pointerType !== 'mouse' || e.button !== 0)
        return;
      if (zoomRef.current <= 1) return;
      e.preventDefault();
      drag = {
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      const el = scrollerElRef.current;
      if (!drag || !el) return;
      el.scrollLeft = drag.left - (e.clientX - drag.x);
      el.scrollTop = drag.top - (e.clientY - drag.y);
    };
    const onPointerUp = () => {
      drag = null;
      const el = scrollerElRef.current;
      if (el) el.style.cursor = '';
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);
    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    scroller.addEventListener('pointercancel', onPointerUp);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerUp);
      scroller.removeEventListener('pointercancel', onPointerUp);
    };
  }, [scroller, zoomTo, dragPan]);

  return {
    zoom,
    scrollerRef,
    scroller,
    zoomIn: () => zoomTo(stepZoom(zoomRef.current, 1)),
    zoomOut: () => zoomTo(stepZoom(zoomRef.current, -1)),
    resetZoom: () => zoomTo(1),
  };
}

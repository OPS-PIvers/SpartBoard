import { useCallback, useEffect, useState } from 'react';

/** Fit-to-container is scale 1; the page never shrinks below its fit size. */
export const NOTEBOOK_MIN_ZOOM = 1;
export const NOTEBOOK_MAX_ZOOM = 8;
export const NOTEBOOK_ZOOM_STEP = 1.25;

export interface NotebookZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface NotebookZoom extends NotebookZoomState {
  /** Ref callback for the element the transform layer fills (clamp bounds). */
  setContainer: (el: HTMLDivElement | null) => void;
  /** The element `setContainer` last received, or null before mount. */
  container: HTMLDivElement | null;
  isZoomed: boolean;
  /** `transform` value for the zoom layer (pair with transform-origin 0 0). */
  transform: string;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  zoomAt: (clientX: number, clientY: number, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Keep the scaled layer covering the container so it can't be panned away. */
const clampOffsets = (
  state: NotebookZoomState,
  width: number,
  height: number
): NotebookZoomState => ({
  scale: state.scale,
  offsetX: clamp(state.offsetX, width * (1 - state.scale), 0),
  offsetY: clamp(state.offsetY, height * (1 - state.scale), 0),
});

const FIT: NotebookZoomState = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Zoom/pan model shared by the notebook viewer and page editor. `resetKey`
 * returns the view to fit whenever it changes (page or notebook switch).
 */
export const useNotebookZoom = (resetKey: string | number): NotebookZoom => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<NotebookZoomState>(FIT);
  const [prevKey, setPrevKey] = useState(resetKey);

  // Reset while rendering rather than in an effect (CLAUDE.md).
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    if (state !== FIT) setState(FIT);
  }

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = container?.getBoundingClientRect();
      if (!rect) return;
      setState((prev) => {
        const nextScale = clamp(
          prev.scale * factor,
          NOTEBOOK_MIN_ZOOM,
          NOTEBOOK_MAX_ZOOM
        );
        if (nextScale === prev.scale) return prev;
        const localX = (clientX - rect.left - prev.offsetX) / prev.scale;
        const localY = (clientY - rect.top - prev.offsetY) / prev.scale;
        return clampOffsets(
          {
            scale: nextScale,
            offsetX: clientX - rect.left - localX * nextScale,
            offsetY: clientY - rect.top - localY * nextScale,
          },
          rect.width,
          rect.height
        );
      });
    },
    [container]
  );

  // Step zoom anchors on the container's centre.
  const zoomByStep = useCallback(
    (factor: number) => {
      const rect = container?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt, container]
  );

  const zoomIn = useCallback(
    () => zoomByStep(NOTEBOOK_ZOOM_STEP),
    [zoomByStep]
  );
  const zoomOut = useCallback(
    () => zoomByStep(1 / NOTEBOOK_ZOOM_STEP),
    [zoomByStep]
  );
  const reset = useCallback(() => setState(FIT), []);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const rect = container?.getBoundingClientRect();
      if (!rect) return;
      setState((prev) =>
        clampOffsets(
          {
            scale: prev.scale,
            offsetX: prev.offsetX + dx,
            offsetY: prev.offsetY + dy,
          },
          rect.width,
          rect.height
        )
      );
    },
    [container]
  );

  return {
    ...state,
    setContainer,
    container,
    isZoomed: state.scale > 1,
    transform: `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`,
    zoomIn,
    zoomOut,
    reset,
    zoomAt,
    panBy,
  };
};

const touchDistance = (t: TouchList) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

const touchCentre = (t: TouchList) => ({
  x: (t[0].clientX + t[1].clientX) / 2,
  y: (t[0].clientY + t[1].clientY) / 2,
});

/**
 * Ctrl/Cmd + wheel (and trackpad pinch), two-finger touch pinch/pan, and
 * Ctrl/Cmd +/-/0 while the zoom container holds focus. The wheel listener is
 * non-passive and stops propagation so the board's own Ctrl+wheel zoom does
 * not fire at the same time.
 */
export const useNotebookZoomGestures = (zoom: NotebookZoom): void => {
  const { container: el, zoomAt, panBy, zoomIn, zoomOut, reset } = zoom;

  useEffect(() => {
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY === 0) return;
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    };

    let pinch: { distance: number; x: number; y: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const c = touchCentre(e.touches);
      pinch = { distance: touchDistance(e.touches), x: c.x, y: c.y };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const distance = touchDistance(e.touches);
      const c = touchCentre(e.touches);
      panBy(c.x - pinch.x, c.y - pinch.y);
      if (pinch.distance > 0) zoomAt(c.x, c.y, distance / pinch.distance);
      pinch = { distance, x: c.x, y: c.y };
    };

    const endPinch = () => {
      pinch = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!el.contains(document.activeElement)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch);
    el.addEventListener('touchcancel', endPinch);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [el, zoomAt, panBy, zoomIn, zoomOut, reset]);
};

export default useNotebookZoom;

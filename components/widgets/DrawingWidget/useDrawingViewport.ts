import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DrawableObject, Point } from '@/types';
import {
  IDENTITY_VIEW,
  boxToPage,
  clientToBox,
  fitView,
  pinchView,
  steppedZoom,
  visiblePageArea,
  wheelZoomFactor,
  zoomViewAround,
  type DrawingView,
} from './viewport';

interface UseDrawingViewportOptions {
  /** Flag off: no view, no gestures; the widget behaves as it always has. */
  enabled: boolean;
  pageId: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  objects: readonly DrawableObject[];
  /** A pinch or pan took the pointer: drop any stroke, erase or drag in progress. */
  onGestureTakeover: () => void;
}

interface Pinch {
  a: number;
  b: number;
  a0: Point;
  b0: Point;
  start: DrawingView;
}

/** Per-page zoom and pan for the whiteboard (never saved): Ctrl/Cmd+wheel, pinch, wheel, Space-drag, middle-drag and the Hand tool. */
export const useDrawingViewport = ({
  enabled,
  pageId,
  canvasRef,
  wrapperRef,
  canvasSize,
  objects,
  onGestureTakeover,
}: UseDrawingViewportOptions) => {
  const [views, setViews] = useState<Record<string, DrawingView>>({});
  const [handActive, setHandActive] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const view = enabled ? (views[pageId] ?? IDENTITY_VIEW) : undefined;

  const touchesRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<Pinch | null>(null);
  const pinchingRef = useRef(false);
  const panRef = useRef<{ id: number; last: Point } | null>(null);
  const latest = useRef({ canvasSize, pageId, onGestureTakeover });
  useLayoutEffect(() => {
    latest.current = { canvasSize, pageId, onGestureTakeover };
  });

  const updateView = useCallback((fn: (v: DrawingView) => DrawingView) => {
    const id = latest.current.pageId;
    setViews((prev) => ({ ...prev, [id]: fn(prev[id] ?? IDENTITY_VIEW) }));
  }, []);

  const toBox = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return clientToBox(
        canvas.getBoundingClientRect(),
        latest.current.canvasSize,
        clientX,
        clientY
      );
    },
    [canvasRef]
  );

  /** Box px per screen px, so drags pan at finger speed under any board zoom. */
  const boxPerScreen = useCallback((): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 1;
    return latest.current.canvasSize.width / rect.width;
  }, [canvasRef]);

  const clientToPage = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const box = toBox(clientX, clientY);
      return box && view ? boxToPage(view, box) : box;
    },
    [toBox, view]
  );

  const getVisibleArea = useCallback(
    () => visiblePageArea(view ?? IDENTITY_VIEW, latest.current.canvasSize),
    [view]
  );

  const center = (): Point => ({
    x: latest.current.canvasSize.width / 2,
    y: latest.current.canvasSize.height / 2,
  });
  const zoomIn = () =>
    updateView((v) => zoomViewAround(v, steppedZoom(v.zoom, 1), center()));
  const zoomOut = () =>
    updateView((v) => zoomViewAround(v, steppedZoom(v.zoom, -1), center()));
  const resetZoom = () => updateView(() => IDENTITY_VIEW);
  const fit = () => updateView(() => fitView(objects, canvasSize));

  useEffect(() => {
    const node = wrapperRef.current;
    if (!enabled || !node) return undefined;
    const onWheel = (e: WheelEvent) => {
      const box = toBox(e.clientX, e.clientY);
      if (!box) return;
      // Ours, not the board's: the board zooms on Ctrl+wheel too.
      e.preventDefault();
      e.stopPropagation();
      // Firefox mouse wheels report lines (deltaMode 1) or pages (2), not pixels.
      const unit =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? latest.current.canvasSize.height
            : 1;
      const deltaX = e.deltaX * unit;
      const deltaY = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        updateView((v) =>
          zoomViewAround(v, v.zoom * wheelZoomFactor(deltaY), box)
        );
        return;
      }
      const k = boxPerScreen();
      const dx = (e.shiftKey && deltaX === 0 ? deltaY : deltaX) * k;
      const dy = (e.shiftKey && deltaX === 0 ? 0 : deltaY) * k;
      updateView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [enabled, wrapperRef, toBox, boxPerScreen, updateView]);

  useEffect(() => {
    if (!spaceHeld) return undefined;
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

  /** Returns true when the key was a view shortcut. Typing in the text editor never counts. */
  const handleKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!enabled || e.target !== e.currentTarget) return false;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) setSpaceHeld(true);
      return true;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomIn();
      return true;
    }
    if (e.key === '-') {
      e.preventDefault();
      zoomOut();
      return true;
    }
    if (e.key === '0') {
      e.preventDefault();
      resetZoom();
      return true;
    }
    return false;
  };

  const capture = (el: Element, id: number) => {
    try {
      el.setPointerCapture?.(id);
    } catch {
      // A pointer that already ended can't be captured.
    }
  };

  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the drawing surface pans; the zoom buttons and text editor keep their clicks.
    if (!enabled || e.target !== canvasRef.current) return;
    if (e.pointerType === 'touch') {
      const touches = touchesRef.current;
      if (e.isPrimary) {
        touches.clear();
        pinchRef.current = null;
        pinchingRef.current = false;
      }
      const box = toBox(e.clientX, e.clientY);
      if (box) touches.set(e.pointerId, box);
      if (touches.size === 2 && view) {
        const [[a, a0], [b, b0]] = [...touches.entries()];
        pinchRef.current = { a, b, a0, b0, start: view };
        pinchingRef.current = true;
        panRef.current = null;
        setPanning(false);
        latest.current.onGestureTakeover();
        for (const id of touches.keys()) capture(e.currentTarget, id);
      }
      if (pinchingRef.current) {
        e.stopPropagation();
        return;
      }
    }
    if (handActive || spaceHeld || e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      panRef.current = {
        id: e.pointerId,
        last: { x: e.clientX, y: e.clientY },
      };
      setPanning(true);
      capture(e.currentTarget, e.pointerId);
    }
  };

  const onPointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const touches = touchesRef.current;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      const box = toBox(e.clientX, e.clientY);
      if (box) touches.set(e.pointerId, box);
    }
    const pinch = pinchRef.current;
    if (pinchingRef.current) {
      e.stopPropagation();
      const a1 = pinch ? touches.get(pinch.a) : undefined;
      const b1 = pinch ? touches.get(pinch.b) : undefined;
      if (pinch && a1 && b1) {
        const next = pinchView(pinch.start, pinch.a0, pinch.b0, a1, b1);
        updateView(() => next);
      }
      return;
    }
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      e.stopPropagation();
      const k = boxPerScreen();
      const dx = (e.clientX - pan.last.x) * k;
      const dy = (e.clientY - pan.last.y) * k;
      pan.last = { x: e.clientX, y: e.clientY };
      updateView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUpCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const touches = touchesRef.current;
    touches.delete(e.pointerId);
    if (pinchingRef.current) {
      e.stopPropagation();
      if (touches.size < 2) pinchRef.current = null;
      if (touches.size === 0) pinchingRef.current = false;
      return;
    }
    if (panRef.current?.id === e.pointerId) {
      e.stopPropagation();
      panRef.current = null;
      setPanning(false);
    }
  };

  return {
    view,
    handActive,
    setHandActive,
    grabbing: panning,
    grabReady: enabled && (handActive || spaceHeld),
    clientToPage,
    getVisibleArea,
    zoomIn,
    zoomOut,
    resetZoom,
    fit,
    handleKeyDown,
    pointerCaptureHandlers: enabled
      ? {
          onPointerDownCapture,
          onPointerMoveCapture,
          onPointerUpCapture,
          onPointerCancelCapture: onPointerUpCapture,
        }
      : {},
  };
};

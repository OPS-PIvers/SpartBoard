import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type DocCamRotation,
  type DocCamView,
  type Size,
  clampPan,
  clampZoom,
  nextRotation,
  normalizeRotation,
  stepZoom,
  zoomAt,
} from './docCamView';

const COMMIT_DELAY_MS = 400;

interface Options {
  enabled: boolean;
  savedZoom: number | undefined;
  savedRotation: number | undefined;
  onSave: (patch: { zoomLevel: number; rotation: DocCamRotation }) => void;
}

/** Document-camera zoom, pan and rotate for the Camera feed: buttons, wheel, drag and pinch. */
export function useDocCamView({
  enabled,
  savedZoom,
  savedRotation,
  onSave,
}: Options) {
  const [feedEl, setFeedEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [local, setLocal] = useState(() => ({
    zoom: clampZoom(savedZoom ?? 1),
    panX: 0,
    panY: 0,
  }));
  const [isPanning, setIsPanning] = useState(false);
  const rotation = normalizeRotation(savedRotation);
  const view: DocCamView = enabled
    ? clampPan({ ...local, rotation }, size)
    : { zoom: 1, rotation: 0, panX: 0, panY: 0 };

  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  useLayoutEffect(() => {
    viewRef.current = view;
    sizeRef.current = size;
  });

  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });
  const save = useCallback((zoom: number, rot: DocCamRotation) => {
    onSaveRef.current({ zoomLevel: zoom, rotation: rot });
  }, []);
  const scheduleSave = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      save(viewRef.current.zoom, viewRef.current.rotation);
    }, COMMIT_DELAY_MS);
  }, [save]);
  useEffect(
    () => () => {
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        save(viewRef.current.zoom, viewRef.current.rotation);
      }
    },
    [save]
  );

  useEffect(() => {
    if (!feedEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    });
    observer.observe(feedEl);
    return () => observer.disconnect();
  }, [feedEl]);

  const applyZoom = useCallback((zoom: number, focal = { x: 0, y: 0 }) => {
    const next = zoomAt(viewRef.current, zoom, focal, sizeRef.current);
    viewRef.current = next;
    setLocal({ zoom: next.zoom, panX: next.panX, panY: next.panY });
  }, []);

  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      applyZoom(stepZoom(viewRef.current.zoom, dir));
      save(viewRef.current.zoom, viewRef.current.rotation);
    },
    [applyZoom, save]
  );
  const zoomIn = useCallback(() => zoomBy(1), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-1), [zoomBy]);
  const rotate = useCallback(() => {
    save(viewRef.current.zoom, nextRotation(viewRef.current.rotation));
  }, [save]);
  const resetView = useCallback(() => {
    viewRef.current = { zoom: 1, rotation: 0, panX: 0, panY: 0 };
    setLocal({ zoom: 1, panX: 0, panY: 0 });
    save(1, 0);
  }, [save]);

  useEffect(() => {
    if (!enabled || !feedEl) return;
    const focalOf = (clientX: number, clientY: number) => {
      const r = feedEl.getBoundingClientRect();
      return {
        x: clientX - r.left - r.width / 2,
        y: clientY - r.top - r.height / 2,
      };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels as larger steps.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      applyZoom(viewRef.current.zoom * factor, focalOf(e.clientX, e.clientY));
      scheduleSave();
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; panX: number; panY: number } | null = null;
    let pinch: { dist: number; zoom: number } | null = null;
    const pinchDist = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const pinchMid = () => {
      const [a, b] = [...pointers.values()];
      return focalOf((a.x + b.x) / 2, (a.y + b.y) / 2);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.('button')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pan = null;
        setIsPanning(false);
        pinch = { dist: pinchDist(), zoom: viewRef.current.zoom };
        feedEl.setPointerCapture?.(e.pointerId);
        return;
      }
      if (pointers.size === 1 && viewRef.current.zoom > 1) {
        e.stopPropagation();
        pan = {
          x: e.clientX,
          y: e.clientY,
          panX: viewRef.current.panX,
          panY: viewRef.current.panY,
        };
        setIsPanning(true);
        feedEl.setPointerCapture?.(e.pointerId);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const dist = pinchDist();
        if (pinch.dist > 0) {
          applyZoom(pinch.zoom * (dist / pinch.dist), pinchMid());
        }
        return;
      }
      if (pan) {
        const next = clampPan(
          {
            ...viewRef.current,
            panX: pan.panX + (e.clientX - pan.x),
            panY: pan.panY + (e.clientY - pan.y),
          },
          sizeRef.current
        );
        viewRef.current = next;
        setLocal({ zoom: next.zoom, panX: next.panX, panY: next.panY });
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pinch && pointers.size < 2) {
        pinch = null;
        scheduleSave();
      }
      if (pointers.size === 0) {
        pan = null;
        setIsPanning(false);
      }
    };

    feedEl.addEventListener('wheel', onWheel, { passive: false });
    feedEl.addEventListener('pointerdown', onPointerDown);
    feedEl.addEventListener('pointermove', onPointerMove);
    feedEl.addEventListener('pointerup', onPointerUp);
    feedEl.addEventListener('pointercancel', onPointerUp);
    return () => {
      feedEl.removeEventListener('wheel', onWheel);
      feedEl.removeEventListener('pointerdown', onPointerDown);
      feedEl.removeEventListener('pointermove', onPointerMove);
      feedEl.removeEventListener('pointerup', onPointerUp);
      feedEl.removeEventListener('pointercancel', onPointerUp);
    };
  }, [enabled, feedEl, applyZoom, scheduleSave]);

  return {
    attachFeed: setFeedEl,
    size,
    view,
    isPanning,
    zoomIn,
    zoomOut,
    rotate,
    resetView,
  };
}

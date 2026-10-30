import React, {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut } from 'lucide-react';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
const ZOOM_STEPS = [1, 1.5, 2, 3];

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface Point {
  x: number;
  y: number;
}

interface PinchStart {
  zoom: number;
  distance: number;
  /** Unzoomed content point under the fingers' midpoint. */
  anchor: Point;
}

interface WhiteboardZoomFrameProps {
  children: React.ReactNode;
  /** Prep and review: one finger pans instead of drawing. */
  disabled: boolean;
  /** True while two fingers are down, so the canvas ignores them. */
  pinchingRef: React.RefObject<boolean>;
  /** A second finger landed: the canvas drops any stroke in progress. */
  onPinchStart: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const btn =
  'flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-40';

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** View-only zoom for the whiteboard page; ink stays in page coordinates. */
export const WhiteboardZoomFrame = forwardRef<
  HTMLDivElement,
  WhiteboardZoomFrameProps
>(
  (
    { children, disabled, pinchingRef, onPinchStart, className = '', style },
    contentRef
  ) => {
    const { t } = useTranslation();
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const zoomRef = useRef(MIN_ZOOM);
    const frameRef = useRef<HTMLDivElement>(null);
    const pendingScrollRef = useRef<Point | null>(null);
    const touchesRef = useRef(new Map<number, Point>());
    const pinchRef = useRef<PinchStart | null>(null);
    const panRef = useRef<Point | null>(null);

    const onPinchStartRef = useRef(onPinchStart);
    useLayoutEffect(() => {
      onPinchStartRef.current = onPinchStart;
    });

    const applyScroll = useCallback(() => {
      const frame = frameRef.current;
      const next = pendingScrollRef.current;
      if (!frame || !next) return;
      pendingScrollRef.current = null;
      frame.scrollLeft = next.x;
      frame.scrollTop = next.y;
    }, []);

    // Runs after the content resizes, so the new scroll offsets are in range.
    useLayoutEffect(applyScroll, [zoom, applyScroll]);

    /** Zooms so `anchor` (unzoomed content px) sits under `at` (frame px). */
    const setView = useCallback(
      (next: number, anchor: Point, at: Point) => {
        const z = clampZoom(next);
        pendingScrollRef.current = {
          x: anchor.x * z - at.x,
          y: anchor.y * z - at.y,
        };
        if (z === zoomRef.current) {
          applyScroll();
          return;
        }
        zoomRef.current = z;
        setZoom(z);
      },
      [applyScroll]
    );

    const frameAnchor = useCallback((client: Point | null) => {
      const frame = frameRef.current;
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      const at = client
        ? { x: client.x - rect.left, y: client.y - rect.top }
        : { x: frame.clientWidth / 2, y: frame.clientHeight / 2 };
      const z = zoomRef.current;
      return {
        at,
        anchor: {
          x: (frame.scrollLeft + at.x) / z,
          y: (frame.scrollTop + at.y) / z,
        },
      };
    }, []);

    const zoomAround = useCallback(
      (next: number, client: Point | null) => {
        const view = frameAnchor(client);
        if (view) setView(next, view.anchor, view.at);
      },
      [frameAnchor, setView]
    );

    const stepZoom = (dir: 1 | -1) => {
      const z = zoomRef.current;
      const next =
        dir > 0
          ? (ZOOM_STEPS.find((s) => s > z + 0.01) ?? MAX_ZOOM)
          : ([...ZOOM_STEPS].reverse().find((s) => s < z - 0.01) ?? MIN_ZOOM);
      zoomAround(next, null);
    };

    // Ctrl+wheel and trackpad pinch zoom around the cursor; a plain wheel scrolls.
    useEffect(() => {
      const frame = frameRef.current;
      if (!frame) return undefined;
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomAround(zoomRef.current * Math.exp(-e.deltaY / 200), {
          x: e.clientX,
          y: e.clientY,
        });
      };
      frame.addEventListener('wheel', onWheel, { passive: false });
      return () => frame.removeEventListener('wheel', onWheel);
    }, [zoomAround]);

    const startPinch = () => {
      const frame = frameRef.current;
      const [a, b] = [...touchesRef.current.values()];
      const view = frameAnchor(midpoint(a, b));
      if (!frame || !view) return;
      pinchRef.current = {
        zoom: zoomRef.current,
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: view.anchor,
      };
      panRef.current = null;
      pinchingRef.current = true;
      onPinchStartRef.current();
      // The frame keeps both fingers even if one slides off the page.
      for (const id of touchesRef.current.keys()) {
        try {
          frame.setPointerCapture?.(id);
        } catch {
          // A pointer that already ended can't be captured.
        }
      }
    };

    const handleDown = (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      // A fresh gesture clears anything a missed pointerup left behind.
      if (e.isPrimary) {
        touchesRef.current.clear();
        pinchRef.current = null;
        pinchingRef.current = false;
      }
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) startPinch();
      else if (touchesRef.current.size === 1 && disabled)
        panRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMove = (e: React.PointerEvent) => {
      const touches = touchesRef.current;
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      const frame = frameRef.current;
      if (pinch && touches.size >= 2 && frame) {
        const [a, b] = [...touches.values()];
        const mid = midpoint(a, b);
        const rect = frame.getBoundingClientRect();
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        setView((pinch.zoom * distance) / pinch.distance, pinch.anchor, {
          x: mid.x - rect.left,
          y: mid.y - rect.top,
        });
        return;
      }
      const pan = panRef.current;
      if (pan && frame) {
        frame.scrollLeft -= e.clientX - pan.x;
        frame.scrollTop -= e.clientY - pan.y;
        panRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleUp = (e: React.PointerEvent) => {
      const touches = touchesRef.current;
      if (!touches.delete(e.pointerId)) return;
      if (touches.size < 2) pinchRef.current = null;
      if (touches.size === 0) {
        pinchingRef.current = false;
        panRef.current = null;
      }
    };

    const zoomed = zoom > MIN_ZOOM + 0.001;
    const percent = Math.round(zoom * 100);

    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-slate-200 @container-size ${className}`}
        style={style}
      >
        <div
          ref={frameRef}
          data-testid="whiteboard-zoom-frame"
          className={`absolute inset-0 ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}
          style={{ touchAction: 'none' }}
          onPointerDownCapture={handleDown}
          onPointerMoveCapture={handleMove}
          onPointerUpCapture={handleUp}
          onPointerCancelCapture={handleUp}
        >
          <div
            ref={contentRef}
            className="relative"
            // Sized from the box, not the scroller, so scrollbars never skew the page.
            style={{ width: `${zoom * 100}cqw`, height: `${zoom * 100}cqh` }}
          >
            {children}
          </div>
        </div>
        <div
          role="group"
          aria-label={t('quizWhiteboard.canvas.zoom')}
          className="absolute bottom-2 right-2 flex items-center rounded-xl bg-white/95 p-0.5 shadow-xs ring-1 ring-slate-200"
        >
          <button
            type="button"
            // no-tour-anchor: student quiz canvas, outside teacher tours
            aria-label={t('quizWhiteboard.canvas.zoomOut')}
            title={t('quizWhiteboard.canvas.zoomOut')}
            disabled={!zoomed}
            onClick={() => stepZoom(-1)}
            className={btn}
          >
            <ZoomOut aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            // no-tour-anchor: student quiz canvas, outside teacher tours
            aria-label={t('quizWhiteboard.canvas.zoomReset')}
            title={t('quizWhiteboard.canvas.zoomReset')}
            disabled={!zoomed}
            onClick={() => zoomAround(MIN_ZOOM, null)}
            className={`${btn} w-14 text-xs font-bold tabular-nums disabled:opacity-100`}
          >
            {percent}%
          </button>
          <button
            type="button"
            // no-tour-anchor: student quiz canvas, outside teacher tours
            aria-label={t('quizWhiteboard.canvas.zoomIn')}
            title={t('quizWhiteboard.canvas.zoomIn')}
            disabled={zoom >= MAX_ZOOM - 0.001}
            onClick={() => stepZoom(1)}
            className={btn}
          >
            <ZoomIn aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }
);

WhiteboardZoomFrame.displayName = 'WhiteboardZoomFrame';

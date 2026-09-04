import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NotebookObjectLink, PlacedNotebookAsset } from '@/types';
import { clampPosFrac, clampWidthFrac } from '@/utils/notebookPlacedAssets';
import { NotebookZoom, useNotebookZoomGestures } from '../useNotebookZoom';

/** dataTransfer type for an asset dragged from the Assets panel onto a page. */
export const NOTEBOOK_ASSET_MIME = 'application/notebook-asset';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type AssetPatch = Partial<
  Pick<PlacedNotebookAsset, 'xFrac' | 'yFrac' | 'wFrac'>
>;

interface PageCanvasProps {
  pageUrl: string;
  pageNumber: number;
  placedAssets: PlacedNotebookAsset[];
  onPlaceAsset: (url: string, xFrac: number, yFrac: number) => void;
  onUpdatePlacedAsset: (id: string, patch: AssetPatch) => void;
  onRemovePlacedAsset: (id: string) => void;
  /** Hotspots that jump to another page when clicked. Only links on the
   *  current page are passed in; positioned by xFrac/yFrac/wFrac/hFrac of
   *  the visible (object-contain) image rect. */
  objectLinks?: NotebookObjectLink[];
  /** Fires when a hotspot is clicked. No-op in edit mode (links are
   *  authored, not navigated). */
  onFollowLink?: (targetPage: number) => void;
  /** Zoom/pan model shared with the viewer's zoom controls. */
  zoom: NotebookZoom;
}

interface DragSession {
  mode: 'move' | 'resize';
  id: string;
  startX: number;
  startY: number;
  x0: number;
  y0: number;
  w0: number;
}

/**
 * Renders a notebook page plus a movable/resizable overlay of placed assets,
 * aligned to the *visible* (object-contain) image rect. Asset positions are
 * fractions of the page, so they stay put across widget resize and maximize.
 * Assets dropped here are contained in the widget rather than the board.
 */
export const PageCanvas: React.FC<PageCanvasProps> = ({
  pageUrl,
  pageNumber,
  placedAssets,
  onPlaceAsset,
  onUpdatePlacedAsset,
  onRemovePlacedAsset,
  objectLinks,
  onFollowLink,
  zoom,
}) => {
  // The positioned container has NO padding so absolute children share the same
  // origin as getBoundingClientRect (the border box).
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [content, setContent] = useState<Rect | null>(null);
  // Live drag/resize draft, so we persist once on pointer-up (not every frame).
  const [draft, setDraft] = useState<{
    id: string;
    xFrac: number;
    yFrac: number;
    wFrac: number;
  } | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useNotebookZoomGestures(zoom);

  // Compute the visible image rect (object-contain letterboxes inside the box).
  const measure = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) {
      setContent(null);
      return;
    }
    // Layout (offset) geometry, not client rects: it is immune to the zoom
    // transform, so `content` stays in the units absolute children use.
    const boxW = img.offsetWidth;
    const boxH = img.offsetHeight;
    if (!boxW || !boxH) {
      setContent(null);
      return;
    }
    const imgAR = img.naturalWidth / img.naturalHeight;
    const boxAR = boxW / boxH;
    let cw: number;
    let ch: number;
    if (imgAR > boxAR) {
      cw = boxW;
      ch = boxW / imgAR;
    } else {
      ch = boxH;
      cw = boxH * imgAR;
    }
    setContent({
      left: img.offsetLeft + (boxW - cw) / 2,
      top: img.offsetTop + (boxH - ch) / 2,
      width: cw,
      height: ch,
    });
  }, []);

  // Re-measure on container resize (widget resize / maximize). The page image's
  // own onLoad covers the initial measure and page changes, so no measure-on-
  // render effect is needed (which would also trip set-state-in-effect lint).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  const fracFromClient = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!content || !container) return null;
    const cRect = container.getBoundingClientRect();
    const s = zoom.scale;
    return {
      x: ((clientX - cRect.left) / s - content.left) / content.width,
      y: ((clientY - cRect.top) / s - content.top) / content.height,
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(NOTEBOOK_ASSET_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(NOTEBOOK_ASSET_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const { url } = JSON.parse(raw) as { url?: string };
      const f = fracFromClient(e.clientX, e.clientY);
      if (url && f) onPlaceAsset(url, f.x, f.y);
    } catch {
      // Malformed payload — ignore.
    }
  };

  const beginDrag = (
    e: React.PointerEvent,
    a: PlacedNotebookAsset,
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      id: a.id,
      startX: e.clientX,
      startY: e.clientY,
      x0: a.xFrac,
      y0: a.yFrac,
      w0: a.wFrac,
    };
    setDraft({ id: a.id, xFrac: a.xFrac, yFrac: a.yFrac, wFrac: a.wFrac });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (pan) {
      zoom.panBy(e.clientX - pan.x, e.clientY - pan.y);
      panRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const d = dragRef.current;
    if (!d || !content) return;
    const s = zoom.scale;
    const dxFrac = (e.clientX - d.startX) / (content.width * s);
    const dyFrac = (e.clientY - d.startY) / (content.height * s);
    if (d.mode === 'move') {
      setDraft({
        id: d.id,
        xFrac: clampPosFrac(d.x0 + dxFrac, d.w0),
        yFrac: clampPosFrac(d.y0 + dyFrac, d.w0),
        wFrac: d.w0,
      });
    } else {
      setDraft({
        id: d.id,
        xFrac: d.x0,
        yFrac: d.y0,
        // Cap growth at the page's right edge so resizing can't overflow.
        wFrac: clampWidthFrac(Math.min(d.w0 + dxFrac, 1 - d.x0)),
      });
    }
  };

  // Drag-to-pan on the page itself (never on an asset or hotspot).
  const beginPan = (e: React.PointerEvent) => {
    if (!zoom.isZoomed) return;
    const target = e.target as HTMLElement;
    if (target !== containerRef.current && target !== imgRef.current) return;
    panRef.current = { x: e.clientX, y: e.clientY };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerUp = () => {
    panRef.current = null;
    setPanning(false);
    const d = dragRef.current;
    dragRef.current = null;
    if (d && draft) {
      onUpdatePlacedAsset(
        d.id,
        d.mode === 'move'
          ? { xFrac: draft.xFrac, yFrac: draft.yFrac }
          : { wFrac: draft.wFrac }
      );
    }
    setDraft(null);
  };

  return (
    <div className="flex-1 flex" style={{ padding: 'min(16px, 3.5cqmin)' }}>
      <div
        ref={(el) => {
          containerRef.current = el;
          zoom.setContainer(el);
        }}
        tabIndex={0}
        className="relative flex-1 flex items-center justify-center outline-none"
        style={{
          transform: zoom.transform,
          transformOrigin: '0 0',
          willChange: zoom.isZoomed ? 'transform' : undefined,
          touchAction: zoom.isZoomed ? 'none' : undefined,
          cursor: zoom.isZoomed ? 'grab' : undefined,
          transition:
            reducedMotion || panning ? undefined : 'transform 120ms ease-out',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPointerDown={beginPan}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={pageUrl}
          alt={`Page ${pageNumber}`}
          onLoad={measure}
          className="max-w-full max-h-full object-contain shadow-2xl bg-white rounded-sm"
        />
        {content &&
          placedAssets.map((a) => {
            const d = draft && draft.id === a.id ? draft : a;
            return (
              <div
                key={a.id}
                className="group absolute touch-none"
                style={{
                  left: content.left + d.xFrac * content.width,
                  top: content.top + d.yFrac * content.height,
                  width: d.wFrac * content.width,
                  cursor: 'grab',
                }}
                onPointerDown={(e) => beginDrag(e, a, 'move')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <img
                  src={a.url}
                  alt=""
                  draggable={false}
                  className="w-full h-auto pointer-events-none select-none drop-shadow-lg"
                />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePlacedAsset(a.id);
                  }}
                  className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500 hover:text-white"
                  aria-label="Remove asset"
                >
                  <X
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                  />
                </button>
                <div
                  onPointerDown={(e) => beginDrag(e, a, 'resize')}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="absolute -bottom-1 -right-1 bg-white border-2 border-indigo-500 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                    cursor: 'nwse-resize',
                  }}
                  aria-label="Resize asset"
                />
              </div>
            );
          })}

        {/* Link hotspots — clickable, otherwise invisible. Subtle outline
            appears on hover so the affordance is discoverable but doesn't
            cover the page in present mode. Only rendered when an
            onFollowLink handler is provided (i.e. present mode). */}
        {content &&
          onFollowLink &&
          objectLinks?.map((link) => (
            <button
              key={link.id}
              onClick={() => onFollowLink(link.targetPage)}
              className="absolute rounded-md ring-1 ring-transparent hover:ring-2 hover:ring-indigo-500 hover:bg-indigo-500/10 transition-all"
              style={{
                left: content.left + link.xFrac * content.width,
                top: content.top + link.yFrac * content.height,
                width: link.wFrac * content.width,
                height: link.hFrac * content.height,
                cursor: 'pointer',
              }}
              title={`Jump to page ${link.targetPage + 1}`}
              aria-label={`Jump to page ${link.targetPage + 1}`}
            />
          ))}
      </div>
    </div>
  );
};

export default PageCanvas;

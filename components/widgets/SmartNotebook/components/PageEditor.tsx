import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  prepareEditableSvg,
  ensureObjectIds,
  objectIdForTarget,
  findObjectById,
  exportEditedSvg,
  EDIT_OVERLAY_ATTR,
  ORIG_TRANSFORM_ATTR,
  EditableObjectInfo,
} from '@/utils/notebookSvgEdit';

interface PageEditorProps {
  /** Raw page SVG text (from a parsed notebook page). */
  svg: string;
  className?: string;
  /** Notifies the host which object is selected (id + kind), or null. */
  onSelectionChange?: (selection: EditableObjectInfo | null) => void;
  /** Fires (with the cleaned, persistable SVG) after a move or delete. */
  onChange?: (svg: string) => void;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  baseDx: number;
  baseDy: number;
  moved: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD_PX = 3;

/**
 * SVG-native page editor (Tier 2). Inlines a sanitized page SVG and lets the
 * teacher select a top-level object (text / image / ink), drag it to move, and
 * delete it — all by editing the live SVG tree, preserving import fidelity.
 */
export const PageEditor: React.FC<PageEditorProps> = ({
  svg,
  className,
  onSelectionChange,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const highlightRef = useRef<SVGRectElement | null>(null);
  const objectsRef = useRef<EditableObjectInfo[]>([]);
  const dragRef = useRef<DragState | null>(null);

  // Keep latest callbacks in refs so notify effects needn't depend on them.
  const onSelRef = useRef(onSelectionChange);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onSelRef.current = onSelectionChange;
    onChangeRef.current = onChange;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const prepared = useMemo(() => prepareEditableSvg(svg), [svg]);

  // Reset selection when the page changes (adjust-state-while-rendering).
  const [prevPrepared, setPrevPrepared] = useState(prepared);
  if (prepared !== prevPrepared) {
    setPrevPrepared(prepared);
    setSelectedId(null);
  }

  const positionHighlight = useCallback((id: string | null) => {
    const svgEl = svgRef.current;
    const rect = highlightRef.current;
    if (!svgEl || !rect) return;
    const obj = id ? findObjectById(svgEl, id) : null;
    if (!obj) {
      rect.style.display = 'none';
      return;
    }
    // getBBox is in the object's LOCAL space (before its own transform). Map its
    // corners through getCTM (which includes the object's transform + the move)
    // into the SVG root space the highlight rect lives in, then take the AABB.
    const bbox = obj.getBBox();
    const ctm = obj.getCTM();
    const corners = [
      [bbox.x, bbox.y],
      [bbox.x + bbox.width, bbox.y],
      [bbox.x, bbox.y + bbox.height],
      [bbox.x + bbox.width, bbox.y + bbox.height],
    ];
    const mapped = corners.map(([x, y]) =>
      ctm
        ? { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f }
        : { x, y }
    );
    const xs = mapped.map((p) => p.x);
    const ys = mapped.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    rect.setAttribute('x', String(minX));
    rect.setAttribute('y', String(minY));
    rect.setAttribute('width', String(Math.max(...xs) - minX));
    rect.setAttribute('height', String(Math.max(...ys) - minY));
    rect.style.display = '';
  }, []);

  const emitChange = useCallback(() => {
    if (svgRef.current) onChangeRef.current?.(exportEditedSvg(svgRef.current));
  }, []);

  // Inline the sanitized, responsive SVG; tag objects; add the highlight rect.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = prepared;
    const el = container.querySelector('svg');
    svgRef.current = el;
    if (!el) {
      highlightRef.current = null;
      objectsRef.current = [];
      return;
    }
    objectsRef.current = ensureObjectIds(el);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('fill', 'rgba(99,102,241,0.12)');
    rect.setAttribute('stroke', '#6366f1');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    rect.setAttribute('pointer-events', 'none');
    rect.setAttribute(EDIT_OVERLAY_ATTR, '1');
    rect.style.display = 'none';
    el.appendChild(rect);
    highlightRef.current = rect;
  }, [prepared]);

  // Reposition the highlight + notify the host when the selection changes.
  useEffect(() => {
    positionHighlight(selectedId);
    const info = selectedId
      ? (objectsRef.current.find((o) => o.id === selectedId) ?? null)
      : null;
    onSelRef.current?.(info);
  }, [selectedId, positionHighlight, prepared]);

  // Delete / Escape on the selected object.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const svgEl = svgRef.current;
        const obj = svgEl ? findObjectById(svgEl, selectedId) : null;
        if (obj) {
          obj.remove();
          setSelectedId(null);
          emitChange();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, emitChange]);

  // Convert a client-space delta to the SVG's user-space delta.
  const toUserDelta = (
    cdx: number,
    cdy: number
  ): { ux: number; uy: number } => {
    const svgEl = svgRef.current;
    const ctm = svgEl?.getScreenCTM();
    if (!ctm) return { ux: cdx, uy: cdy };
    const inv = ctm.inverse();
    return { ux: inv.a * cdx + inv.c * cdy, uy: inv.b * cdx + inv.d * cdy };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const id = objectIdForTarget(svgEl, e.target as Element);
    setSelectedId(id);
    if (!id) return;
    const obj = findObjectById(svgEl, id);
    if (!obj) return;
    if (!obj.getAttribute(ORIG_TRANSFORM_ATTR)) {
      obj.setAttribute(
        ORIG_TRANSFORM_ATTR,
        obj.getAttribute('transform') ?? ''
      );
    }
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      baseDx: parseFloat(obj.getAttribute('data-edit-dx') ?? '0'),
      baseDy: parseFloat(obj.getAttribute('data-edit-dy') ?? '0'),
      moved: false,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const svgEl = svgRef.current;
    if (!drag || !svgEl) return;
    const cdx = e.clientX - drag.startX;
    const cdy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(cdx, cdy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const { ux, uy } = toUserDelta(cdx, cdy);
    const totalDx = drag.baseDx + ux;
    const totalDy = drag.baseDy + uy;
    const obj = findObjectById(svgEl, drag.id);
    if (!obj) return;
    const orig = obj.getAttribute(ORIG_TRANSFORM_ATTR) ?? '';
    obj.setAttribute(
      'transform',
      `translate(${totalDx},${totalDy}) ${orig}`.trim()
    );
    obj.setAttribute('data-edit-dx', String(totalDx));
    obj.setAttribute('data-edit-dy', String(totalDy));
    positionHighlight(drag.id);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    containerRef.current?.releasePointerCapture?.(e.pointerId);
    if (drag?.moved) emitChange();
  };

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="presentation"
      />
    </div>
  );
};

export default PageEditor;

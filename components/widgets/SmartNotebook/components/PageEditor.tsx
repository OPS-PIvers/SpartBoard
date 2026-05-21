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
  readTextLines,
  writeTextLines,
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
  /** Fires (with the cleaned, persistable SVG) after any edit. */
  onChange?: (svg: string) => void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  startX: number; // client px
  startY: number;
  m0: DOMMatrix; // object's edit matrix at gesture start
  moved: boolean;
  anchor?: { x: number; y: number }; // resize: fixed corner (user space)
  startCorner?: { x: number; y: number }; // resize: dragged corner (user space)
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD_PX = 3;
const HANDLE_PX = 10;
const MIN_SCALE = 0.05;
const EDIT_MATRIX_ATTR = 'data-edit-matrix';
const HANDLE_ATTR = 'data-edit-handle';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

const matrixString = (m: DOMMatrix): string =>
  `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}`;

/** Read an object's editor matrix (identity if none yet). */
const readEditMatrix = (obj: Element): DOMMatrix => {
  const raw = obj.getAttribute(EDIT_MATRIX_ATTR);
  if (!raw) return new DOMMatrix();
  const n = raw.split(',').map(Number);
  return n.length === 6 && n.every((v) => Number.isFinite(v))
    ? new DOMMatrix(n)
    : new DOMMatrix();
};

/** Apply an editor matrix as a leading transform, preserving the original. */
const applyEditMatrix = (obj: Element, m: DOMMatrix): void => {
  if (obj.getAttribute(ORIG_TRANSFORM_ATTR) === null) {
    obj.setAttribute(ORIG_TRANSFORM_ATTR, obj.getAttribute('transform') ?? '');
  }
  const orig = obj.getAttribute(ORIG_TRANSFORM_ATTR) ?? '';
  obj.setAttribute(EDIT_MATRIX_ATTR, matrixString(m));
  obj.setAttribute('transform', `matrix(${matrixString(m)}) ${orig}`.trim());
};

/** Axis-aligned bounding box of an object in the SVG root's user space. */
const transformedBox = (
  obj: SVGGraphicsElement
): { minX: number; minY: number; maxX: number; maxY: number } => {
  const b = obj.getBBox();
  const ctm = obj.getCTM();
  const pts = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ];
  const mapped = pts.map(([x, y]) =>
    ctm
      ? { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f }
      : { x, y }
  );
  const xs = mapped.map((p) => p.x);
  const ys = mapped.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

/**
 * SVG-native page editor (Tier 2). Inlines a sanitized page SVG and lets the
 * teacher select a top-level object (text / image / ink) and move, resize,
 * delete, duplicate, or (for text) re-type it — all by editing the live SVG
 * tree, preserving import fidelity. Edits compose as a per-object matrix.
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
  const handlesRef = useRef<Map<Corner, SVGRectElement>>(new Map());
  const objectsRef = useRef<EditableObjectInfo[]>([]);
  const dragRef = useRef<DragState | null>(null);

  const onSelRef = useRef(onSelectionChange);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onSelRef.current = onSelectionChange;
    onChangeRef.current = onChange;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    value: string;
  } | null>(null);

  const prepared = useMemo(() => prepareEditableSvg(svg), [svg]);

  const [prevPrepared, setPrevPrepared] = useState(prepared);
  if (prepared !== prevPrepared) {
    setPrevPrepared(prepared);
    setSelectedId(null);
    setEditing(null);
  }

  // Position the selection highlight + resize handles (or hide them). Pure DOM.
  const positionHighlight = useCallback((id: string | null) => {
    const svgEl = svgRef.current;
    const rect = highlightRef.current;
    if (!svgEl || !rect) return;
    const obj = id ? findObjectById(svgEl, id) : null;
    if (!obj) {
      rect.style.display = 'none';
      handlesRef.current.forEach((h) => (h.style.display = 'none'));
      return;
    }
    const box = transformedBox(obj);
    rect.setAttribute('x', String(box.minX));
    rect.setAttribute('y', String(box.minY));
    rect.setAttribute('width', String(box.maxX - box.minX));
    rect.setAttribute('height', String(box.maxY - box.minY));
    rect.style.display = '';

    // Keep handles a roughly constant screen size.
    const inv = svgEl.getScreenCTM()?.inverse();
    const hs = HANDLE_PX * (inv ? Math.abs(inv.a) : 1);
    const at: Record<Corner, [number, number]> = {
      nw: [box.minX, box.minY],
      ne: [box.maxX, box.minY],
      sw: [box.minX, box.maxY],
      se: [box.maxX, box.maxY],
    };
    handlesRef.current.forEach((h, corner) => {
      const [cx, cy] = at[corner];
      h.setAttribute('x', String(cx - hs / 2));
      h.setAttribute('y', String(cy - hs / 2));
      h.setAttribute('width', String(hs));
      h.setAttribute('height', String(hs));
      h.style.display = '';
    });
  }, []);

  const emitChange = useCallback(() => {
    if (svgRef.current) onChangeRef.current?.(exportEditedSvg(svgRef.current));
  }, []);

  // Inline the SVG, tag objects, and build the selection overlay (rect + handles).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = prepared;
    const el = container.querySelector('svg');
    svgRef.current = el;
    handlesRef.current = new Map();
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

    const cursorFor: Record<Corner, string> = {
      nw: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      se: 'nwse-resize',
    };
    for (const corner of CORNERS) {
      const h = document.createElementNS(SVG_NS, 'rect');
      h.setAttribute('fill', '#ffffff');
      h.setAttribute('stroke', '#6366f1');
      h.setAttribute('stroke-width', '1.5');
      h.setAttribute('vector-effect', 'non-scaling-stroke');
      h.setAttribute('rx', '1');
      h.setAttribute(EDIT_OVERLAY_ATTR, '1');
      h.setAttribute(HANDLE_ATTR, corner);
      h.style.cursor = cursorFor[corner];
      h.style.display = 'none';
      el.appendChild(h);
      handlesRef.current.set(corner, h);
    }
  }, [prepared]);

  useEffect(() => {
    positionHighlight(selectedId);
    const info = selectedId
      ? (objectsRef.current.find((o) => o.id === selectedId) ?? null)
      : null;
    onSelRef.current?.(info);
  }, [selectedId, positionHighlight, prepared]);

  const duplicateSelected = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !selectedId) return;
    const obj = findObjectById(svgEl, selectedId);
    const fg = obj?.parentElement;
    if (!obj || !fg) return;
    const clone = obj.cloneNode(true) as SVGGraphicsElement;
    const newId = `obj-dup-${Date.now()}`;
    clone.setAttribute('data-edit-id', newId);
    // Re-base the clone's edit bookkeeping on its current transform, then nudge.
    clone.setAttribute(
      ORIG_TRANSFORM_ATTR,
      clone.getAttribute('transform') ?? ''
    );
    clone.removeAttribute(EDIT_MATRIX_ATTR);
    fg.appendChild(clone);
    applyEditMatrix(clone, new DOMMatrix().translateSelf(20, 20));
    objectsRef.current = ensureObjectIds(svgEl);
    setSelectedId(newId);
    emitChange();
  }, [selectedId, emitChange]);

  // Keyboard: Escape deselect, Delete remove, Cmd/Ctrl+D duplicate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const obj = svgRef.current
          ? findObjectById(svgRef.current, selectedId)
          : null;
        if (obj) {
          obj.remove();
          setSelectedId(null);
          emitChange();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, emitChange, editing, duplicateSelected]);

  // ---- text editing -------------------------------------------------------
  const handleDoubleClick = (e: React.MouseEvent) => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;
    const id = objectIdForTarget(svgEl, e.target as Element);
    if (!id) return;
    const info = objectsRef.current.find((o) => o.id === id);
    if (info?.kind !== 'text') return;
    const obj = findObjectById(svgEl, id);
    if (!obj) return;
    const c = container.getBoundingClientRect();
    const r = obj.getBoundingClientRect();
    setSelectedId(id);
    setEditing({
      id,
      left: r.left - c.left,
      top: r.top - c.top,
      width: Math.max(r.width, 60),
      height: Math.max(r.height, 28),
      value: readTextLines(obj),
    });
  };

  const applyTextEdit = () => {
    const svgEl = svgRef.current;
    if (!svgEl || !editing) return;
    const obj = findObjectById(svgEl, editing.id);
    if (obj) {
      writeTextLines(obj, editing.value);
      positionHighlight(editing.id);
      emitChange();
    }
    setEditing(null);
  };

  // ---- pointer move / resize ---------------------------------------------
  const toUserDelta = (
    cdx: number,
    cdy: number
  ): { ux: number; uy: number } => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { ux: cdx, uy: cdy };
    const inv = ctm.inverse();
    return { ux: inv.a * cdx + inv.c * cdy, uy: inv.b * cdx + inv.d * cdy };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const svgEl = svgRef.current;
    if (!svgEl || editing) return;
    const target = e.target as Element;
    const handle = target.getAttribute(HANDLE_ATTR) as Corner | null;

    if (handle && selectedId) {
      const obj = findObjectById(svgEl, selectedId);
      if (!obj) return;
      const box = transformedBox(obj);
      const cornerPt: Record<Corner, { x: number; y: number }> = {
        nw: { x: box.minX, y: box.minY },
        ne: { x: box.maxX, y: box.minY },
        sw: { x: box.minX, y: box.maxY },
        se: { x: box.maxX, y: box.maxY },
      };
      const opposite: Record<Corner, Corner> = {
        nw: 'se',
        ne: 'sw',
        sw: 'ne',
        se: 'nw',
      };
      dragRef.current = {
        id: selectedId,
        mode: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        m0: readEditMatrix(obj),
        moved: false,
        anchor: cornerPt[opposite[handle]],
        startCorner: cornerPt[handle],
      };
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const id = objectIdForTarget(svgEl, target);
    setSelectedId(id);
    if (!id) return;
    const obj = findObjectById(svgEl, id);
    if (!obj) return;
    dragRef.current = {
      id,
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      m0: readEditMatrix(obj),
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
    const obj = findObjectById(svgEl, drag.id);
    if (!obj) return;
    const { ux, uy } = toUserDelta(cdx, cdy);

    if (drag.mode === 'move') {
      const m = new DOMMatrix().translateSelf(ux, uy).multiply(drag.m0);
      applyEditMatrix(obj, m);
    } else if (drag.anchor && drag.startCorner) {
      const { anchor, startCorner } = drag;
      const px = startCorner.x + ux;
      const py = startCorner.y + uy;
      const denomX = startCorner.x - anchor.x;
      const denomY = startCorner.y - anchor.y;
      const sx =
        Math.abs(denomX) < 0.001
          ? 1
          : Math.max(MIN_SCALE, (px - anchor.x) / denomX);
      const sy =
        Math.abs(denomY) < 0.001
          ? 1
          : Math.max(MIN_SCALE, (py - anchor.y) / denomY);
      const a = new DOMMatrix()
        .translateSelf(anchor.x, anchor.y)
        .scaleSelf(sx, sy)
        .translateSelf(-anchor.x, -anchor.y);
      applyEditMatrix(obj, a.multiply(drag.m0));
    }
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
        onDoubleClick={handleDoubleClick}
        role="presentation"
      />
      {editing && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) =>
            setEditing((prev) =>
              prev ? { ...prev, value: e.target.value } : prev
            )
          }
          onBlur={applyTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(null);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              applyTextEdit();
            }
          }}
          className="absolute z-10 resize-none rounded border-2 border-indigo-500 bg-white/95 px-1 py-0.5 leading-tight text-slate-900 shadow-lg outline-none"
          style={{
            left: editing.left,
            top: editing.top,
            width: editing.width,
            minHeight: editing.height,
          }}
        />
      )}
    </div>
  );
};

export default PageEditor;

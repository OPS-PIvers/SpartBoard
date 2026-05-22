import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MousePointer2, Pen, Highlighter, Eraser } from 'lucide-react';
import {
  prepareEditableSvg,
  ensureObjectIds,
  objectIdForTarget,
  findObjectById,
  findForeground,
  exportEditedSvg,
  getTextLeaves,
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
  /** Notifies the host which objects are selected (id + kind); empty when none. */
  onSelectionChange?: (selection: EditableObjectInfo[]) => void;
  /** Fires (with the cleaned, persistable SVG) after any edit. */
  onChange?: (svg: string) => void;
}

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser';
type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: 'move' | 'resize' | 'marquee';
  startX: number;
  startY: number;
  moved: boolean;
  // group move: each selected object's matrix captured at drag start
  items?: { id: string; m0: DOMMatrix }[];
  // single-object resize
  id?: string;
  m0?: DOMMatrix;
  anchor?: { x: number; y: number };
  startCorner?: { x: number; y: number };
  // marquee: start corner in root-svg user space + the selection to union onto
  startUser?: { x: number; y: number };
  baseSelection?: string[];
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** AABB overlap test (touch/intersect semantics) in a shared coordinate space. */
const boxesIntersect = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD_PX = 3;
const HANDLE_PX = 10;
const MIN_SCALE = 0.05;
const EDIT_MATRIX_ATTR = 'data-edit-matrix';
const HANDLE_ATTR = 'data-edit-handle';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

const PEN_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#111827', '#f59e0b'];
const PEN_WIDTHS = [2, 5, 10];

const matrixString = (m: DOMMatrix): string =>
  `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}`;

const readEditMatrix = (obj: Element): DOMMatrix => {
  const raw = obj.getAttribute(EDIT_MATRIX_ATTR);
  if (!raw) return new DOMMatrix();
  const n = raw.split(',').map(Number);
  return n.length === 6 && n.every((v) => Number.isFinite(v))
    ? new DOMMatrix(n)
    : new DOMMatrix();
};

const applyEditMatrix = (obj: Element, m: DOMMatrix): void => {
  if (obj.getAttribute(ORIG_TRANSFORM_ATTR) === null) {
    obj.setAttribute(ORIG_TRANSFORM_ATTR, obj.getAttribute('transform') ?? '');
  }
  const orig = obj.getAttribute(ORIG_TRANSFORM_ATTR) ?? '';
  obj.setAttribute(EDIT_MATRIX_ATTR, matrixString(m));
  obj.setAttribute('transform', `matrix(${matrixString(m)}) ${orig}`.trim());
};

// How far (screen px) to search around a click for a hard-to-hit object.
const HIT_TOLERANCE_PX = 8;

/**
 * Resolve the foreground object nearest a client point, within a small
 * tolerance. Used as a fallback when an exact click misses the painted
 * geometry — e.g. a thin line whose stroke is only a couple of pixels wide, or
 * the whitespace inside a text block's box. Each object's screen-space bounding
 * box is expanded by the tolerance; among those containing the point, the
 * closest (topmost on ties) wins. Returns null when the point is in open canvas
 * so a marquee can still start there.
 */
const objectNearClient = (
  svgEl: SVGSVGElement,
  cx: number,
  cy: number
): string | null => {
  const fg = findForeground(svgEl);
  if (!fg) return null;
  const t = HIT_TOLERANCE_PX;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const child of Array.from(fg.children)) {
    const id = child.getAttribute('data-edit-id');
    if (!id) continue;
    const r = child.getBoundingClientRect();
    if (
      cx < r.left - t ||
      cx > r.right + t ||
      cy < r.top - t ||
      cy > r.bottom + t
    )
      continue;
    const dx = Math.max(r.left - cx, 0, cx - r.right);
    const dy = Math.max(r.top - cy, 0, cy - r.bottom);
    const dist = Math.hypot(dx, dy);
    // <= lets a later (higher z-order) object win ties, matching paint order.
    if (dist <= bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
};

const makeSelectionRect = (): SVGRectElement => {
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('fill', 'rgba(99,102,241,0.12)');
  r.setAttribute('stroke', '#6366f1');
  r.setAttribute('stroke-width', '2');
  r.setAttribute('vector-effect', 'non-scaling-stroke');
  r.setAttribute('pointer-events', 'none');
  r.setAttribute(EDIT_OVERLAY_ATTR, '1');
  return r;
};

const transformedBox = (svgEl: SVGSVGElement, obj: SVGGraphicsElement): Box => {
  const b = obj.getBBox();
  // Map the object's local geometry into the ROOT svg's user space — the space
  // the overlay highlight rect lives in. Going through screen space (root⁻¹ ·
  // obj) is correct regardless of any intermediate viewport, viewBox, or
  // preserveAspectRatio between the object and the root. (obj.getCTM() targets
  // the *nearest* viewport, which drifts off-center when SMART nests content.)
  const rootCtm = svgEl.getScreenCTM();
  const objCtm = obj.getScreenCTM();
  const ctm =
    rootCtm && objCtm ? rootCtm.inverse().multiply(objCtm) : obj.getCTM();
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
 * SVG-native page editor (Tier 2). Select / move / resize / delete / duplicate
 * / re-type existing objects, AND draw new ink (pen, highlighter) or erase it —
 * all by editing the live SVG tree, preserving import fidelity.
 */
export const PageEditor: React.FC<PageEditorProps> = ({
  svg,
  className,
  onSelectionChange,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Group holding one highlight rect per selected object.
  const selGroupRef = useRef<SVGGElement | null>(null);
  // Rubber-band rect drawn while marquee-selecting.
  const marqueeRef = useRef<SVGRectElement | null>(null);
  const handlesRef = useRef<Map<Corner, SVGRectElement>>(new Map());
  const objectsRef = useRef<EditableObjectInfo[]>([]);
  const dragRef = useRef<DragState | null>(null);
  // Active freehand stroke (pen/highlighter) and eraser session.
  const strokeRef = useRef<{ path: SVGPathElement; d: string } | null>(null);
  const erasedRef = useRef(false);

  const onSelRef = useRef(onSelectionChange);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onSelRef.current = onSelectionChange;
    onChangeRef.current = onChange;
  });

  const [tool, setTool] = useState<Tool>('select');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState(PEN_WIDTHS[1]);
  const toolRef = useRef(tool);
  const penColorRef = useRef(penColor);
  const penWidthRef = useRef(penWidth);
  useEffect(() => {
    toolRef.current = tool;
    penColorRef.current = penColor;
    penWidthRef.current = penWidth;
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    setSelectedIds([]);
    setEditing(null);
  }

  // Draw one highlight rect per selected object (reusing rect nodes to avoid
  // DOM churn during drags). Resize handles appear only for a single selection.
  const renderSelection = useCallback((ids: string[]) => {
    const svgEl = svgRef.current;
    const group = selGroupRef.current;
    if (!svgEl || !group) return;

    while (group.childElementCount > ids.length)
      group.lastElementChild?.remove();
    while (group.childElementCount < ids.length)
      group.appendChild(makeSelectionRect());

    ids.forEach((id, i) => {
      const rect = group.children[i] as SVGRectElement;
      const obj = findObjectById(svgEl, id);
      if (!obj) {
        rect.style.display = 'none';
        return;
      }
      const box = transformedBox(svgEl, obj);
      rect.setAttribute('x', String(box.minX));
      rect.setAttribute('y', String(box.minY));
      rect.setAttribute('width', String(box.maxX - box.minX));
      rect.setAttribute('height', String(box.maxY - box.minY));
      rect.style.display = '';
    });

    const only = ids.length === 1 ? findObjectById(svgEl, ids[0]) : null;
    if (!only) {
      handlesRef.current.forEach((h) => (h.style.display = 'none'));
      return;
    }
    const box = transformedBox(svgEl, only);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = prepared;
    const el = container.querySelector('svg');
    svgRef.current = el;
    handlesRef.current = new Map();
    if (!el) {
      selGroupRef.current = null;
      marqueeRef.current = null;
      objectsRef.current = [];
      return;
    }
    objectsRef.current = ensureObjectIds(el);

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute(EDIT_OVERLAY_ATTR, '1');
    el.appendChild(group);
    selGroupRef.current = group;

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

    const marquee = document.createElementNS(SVG_NS, 'rect');
    marquee.setAttribute('fill', 'rgba(99,102,241,0.10)');
    marquee.setAttribute('stroke', '#6366f1');
    marquee.setAttribute('stroke-width', '1');
    marquee.setAttribute('stroke-dasharray', '4 3');
    marquee.setAttribute('vector-effect', 'non-scaling-stroke');
    marquee.setAttribute('pointer-events', 'none');
    marquee.setAttribute(EDIT_OVERLAY_ATTR, '1');
    marquee.style.display = 'none';
    el.appendChild(marquee);
    marqueeRef.current = marquee;
  }, [prepared]);

  useEffect(() => {
    renderSelection(selectedIds);
    const infos = selectedIds
      .map((id) => objectsRef.current.find((o) => o.id === id))
      .filter((o): o is EditableObjectInfo => Boolean(o));
    onSelRef.current?.(infos);
  }, [selectedIds, renderSelection, prepared]);

  const duplicateSelected = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || selectedIds.length === 0) return;
    const newIds: string[] = [];
    for (const id of selectedIds) {
      const obj = findObjectById(svgEl, id);
      const fg = obj?.parentElement;
      if (!obj || !fg) continue;
      const clone = obj.cloneNode(true) as SVGGraphicsElement;
      const newId = `obj-dup-${crypto.randomUUID()}`;
      clone.setAttribute('data-edit-id', newId);
      clone.setAttribute(
        ORIG_TRANSFORM_ATTR,
        clone.getAttribute('transform') ?? ''
      );
      clone.removeAttribute(EDIT_MATRIX_ATTR);
      fg.appendChild(clone);
      applyEditMatrix(clone, new DOMMatrix().translateSelf(20, 20));
      newIds.push(newId);
    }
    if (newIds.length === 0) return;
    objectsRef.current = ensureObjectIds(svgEl);
    setSelectedIds(newIds);
    emitChange();
  }, [selectedIds, emitChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === 'Escape') {
        setSelectedIds([]);
        return;
      }
      if (selectedIds.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        let removed = false;
        for (const id of selectedIds) {
          const obj = findObjectById(svgEl, id);
          if (obj) {
            obj.remove();
            removed = true;
          }
        }
        if (removed) {
          objectsRef.current = ensureObjectIds(svgEl);
          setSelectedIds([]);
          emitChange();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, emitChange, editing, duplicateSelected]);

  // ---- coordinate helpers -------------------------------------------------
  const toUserDelta = (cdx: number, cdy: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { ux: cdx, uy: cdy };
    const inv = ctm.inverse();
    return { ux: inv.a * cdx + inv.c * cdy, uy: inv.b * cdx + inv.d * cdy };
  };

  // Client point -> root-svg user space (where selection overlays live).
  const toRootUser = (cx: number, cy: number): { x: number; y: number } => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: cx, y: cy };
    const inv = ctm.inverse();
    return {
      x: inv.a * cx + inv.c * cy + inv.e,
      y: inv.b * cx + inv.d * cy + inv.f,
    };
  };

  // Client point -> foreground-local coordinates (where new ink is appended).
  const toForegroundPoint = (cx: number, cy: number) => {
    const svgEl = svgRef.current;
    const base = svgEl ? (findForeground(svgEl) ?? svgEl) : null;
    const ctm = base?.getScreenCTM();
    if (!ctm) return { x: cx, y: cy };
    const inv = ctm.inverse();
    return {
      x: inv.a * cx + inv.c * cy + inv.e,
      y: inv.b * cx + inv.d * cy + inv.f,
    };
  };

  // ---- text editing -------------------------------------------------------
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'select') return;
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;
    // Pointer capture (set on pointer-down to enable dragging) retargets this
    // dblclick to the container, so e.target points outside the SVG. Hit-test
    // by coordinates instead to find the object actually under the cursor.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const id = hit ? objectIdForTarget(svgEl, hit) : null;
    if (!id) return;
    // Open the text editor for any object that carries editable text runs —
    // SMART often wraps a text block in a <g>, which classifies as a group, so
    // gating on kind === 'text' would miss it. getTextLeaves finds the runs
    // wherever they live, matching what read/writeTextLines operate on.
    const obj = findObjectById(svgEl, id);
    if (!obj || getTextLeaves(obj).length === 0) return;
    const c = container.getBoundingClientRect();
    const r = obj.getBoundingClientRect();
    setSelectedIds([id]);
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
      renderSelection(selectedIds);
      emitChange();
    }
    setEditing(null);
  };

  // ---- ink helpers --------------------------------------------------------
  const eraseAt = (cx: number, cy: number) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const target = document.elementFromPoint(cx, cy);
    if (!target) return;
    const id = objectIdForTarget(svgEl, target);
    if (!id) return;
    const info = objectsRef.current.find((o) => o.id === id);
    if (info?.kind !== 'ink') return; // eraser only removes ink
    findObjectById(svgEl, id)?.remove();
    objectsRef.current = ensureObjectIds(svgEl);
    erasedRef.current = true;
  };

  // ---- pointer handlers ---------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent) => {
    const svgEl = svgRef.current;
    if (!svgEl || editing) return;
    const t = toolRef.current;

    if (t === 'eraser') {
      erasedRef.current = false;
      eraseAt(e.clientX, e.clientY);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (t === 'pen' || t === 'highlighter') {
      const fg = findForeground(svgEl);
      if (!fg) return;
      const p = toForegroundPoint(e.clientX, e.clientY);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', penColorRef.current);
      path.setAttribute(
        'stroke-width',
        String(
          t === 'highlighter' ? penWidthRef.current * 3 : penWidthRef.current
        )
      );
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (t === 'highlighter') path.setAttribute('stroke-opacity', '0.4');
      const d = `M ${p.x} ${p.y}`;
      path.setAttribute('d', d);
      fg.appendChild(path);
      strokeRef.current = { path, d };
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // select / move / resize
    const target = e.target as Element;
    const handle = target.getAttribute(HANDLE_ATTR) as Corner | null;
    if (handle && selectedIds.length === 1) {
      const obj = findObjectById(svgEl, selectedIds[0]);
      if (!obj) return;
      const box = transformedBox(svgEl, obj);
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
        id: selectedIds[0],
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

    const id =
      objectIdForTarget(svgEl, target) ??
      objectNearClient(svgEl, e.clientX, e.clientY);

    // Empty canvas: begin a marquee (rubber-band) selection. Shift unions onto
    // the current selection; otherwise the selection clears as the drag starts.
    if (!id) {
      dragRef.current = {
        mode: 'marquee',
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        startUser: toRootUser(e.clientX, e.clientY),
        baseSelection: e.shiftKey ? [...selectedIds] : [],
      };
      if (!e.shiftKey) setSelectedIds([]);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // Clicked an object. Shift toggles it in/out of the selection; a plain click
    // on an unselected object replaces the selection.
    const nextSelection = e.shiftKey
      ? selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
      : selectedIds.includes(id)
        ? selectedIds
        : [id];
    setSelectedIds(nextSelection);

    // Don't start a move when a shift-click just deselected the pressed object.
    if (!nextSelection.includes(id)) return;
    const items = nextSelection
      .map((sid) => {
        const o = findObjectById(svgEl, sid);
        return o ? { id: sid, m0: readEditMatrix(o) } : null;
      })
      .filter((it): it is { id: string; m0: DOMMatrix } => it !== null);
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      items,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Freehand drawing.
    const stroke = strokeRef.current;
    if (stroke) {
      const p = toForegroundPoint(e.clientX, e.clientY);
      stroke.d += ` L ${p.x} ${p.y}`;
      stroke.path.setAttribute('d', stroke.d);
      return;
    }
    if (toolRef.current === 'eraser') {
      if (e.buttons === 1) eraseAt(e.clientX, e.clientY);
      return;
    }

    const drag = dragRef.current;
    const svgEl = svgRef.current;
    if (!drag || !svgEl) return;
    const cdx = e.clientX - drag.startX;
    const cdy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(cdx, cdy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;

    // Marquee: just size the rubber-band rect; hits are resolved on pointer-up.
    if (drag.mode === 'marquee') {
      const marquee = marqueeRef.current;
      const start = drag.startUser;
      if (!marquee || !start) return;
      const cur = toRootUser(e.clientX, e.clientY);
      marquee.setAttribute('x', String(Math.min(start.x, cur.x)));
      marquee.setAttribute('y', String(Math.min(start.y, cur.y)));
      marquee.setAttribute('width', String(Math.abs(cur.x - start.x)));
      marquee.setAttribute('height', String(Math.abs(cur.y - start.y)));
      marquee.style.display = '';
      return;
    }

    const { ux, uy } = toUserDelta(cdx, cdy);

    if (drag.mode === 'move' && drag.items) {
      for (const item of drag.items) {
        const obj = findObjectById(svgEl, item.id);
        if (obj)
          applyEditMatrix(
            obj,
            new DOMMatrix().translateSelf(ux, uy).multiply(item.m0)
          );
      }
      renderSelection(drag.items.map((it) => it.id));
      return;
    }

    if (
      drag.mode === 'resize' &&
      drag.id &&
      drag.m0 &&
      drag.anchor &&
      drag.startCorner
    ) {
      const obj = findObjectById(svgEl, drag.id);
      if (!obj) return;
      const { anchor, startCorner } = drag;
      const denomX = startCorner.x - anchor.x;
      const denomY = startCorner.y - anchor.y;
      const sx =
        Math.abs(denomX) < 0.001
          ? 1
          : Math.max(MIN_SCALE, (startCorner.x + ux - anchor.x) / denomX);
      const sy =
        Math.abs(denomY) < 0.001
          ? 1
          : Math.max(MIN_SCALE, (startCorner.y + uy - anchor.y) / denomY);
      const a = new DOMMatrix()
        .translateSelf(anchor.x, anchor.y)
        .scaleSelf(sx, sy)
        .translateSelf(-anchor.x, -anchor.y);
      applyEditMatrix(obj, a.multiply(drag.m0));
      renderSelection([drag.id]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    containerRef.current?.releasePointerCapture?.(e.pointerId);

    if (strokeRef.current) {
      const svgEl = svgRef.current;
      strokeRef.current = null;
      if (svgEl) objectsRef.current = ensureObjectIds(svgEl);
      emitChange();
      return;
    }
    if (toolRef.current === 'eraser') {
      if (erasedRef.current) emitChange();
      erasedRef.current = false;
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.mode === 'marquee') {
      if (marqueeRef.current) marqueeRef.current.style.display = 'none';
      const svgEl = svgRef.current;
      const base = drag.baseSelection ?? [];
      if (!drag.moved || !svgEl || !drag.startUser) {
        setSelectedIds(base);
        return;
      }
      const cur = toRootUser(e.clientX, e.clientY);
      const box: Box = {
        minX: Math.min(drag.startUser.x, cur.x),
        minY: Math.min(drag.startUser.y, cur.y),
        maxX: Math.max(drag.startUser.x, cur.x),
        maxY: Math.max(drag.startUser.y, cur.y),
      };
      const merged = [...base];
      for (const info of objectsRef.current) {
        const obj = findObjectById(svgEl, info.id);
        if (
          obj &&
          boxesIntersect(box, transformedBox(svgEl, obj)) &&
          !merged.includes(info.id)
        ) {
          merged.push(info.id);
        }
      }
      setSelectedIds(merged);
      return;
    }

    if (drag.moved) emitChange();
  };

  const selectTool = (next: Tool) => {
    setTool(next);
    if (next !== 'select') setSelectedIds([]);
  };

  const cursor =
    tool === 'pen' || tool === 'highlighter'
      ? 'crosshair'
      : tool === 'eraser'
        ? 'cell'
        : 'default';

  const toolBtn = (
    value: Tool,
    Icon: React.ComponentType<{ className?: string }>,
    label: string
  ) => (
    <button
      type="button"
      onClick={() => selectTool(value)}
      title={label}
      aria-label={label}
      aria-pressed={tool === value}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        tool === value
          ? 'bg-indigo-600 text-white'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        role="presentation"
      />

      {/* Floating tool palette */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur">
        {toolBtn('select', MousePointer2, 'Select')}
        {toolBtn('pen', Pen, 'Pen')}
        {toolBtn('highlighter', Highlighter, 'Highlighter')}
        {toolBtn('eraser', Eraser, 'Eraser')}
        <div className="mx-1 h-6 w-px bg-slate-200" />
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setPenColor(c)}
            title={`Color ${c}`}
            aria-label={`Color ${c}`}
            className={`h-5 w-5 rounded-full border-2 transition-transform ${
              penColor === c
                ? 'scale-110 border-slate-800'
                : 'border-white hover:scale-105'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="mx-1 h-6 w-px bg-slate-200" />
        {PEN_WIDTHS.map((w, i) => (
          <button
            key={w}
            type="button"
            onClick={() => setPenWidth(w)}
            title={`Width ${['thin', 'medium', 'thick'][i]}`}
            aria-label={`Width ${['thin', 'medium', 'thick'][i]}`}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              penWidth === w ? 'bg-slate-200' : 'hover:bg-slate-100'
            }`}
          >
            <span
              className="rounded-full bg-slate-700"
              style={{ width: w + 2, height: w + 2 }}
            />
          </button>
        ))}
      </div>

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

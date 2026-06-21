import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { PEN_COLORS, PEN_WIDTHS, Tool, isShapeTool } from './pageEditorTypes';

/** Normalized hotspot box, in fractions of the page's intrinsic size. */
export interface NormalizedBox {
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
}

export interface LinkRequest {
  objectId: string;
  box: NormalizedBox;
}

/**
 * Emitted after a copy-paste or duplicate that produced new linked objects.
 * Lets the host persist a fresh NotebookObjectLink per clone (host owns the
 * `id` and `sourcePage`, which the editor doesn't know about).
 */
export interface ClonedLinkInfo {
  newObjectId: string;
  targetPage: number;
  box: NormalizedBox;
}

/**
 * Imperative handle the host can hold via a ref, so the editor toolbar can
 * trigger selection-scoped actions (layer reordering, background change)
 * without lifting all of PageEditor's selection state up to the parent.
 * The handle is reassigned whenever the underlying callbacks change.
 */
export interface PageEditorImperativeApi {
  /** Re-order the current selection within the page's foreground group. */
  reorder: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
  /** Replace the page background with a solid color, pattern, or image. */
  setBackground: (background: PageBackgroundChange) => void;
}

export type PageBackgroundChange =
  | { kind: 'color'; color: string }
  | { kind: 'pattern'; pattern: 'lines' | 'grid' | 'dots'; color: string }
  | { kind: 'image'; dataUrl: string };

interface ClipboardEntry {
  /** Serialized outerHTML of the copied SVG object. */
  svg: string;
  /** Target page if the original was linked, else null. */
  targetPage: number | null;
}

interface PageEditorProps {
  /** Raw page SVG text (from a parsed notebook page). */
  svg: string;
  className?: string;
  /**
   * Tool/color/width are controlled by the host (PageEditorOverlay) so the
   * toolbar can live in the workspace chrome instead of floating over the
   * canvas. Optional with safe defaults so the dev harness and unit tests
   * can mount PageEditor directly without wiring a toolbar.
   */
  tool?: Tool;
  penColor?: string;
  penWidth?: number;
  /** Font size for new text objects dropped via the Text tool. */
  textSize?: number;
  /** Hit-radius (in screen px) for the eraser tool. */
  eraserSize?: number;
  /**
   * Map of objectId → target page for hotspot links on the *current* page.
   * Used so a Ctrl/Cmd+click on a linked object can follow its hyperlink
   * directly without opening the picker.
   */
  linkedObjectTargets?: Record<string, number>;
  /** Notifies the host which objects are selected (id + kind); empty when none. */
  onSelectionChange?: (selection: EditableObjectInfo[]) => void;
  /** Fires (with the cleaned, persistable SVG) after any edit. */
  onChange?: (svg: string) => void;
  /**
   * Fires when the user clicks the link FAB on a single selected object.
   * The host opens its own target-page picker and persists the link.
   * Box is the object's AABB in page-fractional coordinates, captured at
   * click time so the workspace can record a hotspot without re-reading
   * the SVG.
   */
  onRequestLink?: (request: LinkRequest) => void;
  /**
   * Fires when the user Ctrl/Cmd+clicks a linked object. The host should
   * navigate to the target page.
   */
  onFollowLink?: (targetPage: number) => void;
  /**
   * Fires after a paste or duplicate that produced new linked objects.
   * The host should persist one NotebookObjectLink per entry, generating
   * the link id and using the current page as the sourcePage.
   */
  onClonedLinks?: (clones: ClonedLinkInfo[]) => void;
  /**
   * Lets the host call imperative editor actions (layer reorder, background
   * change). Populated on mount and kept in sync via an effect — null when
   * the editor isn't mounted yet, e.g. while the page is still fetching.
   */
  imperativeApiRef?: React.MutableRefObject<PageEditorImperativeApi | null>;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNER_SET = new Set<string>(['nw', 'ne', 'sw', 'se']);

interface DragState {
  mode: 'move' | 'resize' | 'marquee' | 'rotate';
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
  // rotate: object center in root user space + initial pointer angle (deg).
  // We rotate around the captured pivot rather than recomputing the AABB
  // centre each frame so the object pivots about a stable point instead of
  // drifting as the bounding box reshapes during rotation.
  pivot?: { x: number; y: number };
  startAngleDeg?: number;
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

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD_PX = 3;
const HANDLE_PX = 10;
const MIN_SCALE = 0.05;
const EDIT_MATRIX_ATTR = 'data-edit-matrix';
const HANDLE_ATTR = 'data-edit-handle';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

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
  tool = 'select',
  penColor = PEN_COLORS[0],
  penWidth = PEN_WIDTHS[1],
  textSize = 36,
  eraserSize = 24,
  linkedObjectTargets,
  onSelectionChange,
  onChange,
  onRequestLink,
  onFollowLink,
  onClonedLinks,
  imperativeApiRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Group holding one highlight rect per selected object.
  const selGroupRef = useRef<SVGGElement | null>(null);
  // Rubber-band rect drawn while marquee-selecting.
  const marqueeRef = useRef<SVGRectElement | null>(null);
  const handlesRef = useRef<Map<Corner, SVGRectElement>>(new Map());
  // Rotation handle is a small group (stem + dot) drawn above the top-centre
  // of the selection box. Stored separately from the corner handles because
  // its geometry and pointer semantics are different (rotation, not resize).
  const rotateHandleRef = useRef<{
    group: SVGGElement;
    stem: SVGLineElement;
    dot: SVGCircleElement;
  } | null>(null);
  // Link FAB: small circular badge offset from the bbox's top-right corner.
  // Click (not drag) on this group calls onRequestLink so the host can show a
  // target-page picker. Separate from corner / rotate handles because the
  // interaction is a click, not a drag-and-update.
  // For LINKED objects the chain FAB means "manage link" (change/remove);
  // for UNLINKED objects it means "add link". A separate followHandleRef
  // appears next to it on linked objects for the primary "jump" action.
  const linkHandleRef = useRef<{
    group: SVGGElement;
    bg: SVGCircleElement;
    icon: SVGPathElement;
  } | null>(null);
  // Follow-link FAB: arrow icon, only visible when the selected object has a
  // link. Clicking jumps to the target page via onFollowLink. Sits next to
  // the chain FAB so the two together communicate "go" vs. "manage".
  const followHandleRef = useRef<{
    group: SVGGElement;
    bg: SVGCircleElement;
    icon: SVGPathElement;
  } | null>(null);
  const onRequestLinkRef = useRef(onRequestLink);

  onRequestLinkRef.current = onRequestLink;

  const onFollowLinkRef = useRef(onFollowLink);

  onFollowLinkRef.current = onFollowLink;

  const linkedObjectTargetsRef = useRef(linkedObjectTargets);

  linkedObjectTargetsRef.current = linkedObjectTargets;

  const onClonedLinksRef = useRef(onClonedLinks);

  onClonedLinksRef.current = onClonedLinks;
  const objectsRef = useRef<EditableObjectInfo[]>([]);
  const dragRef = useRef<DragState | null>(null);
  // Active freehand stroke (pen/highlighter) and eraser session.
  const strokeRef = useRef<{ path: SVGPathElement; d: string } | null>(null);
  const erasedRef = useRef(false);
  // Active shape (rect/circle/line/arrow) drag — captures the start point
  // and a reference to the SVG element being shaped so pointermove can
  // update its dimensions live. The wrapping <g> carries the editable id.
  const shapeRef = useRef<{
    tool: 'rect' | 'circle' | 'line' | 'arrow';
    wrapper: SVGGElement;
    shape: SVGElement;
    arrowhead?: SVGPolygonElement;
    startX: number;
    startY: number;
  } | null>(null);
  // The exact SVG string we last emitted upstream via onChange. When the
  // host's autosave round-trips that same content back to us (as the new
  // `svg` prop) we recognize it and skip resetting the DOM — otherwise the
  // mid-flight drag would be wiped when its own resize's autosave lands a
  // moment later. Reference equality is enough because the host stores and
  // returns the same string instance via editedSvgsRef.
  const lastEmittedSvgRef = useRef<string | null>(null);
  // First-load baseline string used as the initial undo target — captured
  // from the prop on mount so Cmd+Z from the very first edit restores the
  // page as it was loaded.
  const initialSvgRef = useRef<string | null>(null);
  // Per-page undo / redo stacks. Cleared automatically when the editor
  // remounts on a page change (key={currentPage} in the host). Capped so
  // a long session of editing doesn't pin large SVG strings forever.
  // Heavy entries (e.g. a page with an embedded data: URL background) blow
  // the budget at the normal depth, so anything above LARGE_ENTRY_BYTES
  // tightens the cap to LARGE_ENTRY_UNDO_DEPTH to keep heap bounded.
  const MAX_UNDO_DEPTH = 50;
  const LARGE_ENTRY_BYTES = 500_000;
  const LARGE_ENTRY_UNDO_DEPTH = 5;
  const pastSvgStackRef = useRef<string[]>([]);
  const futureSvgStackRef = useRef<string[]>([]);
  // Per-editor-instance clipboard. Scoped to this PageEditor so two notebook
  // widgets don't share state and copied content can't leak across sign-out
  // within the SPA. Survives page-navigation remounts because PageEditor's
  // host keys on currentPage and re-creates this ref fresh per page.
  const clipboardRef = useRef<ClipboardEntry[]>([]);
  // Timestamp of the last text-edit commit (blur or Enter). The pointerdown
  // that triggered the blur ALSO fires this component's onPointerDown a
  // moment later — by then React has flushed the setEditing(null) from the
  // blur handler, so the text-tool branch sees a stale `editing=null` and
  // would happily drop a second text at the click point. This timestamp
  // lets that branch recognize "we just closed an editor; this click is
  // the same click that did it" and bail out.
  const lastEditingCloseAtRef = useRef<number>(0);

  const onSelRef = useRef(onSelectionChange);
  const onChangeRef = useRef(onChange);
  // Assign in the render body so handlers always read the latest callbacks.
  // CLAUDE.md: "Assign refs directly in the render body — no effect needed."
  onSelRef.current = onSelectionChange;
  onChangeRef.current = onChange;

  // Mirror controlled tool props into refs so the pointer handlers always see
  // the latest value at fire time. Assigning in render body is the project's
  // documented escape hatch for ref mirroring (CLAUDE.md "useEffect is an
  // escape hatch"). The selection-clear on tool change is handled below,
  // after selectedIds state is declared.
  const toolRef = useRef(tool);
  const penColorRef = useRef(penColor);
  const penWidthRef = useRef(penWidth);

  toolRef.current = tool;

  penColorRef.current = penColor;

  penWidthRef.current = penWidth;

  const textSizeRef = useRef(textSize);
  textSizeRef.current = textSize;
  const eraserSizeRef = useRef(eraserSize);
  eraserSizeRef.current = eraserSize;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    value: string;
    initialValue: string;
    isPlaceholder: boolean;
  } | null>(null);

  // Synchronous cancel flag: set to true in the Escape keyDown handler
  // BEFORE setEditing(null) so that the stale onBlur={applyTextEdit} closure
  // can see it and bail out without persisting the discarded text.
  // A ref is used (not state) because the write must be visible to the blur
  // handler that fires in the same synchronous event-processing microtask —
  // a queued state update would not be committed in time.
  // Identical pattern to RandomGroups.GroupDropZone (PR #1965).
  const cancellingRef = useRef(false);
  if (editing) cancellingRef.current = false;

  // PageEditor is purely write-only after mount: it reads the `svg` prop
  // exactly once (in the mount effect below) and never reacts to subsequent
  // prop changes. The host's autosave feedback (Storage URL bouncing back
  // through Firestore → editedSvgsRef → cachedSvg → svg prop) used to flow
  // back in here as a "round-trip" we tried to defensively skip, but the
  // skip was reference-equality based and fragile — any mismatch tore down
  // the live DOM. One-way data flow is simpler and safer: the host can
  // hold whatever it wants, the editor doesn't care.

  // Drop any active selection when the host switches off the select tool —
  // otherwise the highlight rect / handles would linger over a pen or
  // eraser canvas.
  const [prevTool, setPrevTool] = useState(tool);
  if (tool !== prevTool) {
    setPrevTool(tool);
    if (tool !== 'select' && selectedIds.length > 0) {
      setSelectedIds([]);
    }
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
      if (rotateHandleRef.current) {
        rotateHandleRef.current.group.style.display = 'none';
      }
      if (linkHandleRef.current) {
        linkHandleRef.current.group.style.display = 'none';
      }
      if (followHandleRef.current) {
        followHandleRef.current.group.style.display = 'none';
      }
      return;
    }
    const onlyLinkedTarget = linkedObjectTargetsRef.current?.[ids[0]];
    const isLinked = onlyLinkedTarget !== undefined;
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

    // Rotation handle: stem rises from the top edge midpoint, dot sits above.
    // Stem length scales with the handle size so it stays proportional on
    // zoom / viewport changes.
    if (rotateHandleRef.current) {
      const { group, stem: rStem, dot: rDot } = rotateHandleRef.current;
      const midX = (box.minX + box.maxX) / 2;
      const stemBottom = box.minY;
      const stemTop = box.minY - hs * 2.25;
      rStem.setAttribute('x1', String(midX));
      rStem.setAttribute('y1', String(stemBottom));
      rStem.setAttribute('x2', String(midX));
      rStem.setAttribute('y2', String(stemTop));
      rDot.setAttribute('cx', String(midX));
      rDot.setAttribute('cy', String(stemTop));
      rDot.setAttribute('r', String(hs / 2));
      group.style.display = '';
    }

    // FAB layout: chain FAB ("manage/add link") sits closest to the bbox
    // top-right corner. When the object is linked, a follow-link FAB (arrow
    // icon) sits next to it as the primary "jump" action. We always position
    // the chain FAB first; when linked, we shift it left and place the arrow
    // FAB to its right (further out from the corner).
    const fabRadius = hs * 0.95;
    const layoutFab = (
      handle: {
        group: SVGGElement;
        bg: SVGCircleElement;
        icon: SVGPathElement;
      },
      cx: number,
      cy: number
    ) => {
      const { group, bg, icon } = handle;
      bg.setAttribute('cx', String(cx));
      bg.setAttribute('cy', String(cy));
      bg.setAttribute('r', String(fabRadius));
      // Icon paths are authored in a 24×24 box; translate + scale to fit
      // inside the badge with a small margin.
      const iconScale = (fabRadius * 1.3) / 24;
      icon.setAttribute(
        'transform',
        `translate(${cx - 12 * iconScale} ${cy - 12 * iconScale}) scale(${iconScale})`
      );
      group.style.display = '';
    };
    if (linkHandleRef.current) {
      const linkCx = box.maxX + fabRadius * 1.1;
      const linkCy = box.minY - fabRadius * 1.1;
      layoutFab(linkHandleRef.current, linkCx, linkCy);
    }
    if (followHandleRef.current) {
      if (isLinked) {
        // Arrow FAB sits to the right of the chain FAB, sharing the same y.
        const followCx = box.maxX + fabRadius * 3.4;
        const followCy = box.minY - fabRadius * 1.1;
        layoutFab(followHandleRef.current, followCx, followCy);
      } else {
        followHandleRef.current.group.style.display = 'none';
      }
    }
  }, []);

  const emitChange = useCallback(() => {
    if (!svgRef.current) return;
    const serialized = exportEditedSvg(svgRef.current);
    // Snapshot the baseline that was in effect BEFORE this edit so the
    // user can Cmd+Z back to it. The very first emit uses the initial
    // prop string (page-as-loaded) since lastEmittedSvgRef hasn't been
    // populated by a previous emit yet. Identical strings are skipped
    // so a no-op pointerup (e.g. drag below the threshold) doesn't fill
    // the stack with duplicates.
    const previousBaseline = lastEmittedSvgRef.current ?? initialSvgRef.current;
    if (previousBaseline !== null && previousBaseline !== serialized) {
      pastSvgStackRef.current.push(previousBaseline);
      const cap =
        previousBaseline.length > LARGE_ENTRY_BYTES
          ? LARGE_ENTRY_UNDO_DEPTH
          : MAX_UNDO_DEPTH;
      while (pastSvgStackRef.current.length > cap) {
        pastSvgStackRef.current.shift();
      }
      // Any new edit invalidates the redo branch — user has committed
      // to a different future from this point.
      futureSvgStackRef.current = [];
    }
    lastEmittedSvgRef.current = serialized;
    onChangeRef.current?.(serialized);
  }, []);

  // Cmd+Z restores the SVG to the most recent past baseline. Cmd+Shift+Z
  // replays the next future. Both rebuild the DOM directly via
  // rebuildEditorDom — emitting and waiting for the prop round-trip
  // would be skipped by the isOwnRoundTrip guard above. We dispatch
  // through rebuildEditorDomRef rather than a direct closure over
  // rebuildEditorDom because that callback is declared further down
  // the file (its useCallback can't be moved without ferrying around
  // 150 lines of overlay-creation code), and a const-ref pattern is
  // the cleanest way to break the forward-reference cycle.
  const rebuildEditorDomRef = useRef<((svgString: string) => void) | null>(
    null
  );
  const undo = useCallback(() => {
    if (pastSvgStackRef.current.length === 0) return;
    const prev = pastSvgStackRef.current.pop();
    if (prev === undefined) return;
    if (lastEmittedSvgRef.current !== null) {
      futureSvgStackRef.current.push(lastEmittedSvgRef.current);
    }
    rebuildEditorDomRef.current?.(prev);
    lastEmittedSvgRef.current = prev;
    setSelectedIds([]);
    setEditing(null);
    onChangeRef.current?.(prev);
  }, []);

  const redo = useCallback(() => {
    if (futureSvgStackRef.current.length === 0) return;
    const next = futureSvgStackRef.current.pop();
    if (next === undefined) return;
    if (lastEmittedSvgRef.current !== null) {
      pastSvgStackRef.current.push(lastEmittedSvgRef.current);
    }
    rebuildEditorDomRef.current?.(next);
    lastEmittedSvgRef.current = next;
    setSelectedIds([]);
    setEditing(null);
    onChangeRef.current?.(next);
  }, []);

  // Rebuild the editor DOM from a serialized SVG string. Owns all overlay
  // creation (selection group, corner handles, rotate handle, link FABs,
  // marquee). Pulled out of the mount effect so undo / redo can re-init
  // the DOM directly without needing the host to push a new svg prop
  // through (the autosave round-trip skip would block that path).
  const rebuildEditorDom = useCallback((svgString: string) => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = prepareEditableSvg(svgString);
    const el = container.querySelector('svg');
    svgRef.current = el;
    handlesRef.current = new Map();
    rotateHandleRef.current = null;
    linkHandleRef.current = null;
    followHandleRef.current = null;
    dragRef.current = null;
    strokeRef.current = null;
    shapeRef.current = null;
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

    // Rotation handle: a short vertical stem above the top edge of the
    // bounding box, capped with a small circle. The whole group carries
    // data-edit-handle="rotate" so pointer events on either the stem or
    // the dot enter the rotate branch of handlePointerDown.
    const rotateGroup = document.createElementNS(SVG_NS, 'g');
    rotateGroup.setAttribute(EDIT_OVERLAY_ATTR, '1');
    rotateGroup.setAttribute(HANDLE_ATTR, 'rotate');
    rotateGroup.style.cursor = 'grab';
    rotateGroup.style.display = 'none';
    const stem = document.createElementNS(SVG_NS, 'line');
    stem.setAttribute('stroke', '#6366f1');
    stem.setAttribute('stroke-width', '1.5');
    stem.setAttribute('vector-effect', 'non-scaling-stroke');
    stem.setAttribute('pointer-events', 'stroke');
    rotateGroup.appendChild(stem);
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('fill', '#ffffff');
    dot.setAttribute('stroke', '#6366f1');
    dot.setAttribute('stroke-width', '1.5');
    dot.setAttribute('vector-effect', 'non-scaling-stroke');
    rotateGroup.appendChild(dot);
    el.appendChild(rotateGroup);
    rotateHandleRef.current = { group: rotateGroup, stem, dot };

    // Link FAB — circular badge offset above-right of the selection box.
    // Uses a tinted background + lucide "link" icon path so the affordance
    // reads at a glance. Only ever appears for single selections.
    const linkGroup = document.createElementNS(SVG_NS, 'g');
    linkGroup.setAttribute(EDIT_OVERLAY_ATTR, '1');
    linkGroup.setAttribute(HANDLE_ATTR, 'link');
    linkGroup.style.cursor = 'pointer';
    linkGroup.style.display = 'none';
    const linkBg = document.createElementNS(SVG_NS, 'circle');
    linkBg.setAttribute('fill', '#6366f1');
    linkBg.setAttribute('stroke', '#ffffff');
    linkBg.setAttribute('stroke-width', '1.5');
    linkBg.setAttribute('vector-effect', 'non-scaling-stroke');
    linkGroup.appendChild(linkBg);
    // Compact link-chain path (lucide "link" mark, simplified for small sizes).
    // The transform attribute is set in renderSelection so it scales to fit
    // the badge regardless of zoom.
    const linkIcon = document.createElementNS(SVG_NS, 'path');
    linkIcon.setAttribute(
      'd',
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
    );
    linkIcon.setAttribute('fill', 'none');
    linkIcon.setAttribute('stroke', '#ffffff');
    linkIcon.setAttribute('stroke-width', '2');
    linkIcon.setAttribute('stroke-linecap', 'round');
    linkIcon.setAttribute('stroke-linejoin', 'round');
    linkIcon.setAttribute('vector-effect', 'non-scaling-stroke');
    linkIcon.setAttribute('pointer-events', 'none');
    linkGroup.appendChild(linkIcon);
    el.appendChild(linkGroup);
    linkHandleRef.current = { group: linkGroup, bg: linkBg, icon: linkIcon };

    // Follow-link FAB — arrow icon, emerald background so it visually
    // separates from the chain "manage" FAB. Only shown when the selected
    // object has a link; clicking jumps to the target page.
    const followGroup = document.createElementNS(SVG_NS, 'g');
    followGroup.setAttribute(EDIT_OVERLAY_ATTR, '1');
    followGroup.setAttribute(HANDLE_ATTR, 'follow-link');
    followGroup.style.cursor = 'pointer';
    followGroup.style.display = 'none';
    const followBg = document.createElementNS(SVG_NS, 'circle');
    followBg.setAttribute('fill', '#10b981');
    followBg.setAttribute('stroke', '#ffffff');
    followBg.setAttribute('stroke-width', '1.5');
    followBg.setAttribute('vector-effect', 'non-scaling-stroke');
    followGroup.appendChild(followBg);
    // Right-arrow path (lucide "arrow-right"), authored in a 24×24 box.
    const followIcon = document.createElementNS(SVG_NS, 'path');
    followIcon.setAttribute('d', 'M5 12h14M13 5l7 7-7 7');
    followIcon.setAttribute('fill', 'none');
    followIcon.setAttribute('stroke', '#ffffff');
    followIcon.setAttribute('stroke-width', '2.5');
    followIcon.setAttribute('stroke-linecap', 'round');
    followIcon.setAttribute('stroke-linejoin', 'round');
    followIcon.setAttribute('vector-effect', 'non-scaling-stroke');
    followIcon.setAttribute('pointer-events', 'none');
    followGroup.appendChild(followIcon);
    el.appendChild(followGroup);
    followHandleRef.current = {
      group: followGroup,
      bg: followBg,
      icon: followIcon,
    };

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
  }, []);

  rebuildEditorDomRef.current = rebuildEditorDom;

  // Mount-once initialization. Runs exactly when this PageEditor instance
  // first appears (or remounts via a key change — currentPage is the host's
  // key, so page navigation and notebook switches naturally trigger a fresh
  // mount). Subsequent `svg` prop changes are intentionally ignored: the
  // editor owns its own DOM state from here on and only writes upstream.
  useEffect(() => {
    rebuildEditorDom(svg);
    initialSvgRef.current = svg;
    pastSvgStackRef.current = [];
    futureSvgStackRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderSelection(selectedIds);
    const infos = selectedIds
      .map((id) => objectsRef.current.find((o) => o.id === id))
      .filter((o): o is EditableObjectInfo => Boolean(o));
    onSelRef.current?.(infos);
    // linkedObjectTargets is read via ref inside renderSelection, but the
    // FAB layout depends on whether the current selection is linked. Re-run
    // selection rendering when the link map for the active page changes
    // (e.g. teacher just added or removed a link) so the arrow FAB appears
    // or disappears without needing to re-select the object.
  }, [selectedIds, renderSelection, linkedObjectTargets]);

  // Compute a NormalizedBox in page-fraction coordinates from a freshly
  // appended clone. Used by both duplicate and paste to construct the new
  // link hotspot. Returns null if the viewBox is degenerate (treat the clone
  // as un-linkable in that case rather than persisting bogus coordinates).
  const normalizedBoxFor = useCallback(
    (svgEl: SVGSVGElement, obj: SVGGraphicsElement): NormalizedBox | null => {
      const vb = svgEl.viewBox.baseVal;
      if (!vb || vb.width <= 0 || vb.height <= 0) return null;
      const box = transformedBox(svgEl, obj);
      return {
        xFrac: box.minX / vb.width,
        yFrac: box.minY / vb.height,
        wFrac: (box.maxX - box.minX) / vb.width,
        hFrac: (box.maxY - box.minY) / vb.height,
      };
    },
    []
  );

  const duplicateSelected = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || selectedIds.length === 0) return;
    const newIds: string[] = [];
    const newLinks: ClonedLinkInfo[] = [];
    const linkMap = linkedObjectTargetsRef.current ?? {};
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
      // Carry the link forward so duplicates of a linked object are also
      // linked. Compute the hotspot from the post-translate position so the
      // link follows the duplicate to its offset location.
      const targetPage = linkMap[id];
      if (targetPage !== undefined) {
        const box = normalizedBoxFor(svgEl, clone);
        if (box) {
          newLinks.push({ newObjectId: newId, targetPage, box });
        }
      }
    }
    if (newIds.length === 0) return;
    objectsRef.current = ensureObjectIds(svgEl);
    setSelectedIds(newIds);
    emitChange();
    if (newLinks.length > 0) onClonedLinksRef.current?.(newLinks);
  }, [selectedIds, emitChange, normalizedBoxFor]);

  const copySelected = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || selectedIds.length === 0) return;
    const linkMap = linkedObjectTargetsRef.current ?? {};
    const entries: ClipboardEntry[] = [];
    for (const id of selectedIds) {
      const obj = findObjectById(svgEl, id);
      if (!obj) continue;
      entries.push({
        svg: obj.outerHTML,
        targetPage: linkMap[id] ?? null,
      });
    }
    if (entries.length > 0) clipboardRef.current = entries;
  }, [selectedIds]);

  // Insert a freshly built SVG element into the page foreground as a new
  // editable object. Used by image / text paste from the OS clipboard.
  // Returns the new edit id, or null if there's no live svg / foreground.
  const insertNewObject = useCallback(
    (innerEl: SVGElement): string | null => {
      const svgEl = svgRef.current;
      if (!svgEl) return null;
      const fg = findForeground(svgEl);
      if (!fg) return null;
      const wrapper = document.createElementNS(SVG_NS, 'g');
      const newId = `obj-paste-${crypto.randomUUID()}`;
      wrapper.setAttribute('data-edit-id', newId);
      wrapper.setAttribute(ORIG_TRANSFORM_ATTR, '');
      wrapper.appendChild(innerEl);
      fg.appendChild(wrapper);
      objectsRef.current = ensureObjectIds(svgEl);
      setSelectedIds([newId]);
      emitChange();
      return newId;
    },
    [emitChange]
  );

  // Paste an OS-clipboard image. Reads the file as a base64 data URL so the
  // SVG is self-contained (no Storage upload needed). We probe natural
  // dimensions first so the image lands at its real aspect ratio, capped to
  // ~half the page so a 4K screenshot doesn't dwarf the slide.
  const pasteImageFile = useCallback(
    (file: File) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const vb = svgEl.viewBox.baseVal;
      const pageW = vb && vb.width > 0 ? vb.width : 1000;
      const pageH = vb && vb.height > 0 ? vb.height : 750;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== 'string') return;
        const probe = new Image();
        probe.onload = () => {
          const nw = probe.naturalWidth || pageW * 0.4;
          const nh = probe.naturalHeight || pageH * 0.4;
          const maxW = pageW * 0.5;
          const maxH = pageH * 0.5;
          const scale = Math.min(1, maxW / nw, maxH / nh);
          const w = nw * scale;
          const h = nh * scale;
          const x = (vb?.x ?? 0) + (pageW - w) / 2;
          const y = (vb?.y ?? 0) + (pageH - h) / 2;
          const img = document.createElementNS(SVG_NS, 'image');
          img.setAttribute('href', dataUrl);
          // Both the xlink:href and href attrs are recognized by SVG 2 /
          // SVG 1.1 viewers respectively. Setting both keeps older renderers
          // happy (e.g. some Firefox versions still favor xlink).
          img.setAttributeNS(
            'http://www.w3.org/1999/xlink',
            'xlink:href',
            dataUrl
          );
          img.setAttribute('x', String(x));
          img.setAttribute('y', String(y));
          img.setAttribute('width', String(w));
          img.setAttribute('height', String(h));
          img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          insertNewObject(img);
        };
        probe.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [insertNewObject]
  );

  // Paste OS-clipboard text. Multi-line strings split into <tspan> rows so
  // line breaks survive the round-trip; dblclick on the resulting object
  // opens the existing text editor for follow-up edits.
  const pasteTextString = useCallback(
    (text: string) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const vb = svgEl.viewBox.baseVal;
      const pageW = vb && vb.width > 0 ? vb.width : 1000;
      const pageH = vb && vb.height > 0 ? vb.height : 750;
      const lines = text.split(/\r?\n/);
      const fontSize = Math.max(16, Math.round(pageH * 0.035));
      const x = (vb?.x ?? 0) + pageW / 2;
      const y = (vb?.y ?? 0) + pageH / 2 - (lines.length - 1) * fontSize * 0.6;
      const textEl = document.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('x', String(x));
      textEl.setAttribute('y', String(y));
      textEl.setAttribute('font-family', 'sans-serif');
      textEl.setAttribute('font-size', String(fontSize));
      textEl.setAttribute('fill', '#111827');
      textEl.setAttribute('text-anchor', 'middle');
      lines.forEach((line, i) => {
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.setAttribute('x', String(x));
        if (i > 0) tspan.setAttribute('dy', `${fontSize * 1.2}`);
        tspan.textContent = line;
        textEl.appendChild(tspan);
      });
      insertNewObject(textEl);
    },
    [insertNewObject]
  );

  const pasteFromClipboard = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || clipboardRef.current.length === 0) return;
    const fg = findForeground(svgEl);
    if (!fg) return;
    // Parse via a temporary SVG host so each clipboard entry deserializes
    // back into a real Element with the correct SVG namespace; appending
    // the parsed node directly into the live foreground would otherwise
    // miss the namespace and silently render nothing.
    const parser = new DOMParser();
    const newIds: string[] = [];
    const newLinks: ClonedLinkInfo[] = [];
    for (const entry of clipboardRef.current) {
      const doc = parser.parseFromString(
        `<svg xmlns="${SVG_NS}">${entry.svg}</svg>`,
        'image/svg+xml'
      );
      if (doc.querySelector('parsererror')) continue;
      const sourceEl = doc.documentElement.firstElementChild;
      if (!sourceEl) continue;
      const clone = sourceEl.cloneNode(true) as SVGGraphicsElement;
      const newId = `obj-paste-${crypto.randomUUID()}`;
      clone.setAttribute('data-edit-id', newId);
      // Reset edit-bookkeeping so the pasted object starts fresh: its
      // original transform becomes the new baseline, with no leftover
      // edit-matrix from prior moves on the source page.
      clone.setAttribute(
        ORIG_TRANSFORM_ATTR,
        clone.getAttribute('transform') ?? ''
      );
      clone.removeAttribute(EDIT_MATRIX_ATTR);
      fg.appendChild(clone);
      applyEditMatrix(clone, new DOMMatrix().translateSelf(20, 20));
      newIds.push(newId);
      if (entry.targetPage !== null) {
        const box = normalizedBoxFor(svgEl, clone);
        if (box) {
          newLinks.push({
            newObjectId: newId,
            targetPage: entry.targetPage,
            box,
          });
        }
      }
    }
    if (newIds.length === 0) return;
    objectsRef.current = ensureObjectIds(svgEl);
    setSelectedIds(newIds);
    emitChange();
    if (newLinks.length > 0) onClonedLinksRef.current?.(newLinks);
  }, [emitChange, normalizedBoxFor]);

  // Layer ordering: SVG paint order is sibling order in the foreground group,
  // so reordering data-edit-id'd children IS the z-order. Bring-forward /
  // send-backward swap with the adjacent sibling; to-front / to-back move
  // to the edge. Iteration direction matters for multi-select: when moving
  // forward, iterate selection in REVERSE document order so each swap doesn't
  // bump the next selected sibling out of place; mirrored for backward.
  const reorderSelected = useCallback(
    (direction: 'forward' | 'backward' | 'front' | 'back') => {
      const svgEl = svgRef.current;
      if (!svgEl || selectedIds.length === 0) return;
      const fg = findForeground(svgEl);
      if (!fg) return;
      const selectedSet = new Set(selectedIds);
      // Snapshot the current sibling order so we can iterate stably even
      // as we mutate fg's children below.
      const orderedSelected = Array.from(fg.children)
        .filter((c) => selectedSet.has(c.getAttribute('data-edit-id') ?? ''))
        .map((c) => c as SVGGraphicsElement);
      if (orderedSelected.length === 0) return;
      if (direction === 'front') {
        for (const obj of orderedSelected) fg.appendChild(obj);
      } else if (direction === 'back') {
        // Reverse so the first-selected ends up frontmost among the moved
        // group, matching how "send to back" works in design tools.
        for (let i = orderedSelected.length - 1; i >= 0; i--) {
          const obj = orderedSelected[i];
          if (obj !== fg.firstChild) {
            fg.insertBefore(obj, fg.firstChild);
          }
        }
      } else if (direction === 'forward') {
        for (let i = orderedSelected.length - 1; i >= 0; i--) {
          const obj = orderedSelected[i];
          const next = obj.nextElementSibling;
          if (
            next &&
            !selectedSet.has(next.getAttribute('data-edit-id') ?? '')
          ) {
            fg.insertBefore(next, obj);
          }
        }
      } else {
        for (const obj of orderedSelected) {
          const prev = obj.previousElementSibling;
          if (
            prev &&
            !selectedSet.has(prev.getAttribute('data-edit-id') ?? '')
          ) {
            fg.insertBefore(obj, prev);
          }
        }
      }
      objectsRef.current = ensureObjectIds(svgEl);
      emitChange();
    },
    [selectedIds, emitChange]
  );

  // Replace the page background with a solid color, repeating pattern, or
  // uploaded image. Finds the existing g.background group (every imported
  // .notebook/.spartnb page has one); if it's missing, we synthesize one
  // and insert before the foreground so it paints behind editable objects.
  // Pattern definitions are pushed into the page's <defs> so the bg rect
  // can reference them by id; existing pattern defs with our prefix are
  // cleaned up first to avoid orphans piling up across rounds of changes.
  const setBackground = useCallback(
    (change: PageBackgroundChange) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const vb = svgEl.viewBox.baseVal;
      const w = vb && vb.width > 0 ? vb.width : 1000;
      const h = vb && vb.height > 0 ? vb.height : 750;
      const x = vb?.x ?? 0;
      const y = vb?.y ?? 0;
      // Find or create the background group, positioned BEFORE the
      // foreground so it paints behind editable content.
      let bg = svgEl.querySelector<SVGGElement>(
        'g.background, g[class~="background"]'
      );
      if (!bg) {
        bg = document.createElementNS(SVG_NS, 'g');
        bg.setAttribute('class', 'background');
        const fg = findForeground(svgEl);
        if (fg) svgEl.insertBefore(bg, fg);
        else svgEl.appendChild(bg);
      }
      while (bg.firstChild) bg.removeChild(bg.firstChild);
      // Clean up any previously-injected pattern definitions so old ones
      // don't accumulate when the teacher cycles through patterns.
      svgEl
        .querySelectorAll('defs [id^="spartboard-bg-"]')
        .forEach((n) => n.remove());

      if (change.kind === 'color') {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', change.color);
        bg.appendChild(rect);
      } else if (change.kind === 'pattern') {
        // Ensure a <defs> exists at the root for the pattern reference.
        let defs = svgEl.querySelector('defs');
        if (!defs) {
          defs = document.createElementNS(SVG_NS, 'defs');
          svgEl.insertBefore(defs, svgEl.firstChild);
        }
        const patternId = `spartboard-bg-${crypto.randomUUID()}`;
        const pattern = document.createElementNS(SVG_NS, 'pattern');
        pattern.setAttribute('id', patternId);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        const cellSize = Math.max(20, Math.round(Math.min(w, h) / 30));
        pattern.setAttribute('width', String(cellSize));
        pattern.setAttribute('height', String(cellSize));
        if (change.pattern === 'lines') {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('y1', String(cellSize));
          line.setAttribute('x2', String(cellSize));
          line.setAttribute('y2', String(cellSize));
          line.setAttribute('stroke', '#94a3b8');
          line.setAttribute('stroke-width', '1');
          pattern.appendChild(line);
        } else if (change.pattern === 'grid') {
          const path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', `M ${cellSize} 0 L 0 0 0 ${cellSize}`);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', '#cbd5e1');
          path.setAttribute('stroke-width', '1');
          pattern.appendChild(path);
        } else {
          // dots
          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', String(cellSize / 2));
          dot.setAttribute('cy', String(cellSize / 2));
          dot.setAttribute('r', '1.2');
          dot.setAttribute('fill', '#94a3b8');
          pattern.appendChild(dot);
        }
        defs.appendChild(pattern);
        // Two rects: solid base color so the pattern reads against
        // whatever the teacher picked, then the pattern overlay.
        const base = document.createElementNS(SVG_NS, 'rect');
        base.setAttribute('x', String(x));
        base.setAttribute('y', String(y));
        base.setAttribute('width', String(w));
        base.setAttribute('height', String(h));
        base.setAttribute('fill', change.color);
        bg.appendChild(base);
        const overlay = document.createElementNS(SVG_NS, 'rect');
        overlay.setAttribute('x', String(x));
        overlay.setAttribute('y', String(y));
        overlay.setAttribute('width', String(w));
        overlay.setAttribute('height', String(h));
        overlay.setAttribute('fill', `url(#${patternId})`);
        bg.appendChild(overlay);
      } else {
        // image — embed the data URL directly so the page SVG remains
        // self-contained (no Storage upload needed).
        const img = document.createElementNS(SVG_NS, 'image');
        img.setAttribute('href', change.dataUrl);
        img.setAttributeNS(
          'http://www.w3.org/1999/xlink',
          'xlink:href',
          change.dataUrl
        );
        img.setAttribute('x', String(x));
        img.setAttribute('y', String(y));
        img.setAttribute('width', String(w));
        img.setAttribute('height', String(h));
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        bg.appendChild(img);
      }
      emitChange();
    },
    [emitChange]
  );

  // Publish the imperative handle so the host can drive layer-order and
  // background changes from its toolbar. Re-runs whenever the underlying
  // callbacks change so the handle always points at the latest closures.
  useEffect(() => {
    if (!imperativeApiRef) return;
    imperativeApiRef.current = {
      reorder: reorderSelected,
      setBackground,
    };
    return () => {
      if (imperativeApiRef.current) imperativeApiRef.current = null;
    };
  }, [imperativeApiRef, reorderSelected, setBackground]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (isEditableTarget(e.target)) return;
      // Undo / Redo land in their own branch so they fire whether or not
      // anything is selected — the prior emit might've been a paste with
      // selection still active, or a tool-mode action with no selection.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === 'z' || e.key === 'Z')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // Cmd+Y as the alternate redo binding (Windows convention).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        return;
      }
      if (selectedIds.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Consume the event before it reaches the widget root — DraggableWindow
        // also treats Delete as "remove this widget". This listener is in the
        // capture phase (see below) so stopPropagation here actually beats
        // React's root onKeyDown, which a window *bubble* listener cannot.
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
        duplicateSelected();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        e.stopPropagation();
        copySelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        // Cmd+] / Ctrl+] — bring forward one layer.
        // With Shift: bring all the way to the front.
        e.preventDefault();
        e.stopPropagation();
        reorderSelected(e.shiftKey ? 'front' : 'forward');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        // Cmd+[ / Ctrl+[ — send backward one layer (Shift = to the back).
        e.preventDefault();
        e.stopPropagation();
        reorderSelected(e.shiftKey ? 'back' : 'backward');
      }
    };
    // Capture phase: the window listener fires before React's root onKeyDown,
    // so we can stop a selection-delete from also deleting the host widget.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    selectedIds,
    emitChange,
    editing,
    duplicateSelected,
    copySelected,
    reorderSelected,
    undo,
    redo,
  ]);

  // Paste handler — runs on the native `paste` event so the browser
  // populates clipboardData with whatever the OS clipboard has. Priority:
  //   1. If the in-app clipboard has objects (a Cmd+C happened inside this
  //      editor), paste those — most teachers Cmd+C → Cmd+V to duplicate
  //      across pages and expect THEIR copy to win over whatever the OS
  //      clipboard might also have lying around.
  //   2. Image data on the OS clipboard → SVG <image> (screenshots).
  //   3. Plain-text data on the OS clipboard → SVG <text>.
  // The listener is on window so it fires without the canvas being a
  // focused editable target; we early-return when editing a text node so
  // a paste inside the textarea behaves natively.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editing) return;
      if (isEditableTarget(e.target)) return;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      // In-app clipboard wins. Cross-page object copy/paste is the dominant
      // editor workflow; falling through to the OS clipboard first meant a
      // stale screenshot in the OS clipboard would silently override the
      // teacher's just-issued Cmd+C in the notebook.
      if (clipboardRef.current.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pasteFromClipboard();
        return;
      }
      const data = e.clipboardData;
      if (data) {
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              e.stopImmediatePropagation();
              pasteImageFile(file);
              return;
            }
          }
        }
        const text = data.getData('text/plain');
        if (text) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pasteTextString(text);
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [editing, pasteFromClipboard, pasteImageFile, pasteTextString]);

  // When a text edit opens, focus the field and put the caret at the end —
  // editing usually means appending, so starting at the far left is annoying.
  // Keyed on the edited id so re-clicking mid-text within a session isn't reset.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!editing || !ta) return;
    // Defer focus by one animation frame. When the editor opens via the
    // text-tool drop, the SAME pointerdown event is still in flight —
    // calling focus() synchronously can race with the pointer-up landing
    // on the canvas (which steals focus back to document.body in some
    // browsers). One rAF lets the pointer event settle before we grab
    // focus; the textarea is already in the DOM by render-commit time.
    const id = requestAnimationFrame(() => {
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

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
    const existing = readTextLines(obj);
    setSelectedIds([id]);
    setEditing({
      id,
      left: r.left - c.left,
      top: r.top - c.top,
      width: Math.max(r.width, 60),
      height: Math.max(r.height, 28),
      value: existing,
      initialValue: existing,
      isPlaceholder: false,
    });
  };

  const applyTextEdit = () => {
    // If the user pressed Escape just before this blur fired, bail out so
    // the stale closure doesn't persist text the user intended to discard.
    if (cancellingRef.current) {
      cancellingRef.current = false;
      setEditing(null);
      return;
    }
    const svgEl = svgRef.current;
    if (!svgEl || !editing) return;
    const obj = findObjectById(svgEl, editing.id);
    if (obj) {
      if (editing.isPlaceholder && editing.value === editing.initialValue) {
        obj.remove();
        objectsRef.current = ensureObjectIds(svgEl);
        setSelectedIds([]);
      } else {
        writeTextLines(obj, editing.value);
        renderSelection(selectedIds);
      }
      emitChange();
    }
    // Stamp the close so the click that triggered this blur doesn't ALSO
    // drop a new text in the text-tool branch — see the ref's docstring.
    lastEditingCloseAtRef.current = Date.now();
    setEditing(null);
  };

  // ---- ink helpers --------------------------------------------------------
  const eraseAt = (cx: number, cy: number) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    // Eraser size is a screen-space radius. We sample the center plus
    // eight points on the radius circle (cardinal + ordinal); any ink
    // object hit by any of those points is removed. Cheap and good
    // enough for whiteboard-style erasing — the radius is the visible
    // cursor diameter so users get what they see.
    const radius = Math.max(0, eraserSizeRef.current / 2);
    const samples: Array<[number, number]> = [[cx, cy]];
    if (radius > 0) {
      const r = radius;
      const d = r * 0.7071; // cos/sin 45deg
      samples.push(
        [cx + r, cy],
        [cx - r, cy],
        [cx, cy + r],
        [cx, cy - r],
        [cx + d, cy + d],
        [cx + d, cy - d],
        [cx - d, cy + d],
        [cx - d, cy - d]
      );
    }
    const hitIds = new Set<string>();
    for (const [sx, sy] of samples) {
      const target = document.elementFromPoint(sx, sy);
      if (!target) continue;
      const id = objectIdForTarget(svgEl, target);
      // Eraser removes anything it touches (ink, text, shapes, images).
      // The earlier ink-only restriction surprised teachers who expected
      // it to behave like the SMART Notebook eraser — wipe whatever is
      // under the cursor. They can still undo (Cmd+Z) if they erase
      // something on purpose.
      if (id) hitIds.add(id);
    }
    if (hitIds.size === 0) return;
    for (const id of hitIds) {
      findObjectById(svgEl, id)?.remove();
    }
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

    if (t === 'text') {
      // Suppress text-drop if we just closed a text editor in this same
      // click sequence. Without this, the pointerdown that blurred the
      // textarea ALSO ends up here with `editing` already cleared
      // (React's setEditing(null) from onBlur committed between the
      // blur and the pointerdown), and we'd drop a stray second text
      // at the click location.
      if (Date.now() - lastEditingCloseAtRef.current < 250) return;
      // If the user clicked an existing text object, open it for editing
      // instead of dropping another text on top — matches the dblclick
      // behavior and gives them a sane "click to edit" affordance while
      // the text tool is active.
      const hitId =
        objectIdForTarget(svgEl, e.target as Element) ??
        objectNearClient(svgEl, e.clientX, e.clientY);
      if (hitId) {
        const hitObj = findObjectById(svgEl, hitId);
        if (hitObj && getTextLeaves(hitObj).length > 0) {
          const container = containerRef.current;
          if (container) {
            const c = container.getBoundingClientRect();
            const r = hitObj.getBoundingClientRect();
            const existing = readTextLines(hitObj);
            setSelectedIds([hitId]);
            setEditing({
              id: hitId,
              left: r.left - c.left,
              top: r.top - c.top,
              width: Math.max(r.width, 120),
              height: Math.max(r.height, 32),
              value: existing,
              initialValue: existing,
              isPlaceholder: false,
            });
          }
          return;
        }
      }
      // Empty canvas — drop a new text object at the click point and
      // immediately open the inline editor. Color follows pen-color so
      // the active palette acts as a "current text color" too.
      const fg = findForeground(svgEl);
      if (!fg) return;
      const vb = svgEl.viewBox.baseVal;
      const pageH = vb && vb.height > 0 ? vb.height : 750;
      const p = toForegroundPoint(e.clientX, e.clientY);
      // textSize is expressed in screen px (what the toolbar slider shows);
      // convert it to user-space units so the rendered text matches the
      // chosen size regardless of how the page SVG is zoomed.
      const ctm = svgEl.getScreenCTM();
      const userScale = ctm ? 1 / Math.abs(ctm.a) : pageH / 750;
      const fontSize = Math.max(8, textSizeRef.current) * userScale;
      const wrapper = document.createElementNS(SVG_NS, 'g');
      const newId = `obj-text-${crypto.randomUUID()}`;
      wrapper.setAttribute('data-edit-id', newId);
      wrapper.setAttribute(ORIG_TRANSFORM_ATTR, '');
      const textEl = document.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('x', String(p.x));
      textEl.setAttribute('y', String(p.y));
      textEl.setAttribute('font-family', 'sans-serif');
      textEl.setAttribute('font-size', String(fontSize));
      textEl.setAttribute('fill', penColorRef.current);
      // Placeholder so the empty object is visible until the user types.
      // Replaced when the editor commits; removed (along with the wrapper)
      // if the user escapes or blurs without typing.
      const placeholder = 'Text';
      textEl.textContent = placeholder;
      wrapper.appendChild(textEl);
      fg.appendChild(wrapper);
      objectsRef.current = ensureObjectIds(svgEl);
      // Open the inline text editor over the new element so the user can
      // type immediately without an extra dblclick.
      const container = containerRef.current;
      if (container) {
        const c = container.getBoundingClientRect();
        const r = textEl.getBoundingClientRect();
        setSelectedIds([newId]);
        setEditing({
          id: newId,
          left: r.left - c.left,
          top: r.top - c.top,
          width: Math.max(r.width, 120),
          height: Math.max(r.height, 32),
          value: placeholder,
          initialValue: placeholder,
          isPlaceholder: true,
        });
      }
      emitChange();
      return;
    }

    if (isShapeTool(t)) {
      const fg = findForeground(svgEl);
      if (!fg) return;
      const p = toForegroundPoint(e.clientX, e.clientY);
      const color = penColorRef.current;
      const width = penWidthRef.current;
      const wrapper = document.createElementNS(SVG_NS, 'g');
      const newId = `obj-shape-${crypto.randomUUID()}`;
      wrapper.setAttribute('data-edit-id', newId);
      wrapper.setAttribute(ORIG_TRANSFORM_ATTR, '');
      let shape: SVGElement;
      let arrowhead: SVGPolygonElement | undefined;
      if (t === 'rect') {
        shape = document.createElementNS(SVG_NS, 'rect');
        shape.setAttribute('x', String(p.x));
        shape.setAttribute('y', String(p.y));
        shape.setAttribute('width', '0');
        shape.setAttribute('height', '0');
        shape.setAttribute('fill', 'none');
        shape.setAttribute('stroke', color);
        shape.setAttribute('stroke-width', String(width));
      } else if (t === 'circle') {
        // Authored as an ellipse so width and height can differ — matches
        // the "drag a bounding box" gesture more naturally than a perfect
        // circle would. Holding shift could constrain it later.
        shape = document.createElementNS(SVG_NS, 'ellipse');
        shape.setAttribute('cx', String(p.x));
        shape.setAttribute('cy', String(p.y));
        shape.setAttribute('rx', '0');
        shape.setAttribute('ry', '0');
        shape.setAttribute('fill', 'none');
        shape.setAttribute('stroke', color);
        shape.setAttribute('stroke-width', String(width));
      } else {
        // line or arrow — line element does the bulk; arrow adds a polygon
        // head whose orientation is recomputed each pointermove.
        shape = document.createElementNS(SVG_NS, 'line');
        shape.setAttribute('x1', String(p.x));
        shape.setAttribute('y1', String(p.y));
        shape.setAttribute('x2', String(p.x));
        shape.setAttribute('y2', String(p.y));
        shape.setAttribute('stroke', color);
        shape.setAttribute('stroke-width', String(width));
        shape.setAttribute('stroke-linecap', 'round');
        if (t === 'arrow') {
          arrowhead = document.createElementNS(SVG_NS, 'polygon');
          arrowhead.setAttribute('fill', color);
          arrowhead.setAttribute('points', '0,0 0,0 0,0');
        }
      }
      wrapper.appendChild(shape);
      if (arrowhead) wrapper.appendChild(arrowhead);
      fg.appendChild(wrapper);
      shapeRef.current = {
        tool: t as 'rect' | 'circle' | 'line' | 'arrow',
        wrapper,
        shape,
        arrowhead,
        startX: p.x,
        startY: p.y,
      };
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // select / move / resize / rotate
    const target = e.target as Element;
    // Walk up to the nearest [data-edit-handle] ancestor — corner rects ARE
    // the handle itself, but the rotation handle is a <g> with child <line>
    // / <circle>, so an exact-target lookup would miss it.
    const handleEl = target.closest(`[${HANDLE_ATTR}]`);
    const handle = handleEl?.getAttribute(HANDLE_ATTR) ?? null;

    if (handle === 'follow-link' && selectedIds.length === 1) {
      const targetPage = linkedObjectTargetsRef.current?.[selectedIds[0]];
      if (targetPage !== undefined) {
        e.preventDefault();
        onFollowLinkRef.current?.(targetPage);
      }
      // Click only — do not start a drag.
      return;
    }

    if (handle === 'link' && selectedIds.length === 1) {
      // Stop the native event from bubbling to document. Otherwise the same
      // pointerdown that mounts the LinkTargetPicker also fires
      // useClickOutside's document listener (the picker's effect attaches it
      // synchronously on mount, before this native event finishes bubbling),
      // which then dismisses the picker as a "click outside". Both calls are
      // required: React's stopPropagation only halts synthetic dispatch, while
      // the native call halts the addEventListener-based listener at document.
      e.stopPropagation();
      e.nativeEvent.stopPropagation();
      const obj = findObjectById(svgEl, selectedIds[0]);
      if (!obj) return;
      const vb = svgEl.viewBox.baseVal;
      // Need a populated viewBox to map AABB → normalized hotspot. Every
      // page SVG gets one via prepareEditableSvg, so a missing/zero viewBox
      // would be a real bug rather than an expected miss.
      if (vb && vb.width > 0 && vb.height > 0) {
        const box = transformedBox(svgEl, obj);
        onRequestLinkRef.current?.({
          objectId: selectedIds[0],
          box: {
            xFrac: box.minX / vb.width,
            yFrac: box.minY / vb.height,
            wFrac: (box.maxX - box.minX) / vb.width,
            hFrac: (box.maxY - box.minY) / vb.height,
          },
        });
      }
      // Click only — do not start a drag.
      return;
    }

    if (handle === 'rotate' && selectedIds.length === 1) {
      const obj = findObjectById(svgEl, selectedIds[0]);
      if (!obj) return;
      const box = transformedBox(svgEl, obj);
      // Pivot is the AABB centre captured at drag start. We hold it fixed
      // for the duration of the gesture so the object rotates around the
      // same point even as the AABB reshapes.
      const pivot = {
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2,
      };
      const userPt = toRootUser(e.clientX, e.clientY);
      const startAngleDeg =
        Math.atan2(userPt.y - pivot.y, userPt.x - pivot.x) * (180 / Math.PI);
      dragRef.current = {
        id: selectedIds[0],
        mode: 'rotate',
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        m0: readEditMatrix(obj),
        pivot,
        startAngleDeg,
      };
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (handle && CORNER_SET.has(handle) && selectedIds.length === 1) {
      const corner = handle as Corner;
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
        anchor: cornerPt[opposite[corner]],
        startCorner: cornerPt[corner],
      };
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const id =
      objectIdForTarget(svgEl, target) ??
      objectNearClient(svgEl, e.clientX, e.clientY);

    // Modifier-click on a linked object follows its hyperlink directly,
    // mirroring the present-mode hotspot behavior. Cmd on macOS, Ctrl
    // everywhere else; we accept either so muscle memory works on any platform.
    if (id && (e.metaKey || e.ctrlKey)) {
      const targetPage = linkedObjectTargetsRef.current?.[id];
      if (targetPage !== undefined) {
        e.preventDefault();
        onFollowLinkRef.current?.(targetPage);
        return;
      }
    }

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

    // Shape drag — update the in-flight rect/ellipse/line dimensions on
    // each pointermove. Negative widths/heights are flipped so dragging
    // up-and-left still produces a positive-sized rect that selects + edits
    // sanely afterward.
    const shape = shapeRef.current;
    if (shape) {
      const p = toForegroundPoint(e.clientX, e.clientY);
      const { startX, startY, tool: shapeTool, shape: el, arrowhead } = shape;
      if (shapeTool === 'rect') {
        const x = Math.min(startX, p.x);
        const y = Math.min(startY, p.y);
        el.setAttribute('x', String(x));
        el.setAttribute('y', String(y));
        el.setAttribute('width', String(Math.abs(p.x - startX)));
        el.setAttribute('height', String(Math.abs(p.y - startY)));
      } else if (shapeTool === 'circle') {
        const cx = (startX + p.x) / 2;
        const cy = (startY + p.y) / 2;
        const rx = Math.abs(p.x - startX) / 2;
        const ry = Math.abs(p.y - startY) / 2;
        el.setAttribute('cx', String(cx));
        el.setAttribute('cy', String(cy));
        el.setAttribute('rx', String(rx));
        el.setAttribute('ry', String(ry));
      } else {
        // line or arrow
        el.setAttribute('x2', String(p.x));
        el.setAttribute('y2', String(p.y));
        if (arrowhead) {
          const angle = Math.atan2(p.y - startY, p.x - startX);
          // Arrowhead size grows with stroke width so it stays proportional
          // to the line's visual weight.
          const headLen = Math.max(
            12,
            Number(el.getAttribute('stroke-width') ?? 2) * 4
          );
          const headWidth = headLen * 0.6;
          // Three points: tip at the line end, two base corners flared
          // back along the line direction by (cos±sin) rotation.
          const tipX = p.x;
          const tipY = p.y;
          const baseX = p.x - headLen * Math.cos(angle);
          const baseY = p.y - headLen * Math.sin(angle);
          const leftX = baseX + headWidth * Math.sin(angle);
          const leftY = baseY - headWidth * Math.cos(angle);
          const rightX = baseX - headWidth * Math.sin(angle);
          const rightY = baseY + headWidth * Math.cos(angle);
          arrowhead.setAttribute(
            'points',
            `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
          );
        }
      }
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
      return;
    }

    if (
      drag.mode === 'rotate' &&
      drag.id &&
      drag.m0 &&
      drag.pivot &&
      drag.startAngleDeg !== undefined
    ) {
      const obj = findObjectById(svgEl, drag.id);
      if (!obj) return;
      const userPt = toRootUser(e.clientX, e.clientY);
      const currentAngle =
        Math.atan2(userPt.y - drag.pivot.y, userPt.x - drag.pivot.x) *
        (180 / Math.PI);
      const deltaDeg = currentAngle - drag.startAngleDeg;
      // Rotation around the captured pivot: translate→rotate→translate-back,
      // then composed with the object's pre-drag matrix.
      const r = new DOMMatrix()
        .translateSelf(drag.pivot.x, drag.pivot.y)
        .rotateSelf(deltaDeg)
        .translateSelf(-drag.pivot.x, -drag.pivot.y);
      applyEditMatrix(obj, r.multiply(drag.m0));
      renderSelection([drag.id]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // releasePointerCapture throws NotFoundError when no active capture
    // exists for this pointerId — and optional chaining short-circuits on
    // null but does NOT swallow exceptions. Without this guard the throw
    // aborts the rest of this handler (including `dragRef.current = null`)
    // and the dragged object stays stuck to the cursor on every subsequent
    // pointermove. Implicit capture can be released by browser-side
    // pointercancel or by React reconciliation that briefly detaches the
    // captured element, so we have to assume it may already be gone.
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
        throw err;
      }
    }

    if (strokeRef.current) {
      const svgEl = svgRef.current;
      strokeRef.current = null;
      if (svgEl) objectsRef.current = ensureObjectIds(svgEl);
      emitChange();
      return;
    }
    // Shape commit. Tiny drags (< 5px in both axes) are treated as
    // accidental clicks and remove the placeholder shape instead of
    // dropping a zero-size object that's annoying to select afterward.
    const shape = shapeRef.current;
    if (shape) {
      const svgEl = svgRef.current;
      shapeRef.current = null;
      const p = toForegroundPoint(e.clientX, e.clientY);
      const dx = Math.abs(p.x - shape.startX);
      const dy = Math.abs(p.y - shape.startY);
      if (dx < 5 && dy < 5) {
        shape.wrapper.remove();
        if (svgEl) objectsRef.current = ensureObjectIds(svgEl);
        return;
      }
      if (svgEl) objectsRef.current = ensureObjectIds(svgEl);
      const newId = shape.wrapper.getAttribute('data-edit-id');
      if (newId) setSelectedIds([newId]);
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

  const cursor =
    tool === 'pen' || tool === 'highlighter' || isShapeTool(tool)
      ? 'crosshair'
      : tool === 'eraser'
        ? 'cell'
        : tool === 'text'
          ? 'text'
          : 'default';

  return (
    // data-no-drag opts this subtree out of DraggableWindow's drag-surface
    // (DRAG_BLOCKING_SELECTOR). Without it, every pointerdown on an object —
    // select, marquee, pen, eraser — also starts a widget drag, which fights
    // with the editor's own setPointerCapture and leaves objects feeling
    // "stuck" because both gestures are active at once.
    <div
      data-no-drag="true"
      className={`relative h-full w-full ${className ?? ''}`}
    >
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

      {editing && (
        <textarea
          ref={textareaRef}
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
              // Signal applyTextEdit (via onBlur) to bail out. This ref write
              // is synchronous and is therefore visible to the blur handler
              // that fires in the same microtask before React commits the
              // setEditing(null) state update below.
              cancellingRef.current = true;
              if (
                editing &&
                editing.isPlaceholder &&
                editing.value === editing.initialValue
              ) {
                const svgEl = svgRef.current;
                const obj = svgEl ? findObjectById(svgEl, editing.id) : null;
                if (obj && svgEl) {
                  obj.remove();
                  objectsRef.current = ensureObjectIds(svgEl);
                  setSelectedIds([]);
                  emitChange();
                }
              }
              lastEditingCloseAtRef.current = Date.now();
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

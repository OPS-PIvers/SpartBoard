import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  LineObject,
  PathObject,
  Point,
  RectObject,
  ShapeTool,
  TextObject,
} from '@/types';
import {
  renderArrow,
  renderEllipse,
  renderLine,
  renderRect,
} from './renderers/shapes';
import { renderObject, renderPathPoints } from './renderers/dispatcher';
import {
  renderSelectionChrome,
  TransformChromeState,
} from './renderers/selection';
import { DRAWING_DEFAULTS } from './constants';
import { getStrokedBoundingBox, type BoundingBox } from './hitTest';

interface UseDrawingCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  width: number;
  objects: DrawableObject[];
  onObjectComplete: (obj: DrawableObject) => void;
  /** If true, pointer events are ignored (e.g. student read-only view). */
  disabled?: boolean;
  /** Internal canvas resolution. Re-applies on change. */
  canvasSize: { width: number; height: number };
  /** Generate an id for a newly-completed object. Injected so tests can
   *  produce deterministic output without mocking crypto. */
  generateId?: () => string;
  /** Next z-index to assign to the completed object. Owned by caller so
   *  this hook stays stateless w.r.t. object history. */
  nextZ: number;
  /** Active drawing tool. Defaults to `'pen'` so older callers keep working. */
  activeTool?: ShapeTool;
  /** Fill toggle for rect/ellipse. Defaults to `false`. */
  shapeFill?: boolean;
  /**
   * Fired when the user clicks the canvas with the text tool active. The
   * hook builds a fresh empty `TextObject` at the click point and hands it
   * to the caller, which is expected to (a) persist the object and (b) open
   * the contenteditable overlay scoped to its id. Text creation is a click
   * (not a drag) and routes around the in-progress shape pipeline.
   */
  onTextSpawn?: (obj: TextObject) => void;
  /**
   * Currently-selected object (for selection chrome rendering). When non-null,
   * `renderSelectionChrome` paints a bbox + handles on top of the object
   * after the main render loop. Hit-testing and pointer routing for the
   * select tool live in `useSelection`; this hook just draws.
   */
  selectedObject?: DrawableObject | null;
  /** Active transform state (used to dim handle alpha during a drag). */
  transformState?: TransformChromeState | null;
  /**
   * Object to render INSTEAD of the underlying object with the same id.
   * Set per-pointermove by the widget during a transform so the live drag
   * is visible without the persisted `objects[]` changing. Cleared at
   * pointer-up when the commit lands.
   */
  previewObject?: DrawableObject | null;
}

interface UseDrawingCanvasResult {
  handleStart: (e: React.PointerEvent) => void;
  handleMove: (e: React.PointerEvent) => void;
  handleEnd: () => void;
  isDrawing: boolean;
}

// Discriminated in-flight state. Captures whichever geometry the active tool
// needs so handleMove/handleEnd can branch without re-reading activeTool.
type InProgress =
  | { kind: 'path'; tool: 'pen' | 'eraser'; points: Point[] }
  | {
      kind: 'rect' | 'ellipse';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | {
      kind: 'line' | 'arrow';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

/**
 * Shared canvas-drawing logic for the DrawingWidget and the AnnotationOverlay.
 * Renders a polymorphic list of DrawableObjects and captures freehand strokes
 * (pen/eraser) plus shape primitives (rect/ellipse/line/arrow) as new
 * `DrawableObject` instances.
 */
export const useDrawingCanvas = ({
  canvasRef,
  color,
  width,
  objects,
  onObjectComplete,
  disabled = false,
  canvasSize,
  generateId = () => crypto.randomUUID(),
  nextZ,
  activeTool = 'pen',
  shapeFill = false,
  onTextSpawn,
  selectedObject = null,
  transformState = null,
  previewObject = null,
}: UseDrawingCanvasOptions): UseDrawingCanvasResult => {
  const [isDrawing, setIsDrawing] = useState(false);
  const inProgressRef = useRef<InProgress | null>(null);
  // Image renderer onload callback: stored as a ref so the (module-level)
  // dispatcher can fire a redraw without us re-binding closures each render.
  // The current draw() effect installs the latest redraw into this ref.
  const triggerRedrawRef = useRef<(() => void) | null>(null);
  // Phase 2 PR 2.6 — incremental render bookkeeping. We remember the
  // last-rendered objects keyed by id; on each new render we diff against
  // the incoming list to identify which ids changed (added, removed, or
  // mutated by reference). When the dirty set is small enough we clear
  // ONLY the union bbox of the dirty objects (plus a stroke-width padding)
  // and re-render only objects whose bbox intersects that region — instead
  // of a full-canvas clear + N-object redraw. Reference-equality is the
  // right comparator here because the command-stack/subcollection sinks
  // always produce a new object on update; an unchanged object retains its
  // identity through the reducer's `map(o => o.id === ... ? next : o)`.
  const prevObjectsRef = useRef<Map<string, DrawableObject>>(new Map());

  const setPathContextStyles = useCallback(
    (ctx: CanvasRenderingContext2D, tool: 'pen' | 'eraser') => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = width;
    },
    [color, width]
  );

  /**
   * Live canvas-to-CSS scale (canvas internal px per CSS px). The selection
   * chrome must use this so a 10-screen-px handle stays 10 screen px when the
   * canvas is rendered at a non-1:1 ratio (e.g. CSS-scaled inside a parent
   * `transform: scale()`). Returns 1 when the canvas isn't laid out yet.
   */
  const getLiveScale = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return 1;
    return canvas.width / rect.width;
  }, [canvasRef]);

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      allObjects: DrawableObject[],
      inProgress: InProgress | null
    ) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Render in z-order so later PRs (text, image) can layer cleanly
      // without needing to touch this call site. When a transform preview is
      // active, swap in the preview object for the underlying object with
      // the same id so the live drag is visible without `objects[]` mutating.
      const effective = previewObject
        ? allObjects.map((o) => (o.id === previewObject.id ? previewObject : o))
        : allObjects;
      const sorted = [...effective].sort((a, b) => a.z - b.z);
      sorted.forEach((obj) =>
        renderObject(ctx, obj, () => triggerRedrawRef.current?.())
      );

      if (inProgress) {
        renderInProgress(ctx, inProgress, color, width, shapeFill);
      }

      // Selection chrome paints AFTER the object loop so it sits on top of
      // every object. Use the preview object's geometry when one is active
      // so the bbox + handles follow the live drag. The live canvas-to-CSS
      // scale keeps handle/dash widths constant on-screen regardless of any
      // parent `transform: scale()` on the dashboard.
      if (selectedObject) {
        const chromeTarget =
          previewObject && previewObject.id === selectedObject.id
            ? previewObject
            : selectedObject;
        renderSelectionChrome(
          ctx,
          chromeTarget,
          transformState,
          getLiveScale()
        );
      }
    },
    [
      color,
      width,
      shapeFill,
      selectedObject,
      transformState,
      previewObject,
      getLiveScale,
    ]
  );

  /**
   * Phase 2 PR 2.6 incremental draw. Clears the union bbox of `dirtyIds`
   * (padded for stroke width) and re-renders only objects whose bbox
   * intersects that region. Z-order is preserved by filtering the sorted
   * full list — a stale higher-z object that overlaps the dirty region
   * gets repainted on top so it doesn't appear behind the changed object.
   *
   * `previewObject` is applied as in the full draw. Selection chrome and
   * in-progress shapes are always re-rendered fresh — they're transient
   * and their bbox isn't reliably known until pointer-up.
   */
  const drawIncremental = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      allObjects: DrawableObject[],
      inProgress: InProgress | null,
      dirtyIds: Set<string>,
      prevObjects: Map<string, DrawableObject>
    ): void => {
      // Compute the union bbox of every dirty object across BOTH the
      // previous and next snapshots — a removed object leaves its old
      // pixels behind, so we must clear its pre-removal bbox.
      //
      // STROKE_PAD sits comfortably above the max supported stroke width
      // (currently 20px from Settings.tsx → half = 10) so adjacent thick
      // strokes aren't bitten when we clear a dirty region next to them.
      // The bbox we use for the union ALREADY includes each object's
      // stroke half-width (via `getStrokedBoundingBox`); STROKE_PAD is an
      // additional safety margin to absorb subpixel rasterization and any
      // stroke-extent we under-estimated for arrows/eraser composite ops.
      const STROKE_PAD = 24;
      let unionX = Infinity;
      let unionY = Infinity;
      let unionR = -Infinity;
      let unionB = -Infinity;
      const expand = (bbox: BoundingBox | null) => {
        if (!bbox) return;
        if (bbox.x < unionX) unionX = bbox.x;
        if (bbox.y < unionY) unionY = bbox.y;
        const right = bbox.x + bbox.w;
        const bottom = bbox.y + bbox.h;
        if (right > unionR) unionR = right;
        if (bottom > unionB) unionB = bottom;
      };
      const nextById = new Map(allObjects.map((o) => [o.id, o]));
      dirtyIds.forEach((id) => {
        const prev = prevObjects.get(id);
        if (prev) expand(getStrokedBoundingBox(prev));
        const next = nextById.get(id);
        if (next) expand(getStrokedBoundingBox(next));
      });
      // If nothing valid landed (e.g. every dirty entry was an empty path
      // whose stroked-bbox is null), bail to a full clear for safety.
      if (
        !Number.isFinite(unionX) ||
        !Number.isFinite(unionY) ||
        !Number.isFinite(unionR) ||
        !Number.isFinite(unionB)
      ) {
        draw(ctx, allObjects, inProgress);
        return;
      }
      const dirtyX = Math.max(0, Math.floor(unionX - STROKE_PAD));
      const dirtyY = Math.max(0, Math.floor(unionY - STROKE_PAD));
      const dirtyR = Math.min(ctx.canvas.width, Math.ceil(unionR + STROKE_PAD));
      const dirtyB = Math.min(
        ctx.canvas.height,
        Math.ceil(unionB + STROKE_PAD)
      );
      const dirtyW = dirtyR - dirtyX;
      const dirtyH = dirtyB - dirtyY;
      if (dirtyW <= 0 || dirtyH <= 0) return;

      ctx.clearRect(dirtyX, dirtyY, dirtyW, dirtyH);

      // Z-order matters even in the incremental path: clip to the dirty
      // region so anything we redraw can't accidentally paint outside the
      // cleared area.
      ctx.save();
      ctx.beginPath();
      ctx.rect(dirtyX, dirtyY, dirtyW, dirtyH);
      ctx.clip();

      const effective = previewObject
        ? allObjects.map((o) => (o.id === previewObject.id ? previewObject : o))
        : allObjects;
      const sorted = [...effective].sort((a, b) => a.z - b.z);
      // AABB overlap test against the dirty region using the STROKED bbox.
      // The geometric bbox ignores stroke half-width, so a thick neighbor
      // stroke that visually intrudes into the dirty region would be
      // skipped by a geometric-bbox check — and then look bitten because
      // we just cleared the dirty region underneath it.
      const intersects = (obj: DrawableObject): boolean => {
        const bbox = getStrokedBoundingBox(obj);
        if (!bbox) return false;
        if (bbox.x + bbox.w < dirtyX) return false;
        if (bbox.x > dirtyR) return false;
        if (bbox.y + bbox.h < dirtyY) return false;
        if (bbox.y > dirtyB) return false;
        return true;
      };
      sorted
        .filter((obj) => intersects(obj))
        .forEach((obj) =>
          renderObject(ctx, obj, () => triggerRedrawRef.current?.())
        );

      ctx.restore();

      if (inProgress) {
        renderInProgress(ctx, inProgress, color, width, shapeFill);
      }
      if (selectedObject) {
        const chromeTarget =
          previewObject && previewObject.id === selectedObject.id
            ? previewObject
            : selectedObject;
        renderSelectionChrome(
          ctx,
          chromeTarget,
          transformState,
          getLiveScale()
        );
      }
    },
    [
      draw,
      color,
      width,
      shapeFill,
      selectedObject,
      transformState,
      previewObject,
      getLiveScale,
    ]
  );

  // Apply canvas resolution + redraw on size / object-list change.
  // Incremental render: when fewer than ~25% of objects (and < 25 absolute)
  // have changed by reference since the last draw, clip to the union dirty
  // bbox instead of clearing the full canvas. Otherwise fall back to a
  // full clear+redraw (the original behavior).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sizeChanged =
      canvas.width !== canvasSize.width || canvas.height !== canvasSize.height;
    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    // Install the latest redraw closure for renderImage's onload callback.
    // Async image decodes resolve via this ref, so a freshly-pasted image
    // appears as soon as the bytes arrive — no polling, no setTimeout.
    // The redraw is always a full draw — async decode-completion doesn't
    // know which objects are "dirty" relative to anything.
    triggerRedrawRef.current = () => {
      const c = canvasRef.current;
      const c2 = c?.getContext('2d');
      if (c && c2) {
        draw(c2, objects, inProgressRef.current);
        prevObjectsRef.current = new Map(objects.map((o) => [o.id, o]));
      }
    };

    // Diff against last render. Reference-equality is the comparator:
    // every mutation produces a new object via map/spread, so identity
    // change = "this object's geometry or style is potentially different".
    const prev = prevObjectsRef.current;
    const dirtyIds = new Set<string>();
    const nextIds = new Set(objects.map((o) => o.id));
    objects.forEach((obj) => {
      const prevObj = prev.get(obj.id);
      if (!prevObj || prevObj !== obj) dirtyIds.add(obj.id);
    });
    prev.forEach((_obj, id) => {
      if (!nextIds.has(id)) dirtyIds.add(id);
    });

    // Selection chrome / preview-object / in-progress changes don't
    // produce a dirtyIds entry on their own but still need a full repaint
    // (they live outside the object list). The cheapest heuristic that
    // catches them: if there's an active in-progress draw, an active
    // preview, OR an active selection, do a full redraw. These are all
    // transient UI states — they don't last long enough for the perf cost
    // to matter, and skipping them risks ghosted handles.
    //
    // m3: when literally nothing has changed since the last render and no
    // transient UI state is active, do nothing. Without this guard, the
    // effect would repaint the canvas on every parent re-render even though
    // every pixel would be identical.
    if (
      !sizeChanged &&
      dirtyIds.size === 0 &&
      previewObject === null &&
      selectedObject === null &&
      inProgressRef.current === null
    ) {
      // Sync the prev-snapshot anyway so the diff stays consistent if a
      // future render adds a new dirty entry.
      prevObjectsRef.current = new Map(objects.map((o) => [o.id, o]));
      return;
    }

    const fallbackFull =
      sizeChanged ||
      prev.size === 0 ||
      dirtyIds.size === 0 ||
      // m7: skip incremental for tiny scenes — clearing the full canvas is
      // already cheap when there are < 25 objects total, so the incremental
      // overhead (diff, clip, intersect-filter) isn't worth it.
      objects.length < 25 ||
      dirtyIds.size >= 25 ||
      dirtyIds.size >= objects.length / 4 ||
      inProgressRef.current !== null ||
      previewObject !== null ||
      selectedObject !== null;

    if (fallbackFull) {
      draw(ctx, objects, inProgressRef.current);
    } else {
      drawIncremental(ctx, objects, inProgressRef.current, dirtyIds, prev);
    }
    prevObjectsRef.current = new Map(objects.map((o) => [o.id, o]));
  }, [
    canvasRef,
    canvasSize.width,
    canvasSize.height,
    objects,
    draw,
    drawIncremental,
    previewObject,
    selectedObject,
  ]);

  // Translate a pointer event's client coords into the canvas's internal
  // resolution (which is also the coordinate space stored on DrawableObjects).
  // Using the DOM-measured ratio of internal resolution to on-screen CSS size
  // handles any parent CSS `transform: scale()` and any internal-vs-CSS size
  // mismatch in a single step — matching the pattern used by SeatingChart.
  const getPos = useCallback(
    (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [canvasRef]
  );

  const handleStart = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const pos = getPos(e);

      // Text is a click-only spawn — no drag, no in-progress preview. Emit a
      // fresh empty TextObject through the caller and return without flipping
      // `isDrawing`, so the subsequent pointer-move/up are no-ops.
      if (activeTool === 'text') {
        if (!onTextSpawn) return;
        const spawned: TextObject = {
          id: generateId(),
          kind: 'text',
          z: nextZ,
          x: pos.x,
          y: pos.y,
          w: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_W,
          h: DRAWING_DEFAULTS.TEXT_PLACEHOLDER_H,
          content: '',
          fontFamily: DRAWING_DEFAULTS.TEXT_FONT_FAMILY,
          fontSize: DRAWING_DEFAULTS.TEXT_FONT_SIZE_PX,
          color: color ?? DRAWING_DEFAULTS.TEXT_COLOR,
        };
        onTextSpawn(spawned);
        return;
      }

      setIsDrawing(true);

      if (activeTool === 'pen' || activeTool === 'eraser') {
        inProgressRef.current = {
          kind: 'path',
          tool: activeTool,
          points: [pos],
        };
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          setPathContextStyles(ctx, activeTool);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        }
        return;
      }

      if (activeTool === 'rect' || activeTool === 'ellipse') {
        inProgressRef.current = {
          kind: activeTool,
          x0: pos.x,
          y0: pos.y,
          x1: pos.x,
          y1: pos.y,
        };
        return;
      }

      // line / arrow — the only remaining branches that emit through this
      // hook. Selection is routed away from the draw pipeline at the call
      // site (Widget.tsx) so we never see 'select' here, but guard against
      // future tool additions slipping through.
      if (activeTool !== 'line' && activeTool !== 'arrow') {
        setIsDrawing(false);
        return;
      }
      inProgressRef.current = {
        kind: activeTool,
        x1: pos.x,
        y1: pos.y,
        x2: pos.x,
        y2: pos.y,
      };
    },
    [
      disabled,
      getPos,
      canvasRef,
      setPathContextStyles,
      activeTool,
      onTextSpawn,
      generateId,
      nextZ,
      color,
    ]
  );

  const redrawWithInProgress = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, objects, inProgressRef.current);
  }, [canvasRef, draw, objects]);

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isDrawing) return;
      const pos = getPos(e);
      const inProgress = inProgressRef.current;
      if (!inProgress) return;

      if (inProgress.kind === 'path') {
        inProgress.points.push(pos);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && inProgress.points.length > 1) {
          setPathContextStyles(ctx, inProgress.tool);
          const prev = inProgress.points[inProgress.points.length - 2];
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          // m6: defensive composite reset. The eraser branch above sets
          // `destination-out`, and an exception thrown elsewhere in the
          // event loop between this segment and the next pointer-move
          // could leave the context in eraser mode and paint subsequent
          // shapes (in-progress previews, selection chrome) destructively.
          if (inProgress.tool === 'eraser') {
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        return;
      }

      if (inProgress.kind === 'rect' || inProgress.kind === 'ellipse') {
        inProgress.x1 = pos.x;
        inProgress.y1 = pos.y;
      } else if (inProgress.kind === 'line' || inProgress.kind === 'arrow') {
        inProgress.x2 = pos.x;
        inProgress.y2 = pos.y;
      }
      // Shape preview re-renders the full scene; pen/eraser intentionally
      // skip this to avoid clearing every prior in-flight stroke segment.
      redrawWithInProgress();
    },
    [
      disabled,
      isDrawing,
      getPos,
      canvasRef,
      setPathContextStyles,
      redrawWithInProgress,
    ]
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const inProgress = inProgressRef.current;
    inProgressRef.current = null;
    if (!inProgress) return;

    if (inProgress.kind === 'path') {
      if (inProgress.points.length > 1) {
        // Eraser strokes still need a color string on the persisted object so
        // the renderer recognises them; using the literal 'eraser' keeps
        // dispatcher logic identical for pen-mode rehydration.
        const persistedColor = inProgress.tool === 'eraser' ? 'eraser' : color;
        const completed: PathObject = {
          id: generateId(),
          kind: 'path',
          z: nextZ,
          points: inProgress.points,
          color: persistedColor,
          width,
        };
        onObjectComplete(completed);
      }
      return;
    }

    switch (inProgress.kind) {
      case 'rect':
      case 'ellipse': {
        const x = Math.min(inProgress.x0, inProgress.x1);
        const y = Math.min(inProgress.y0, inProgress.y1);
        const w = Math.abs(inProgress.x1 - inProgress.x0);
        const h = Math.abs(inProgress.y1 - inProgress.y0);
        if (w === 0 && h === 0) return; // degenerate
        const fill = shapeFill ? color : undefined;
        if (inProgress.kind === 'rect') {
          const completed: RectObject = {
            id: generateId(),
            kind: 'rect',
            z: nextZ,
            x,
            y,
            w,
            h,
            stroke: color,
            strokeWidth: width,
            fill,
          };
          onObjectComplete(completed);
        } else {
          const completed: EllipseObject = {
            id: generateId(),
            kind: 'ellipse',
            z: nextZ,
            x,
            y,
            w,
            h,
            stroke: color,
            strokeWidth: width,
            fill,
          };
          onObjectComplete(completed);
        }
        return;
      }
      case 'line':
      case 'arrow': {
        const { x1, y1, x2, y2 } = inProgress;
        if (x1 === x2 && y1 === y2) return; // degenerate
        if (inProgress.kind === 'line') {
          const completed: LineObject = {
            id: generateId(),
            kind: 'line',
            z: nextZ,
            x1,
            y1,
            x2,
            y2,
            stroke: color,
            strokeWidth: width,
          };
          onObjectComplete(completed);
        } else {
          const completed: ArrowObject = {
            id: generateId(),
            kind: 'arrow',
            z: nextZ,
            x1,
            y1,
            x2,
            y2,
            stroke: color,
            strokeWidth: width,
          };
          onObjectComplete(completed);
        }
        return;
      }
    }
  }, [isDrawing, onObjectComplete, color, width, generateId, nextZ, shapeFill]);

  return { handleStart, handleMove, handleEnd, isDrawing };
};

// Live-preview renderer for the in-flight shape. Uses the same renderers as
// committed objects so what-you-see-is-what-you-get during the drag.
const renderInProgress = (
  ctx: CanvasRenderingContext2D,
  inProgress: InProgress,
  color: string,
  width: number,
  shapeFill: boolean
): void => {
  if (inProgress.kind === 'path') {
    renderPathPoints(
      ctx,
      inProgress.points,
      inProgress.tool === 'eraser' ? 'eraser' : color,
      width
    );
    return;
  }

  switch (inProgress.kind) {
    case 'rect':
    case 'ellipse': {
      const x = Math.min(inProgress.x0, inProgress.x1);
      const y = Math.min(inProgress.y0, inProgress.y1);
      const w = Math.abs(inProgress.x1 - inProgress.x0);
      const h = Math.abs(inProgress.y1 - inProgress.y0);
      const fill = shapeFill ? color : undefined;
      if (inProgress.kind === 'rect') {
        renderRect(ctx, {
          id: '__preview__',
          kind: 'rect',
          z: 0,
          x,
          y,
          w,
          h,
          stroke: color,
          strokeWidth: width,
          fill,
        });
      } else {
        renderEllipse(ctx, {
          id: '__preview__',
          kind: 'ellipse',
          z: 0,
          x,
          y,
          w,
          h,
          stroke: color,
          strokeWidth: width,
          fill,
        });
      }
      return;
    }
    case 'line':
    case 'arrow': {
      const { x1, y1, x2, y2 } = inProgress;
      // n4: suppress the in-progress preview entirely for a degenerate
      // arrow (start === end). `renderArrow`'s head math `atan2(0,0)`
      // yields 0 and would paint a stray head pointing east at the
      // pointer-down spot before the user has dragged anywhere.
      if (inProgress.kind === 'arrow' && x1 === x2 && y1 === y2) return;
      const base = {
        id: '__preview__',
        z: 0,
        x1,
        y1,
        x2,
        y2,
        stroke: color,
        strokeWidth: width,
      } as const;
      if (inProgress.kind === 'line') {
        renderLine(ctx, { ...base, kind: 'line' });
      } else {
        renderArrow(ctx, { ...base, kind: 'arrow' });
      }
      return;
    }
  }
};

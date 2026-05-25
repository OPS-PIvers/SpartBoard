import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  ImageObject,
  LineObject,
  PathObject,
  Point,
  RectObject,
  ShapeTool,
  TextObject,
} from '@/types';
import {
  BoundingBox,
  HandleName,
  getBoundingBox,
  hitTestHandle,
  hitTestObjects,
  objectHonorsRotation,
  reverseRotatePoint,
  rotatePoint,
} from './hitTest';

export type TransformMode = 'translate' | 'rotate' | HandleName;

export interface TransformState {
  /** Which gesture is in flight. 'translate' = drag body; the 8 cardinal
   *  names = resize; 'rotate' = rotation handle. */
  mode: TransformMode;
  /** Canvas-space position where pointer-down landed. */
  origin: Point;
  /** Snapshot of the object at pointer-down. Wave 5 uses this to emit
   *  `{ before, after }` update commands from a single source. */
  startObj: DrawableObject;
  /** Bounding box at pointer-down — cached so resize math doesn't keep
   *  re-deriving it on every move. */
  startBbox: BoundingBox;
  /** Shift modifier latched at pointer-down (used for aspect-ratio lock on
   *  corner resizes). The latest event's shiftKey is preferred when present;
   *  this is the fallback. */
  shift: boolean;
}

interface UseSelectionOptions {
  objects: readonly DrawableObject[];
  activeTool: ShapeTool;
  /** Called per pointer-move with the in-flight transformed object. The
   *  consumer mirrors this into local-only React state — NEVER persists. A
   *  60fps drag fires this ~120 times in 2s; routing each through
   *  updateWidget would flood Firestore. */
  onTransformPreview: (next: DrawableObject) => void;
  /** Called exactly once on pointer-up with the final transformed object.
   *  This is the only path that touches updateWidget.
   *
   *  `before` is the snapshot captured at pointer-down (or pre-nudge for
   *  arrow-key gestures). Wave 5's command stack uses it to emit a single
   *  `{ kind: 'update', before, after }` command per gesture without the
   *  Widget having to introspect `transformState` from outside the hook. */
  onTransformCommit: (next: DrawableObject, before: DrawableObject) => void;
  /** Remove the currently selected object. Wired to Backspace/Delete. */
  onRemoveObject: (id: string) => void;
  /** Scale factor between canvas pixel space and on-screen CSS px. Used to
   *  size handle hit regions so a 10px screen handle still resolves at any
   *  zoom. Defaults to 1 (1:1 mapping). Prefer `canvasRef` over this when
   *  the canvas may be CSS-scaled — the live ratio off `getBoundingClientRect`
   *  is more accurate than a snapshot value plumbed through props. */
  scale?: number;
  /** When provided, the hook derives the canvas-to-CSS scale from
   *  `canvas.width / rect.width` at every pointer-down. This is the
   *  preferred way to thread scale through — a snapshotted `scale` prop
   *  can be stale if the canvas resizes between renders. */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

interface UseSelectionResult {
  selectedId: string | null;
  selectedObject: DrawableObject | null;
  transformState: TransformState | null;
  handleSelectPointerDown: (e: React.PointerEvent, pos: Point) => void;
  handleSelectPointerMove: (e: React.PointerEvent, pos: Point) => void;
  handleSelectPointerUp: (e: React.PointerEvent, pos: Point) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** Imperatively clear the selection. Wired from Widget when active tool
   *  switches away from 'select'. */
  clearSelection: () => void;
}

const ARROW_NUDGE_PX = 1;
const ARROW_NUDGE_SHIFT_PX = 10;

/**
 * Selection + transform hook. Owns the transient `selectedId` and the
 * in-flight `transformState`. Mutations to objects are split into a preview
 * channel (per move, local-only) and a commit channel (one updateWidget on
 * pointer-up). This split is the single most important invariant of Wave 4:
 * without it a 2-second drag at 60fps produces ~120 Firestore writes/sec.
 */
export const useSelection = ({
  objects,
  activeTool,
  onTransformPreview,
  onTransformCommit,
  onRemoveObject,
  scale = 1,
  canvasRef,
}: UseSelectionOptions): UseSelectionResult => {
  // Live canvas-to-CSS scale. When a `canvasRef` is supplied we always
  // prefer the bounding-rect-derived value — that handles parent
  // `transform: scale()` and post-resize states correctly. The `scale` prop
  // is the fallback for callers that don't have a canvas ref handy.
  const getScale = useCallback((): number => {
    const canvas = canvasRef?.current;
    if (!canvas) return scale;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return scale;
    return canvas.width / rect.width;
  }, [canvasRef, scale]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformState, setTransformState] = useState<TransformState | null>(
    null
  );
  // Latest in-flight transformed object. Held in a ref so pointer-up can
  // commit the final value without re-deriving from a stale closure.
  const latestTransformedRef = useRef<DrawableObject | null>(null);

  // selectedObject is derived from `selectedId` + `objects` so it
  // automatically follows external mutations (e.g. a remote sync update
  // changes the selected object's geometry — we still want to render
  // selection chrome at the new position).
  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId]
  );
  // Ref-mirror of `selectedObject` so `handleKeyDown` can read the current
  // selection without depending on it. Otherwise every `objects[]` mutation
  // (stroke completion, transform commit, remote sync) would invalidate
  // `handleKeyDown` and force AnnotationOverlay's window-keydown effect to
  // tear down + re-attach the listener — cheap but unnecessary churn.
  // The render-time ref assignment matches CLAUDE.md's "useEffect is an
  // escape hatch" guidance — see TextEditorOverlay for the same pattern.
  const selectedObjectRef = useRef<DrawableObject | null>(selectedObject);
  // eslint-disable-next-line react-hooks/refs
  selectedObjectRef.current = selectedObject;

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setTransformState(null);
    latestTransformedRef.current = null;
  }, []);

  const handleSelectPointerDown = useCallback(
    (e: React.PointerEvent, pos: Point) => {
      if (activeTool !== 'select') return;
      // Handles take priority over body hits when something is already
      // selected — a small handle inside the bbox of its own object would
      // otherwise be unreachable.
      if (selectedObject) {
        const handle = hitTestHandle(selectedObject, pos, getScale());
        if (handle) {
          const bbox = getBoundingBox(selectedObject);
          setTransformState({
            mode: handle === 'rotate' ? 'rotate' : handle,
            origin: pos,
            startObj: selectedObject,
            startBbox: bbox,
            shift: e.shiftKey,
          });
          latestTransformedRef.current = selectedObject;
          return;
        }
      }
      const hit = hitTestObjects(objects, pos);
      if (!hit) {
        // Click-empty clears selection.
        clearSelection();
        return;
      }
      setSelectedId(hit.id);
      // Pointer-down on a body starts a translate immediately so the user
      // can click-and-drag in a single gesture without releasing first.
      const bbox = getBoundingBox(hit);
      setTransformState({
        mode: 'translate',
        origin: pos,
        startObj: hit,
        startBbox: bbox,
        shift: e.shiftKey,
      });
      latestTransformedRef.current = hit;
    },
    [activeTool, objects, selectedObject, clearSelection, getScale]
  );

  const handleSelectPointerMove = useCallback(
    (e: React.PointerEvent, pos: Point) => {
      if (activeTool !== 'select') return;
      const state = transformState;
      if (!state) return;
      const next = applyTransform(state, pos, e.shiftKey || state.shift);
      latestTransformedRef.current = next;
      // Preview only — never persist.
      onTransformPreview(next);
    },
    [activeTool, transformState, onTransformPreview]
  );

  const handleSelectPointerUp = useCallback(
    (e: React.PointerEvent, pos: Point) => {
      if (activeTool !== 'select') return;
      const state = transformState;
      if (!state) return;
      const final = applyTransform(state, pos, e.shiftKey || state.shift);
      setTransformState(null);
      latestTransformedRef.current = null;
      // Skip the commit if the geometry didn't actually change (e.g. a bare
      // click that picked a body but never moved) — avoids a no-op write.
      if (!objectsEqual(state.startObj, final)) {
        onTransformCommit(final, state.startObj);
      }
    },
    [activeTool, transformState, onTransformCommit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (activeTool !== 'select') return;
      // Read selectedObject from the ref so this callback stays stable across
      // `objects[]` mutations — see selectedObjectRef declaration above.
      const sel = selectedObjectRef.current;
      if (!sel) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onRemoveObject(sel.id);
        clearSelection();
        return;
      }
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
        const step = e.shiftKey ? ARROW_NUDGE_SHIFT_PX : ARROW_NUDGE_PX;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const nudged = translateObject(sel, dx, dy);
        // Arrow nudges commit immediately — there's no drag gesture to
        // batch into, and a single keystroke producing a single write is
        // already on the Firestore-friendly side. Pass the pre-nudge object
        // as the before-snapshot so Wave 5's command stack records the
        // nudge as a `{ kind: 'update', before, after }` command.
        onTransformCommit(nudged, sel);
      }
    },
    [activeTool, onRemoveObject, onTransformCommit, clearSelection]
  );

  return {
    selectedId,
    selectedObject,
    transformState,
    handleSelectPointerDown,
    handleSelectPointerMove,
    handleSelectPointerUp,
    handleKeyDown,
    clearSelection,
  };
};

// ---------- Pure geometry helpers ----------

const objectsEqual = (a: DrawableObject, b: DrawableObject): boolean => {
  if (a.kind !== b.kind) return false;
  // Rotation is checked across all kinds — a rotate-only gesture leaves
  // positional fields untouched, so without this guard the commit would be
  // suppressed by the geometry-equal check.
  if ((a.rotation ?? 0) !== (b.rotation ?? 0)) return false;
  if (a.kind === 'line' || a.kind === 'arrow') {
    const bl = b as LineObject | ArrowObject;
    return a.x1 === bl.x1 && a.y1 === bl.y1 && a.x2 === bl.x2 && a.y2 === bl.y2;
  }
  if (a.kind === 'path') {
    const bp = b as PathObject;
    if (a.points.length !== bp.points.length) return false;
    for (let i = 0; i < a.points.length; i++) {
      if (a.points[i].x !== bp.points[i].x) return false;
      if (a.points[i].y !== bp.points[i].y) return false;
    }
    return true;
  }
  const br = b as RectObject | EllipseObject | TextObject | ImageObject;
  return a.x === br.x && a.y === br.y && a.w === br.w && a.h === br.h;
};

const translateObject = (
  obj: DrawableObject,
  dx: number,
  dy: number
): DrawableObject => {
  if (dx === 0 && dy === 0) return obj;
  switch (obj.kind) {
    case 'path':
      return {
        ...obj,
        points: obj.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case 'line':
    case 'arrow':
      return {
        ...obj,
        x1: obj.x1 + dx,
        y1: obj.y1 + dy,
        x2: obj.x2 + dx,
        y2: obj.y2 + dy,
      };
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'image':
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
  }
};

/**
 * Apply a resize derived from the dragged handle. The opposite corner/edge
 * is held fixed; the dragged handle moves to `pos`. When `shift` is held on
 * a corner drag, the larger of the two dimensional deltas wins so aspect
 * ratio is preserved.
 *
 * Returns the new bbox in {x, y, w, h} form, which the caller maps back
 * onto the object's kind-specific geometry.
 */
const resizeBbox = (
  startBbox: BoundingBox,
  handle: HandleName,
  pos: Point,
  shift: boolean
): BoundingBox => {
  // Start with the existing bbox edges; mutate the ones the handle controls.
  let left = startBbox.x;
  let top = startBbox.y;
  let right = startBbox.x + startBbox.w;
  let bottom = startBbox.y + startBbox.h;

  const isCorner =
    handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';

  switch (handle) {
    case 'nw':
      left = pos.x;
      top = pos.y;
      break;
    case 'n':
      top = pos.y;
      break;
    case 'ne':
      right = pos.x;
      top = pos.y;
      break;
    case 'e':
      right = pos.x;
      break;
    case 'se':
      right = pos.x;
      bottom = pos.y;
      break;
    case 's':
      bottom = pos.y;
      break;
    case 'sw':
      left = pos.x;
      bottom = pos.y;
      break;
    case 'w':
      left = pos.x;
      break;
    case 'rotate':
      // Shouldn't happen — rotate uses its own branch — but keep the bbox
      // unchanged just in case.
      break;
  }

  if (isCorner && shift && startBbox.w > 0 && startBbox.h > 0) {
    const aspect = startBbox.w / startBbox.h;
    const proposedW = right - left;
    const proposedH = bottom - top;
    // Match the larger dimension's proportional change.
    if (Math.abs(proposedW) >= Math.abs(proposedH) * aspect) {
      const newH = Math.abs(proposedW) / aspect;
      // Preserve the sign of the original drag direction.
      const signedH = proposedH >= 0 ? newH : -newH;
      if (handle === 'nw' || handle === 'ne') {
        top = bottom - signedH;
      } else {
        bottom = top + signedH;
      }
    } else {
      const newW = Math.abs(proposedH) * aspect;
      const signedW = proposedW >= 0 ? newW : -newW;
      if (handle === 'nw' || handle === 'sw') {
        left = right - signedW;
      } else {
        right = left + signedW;
      }
    }
  }

  // Normalize so we never produce a negative-width / negative-height bbox.
  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  const w = Math.abs(right - left);
  const h = Math.abs(bottom - top);
  return { x, y, w, h };
};

/**
 * Map a new bbox back onto an object's kind-specific geometry. For
 * shapes/text/image this is a direct x/y/w/h swap. For lines/arrows we
 * proportionally remap the endpoints. For paths we proportionally remap
 * every point.
 */
const applyBboxToObject = (
  obj: DrawableObject,
  startBbox: BoundingBox,
  next: BoundingBox
): DrawableObject => {
  switch (obj.kind) {
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'image':
      return { ...obj, x: next.x, y: next.y, w: next.w, h: next.h };
    case 'line':
    case 'arrow': {
      const remap = (px: number, py: number): Point => {
        const tx = startBbox.w === 0 ? 0 : (px - startBbox.x) / startBbox.w;
        const ty = startBbox.h === 0 ? 0 : (py - startBbox.y) / startBbox.h;
        return { x: next.x + tx * next.w, y: next.y + ty * next.h };
      };
      const p1 = remap(obj.x1, obj.y1);
      const p2 = remap(obj.x2, obj.y2);
      return { ...obj, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case 'path': {
      const remap = (px: number, py: number): Point => {
        const tx = startBbox.w === 0 ? 0 : (px - startBbox.x) / startBbox.w;
        const ty = startBbox.h === 0 ? 0 : (py - startBbox.y) / startBbox.h;
        return { x: next.x + tx * next.w, y: next.y + ty * next.h };
      };
      return {
        ...obj,
        points: obj.points.map((p) => remap(p.x, p.y)),
      };
    }
  }
};

/**
 * Compute the rotated object for a rotation gesture. The angle is the
 * difference between the pointer's current angle (relative to the bbox
 * center) and the pointer's origin angle.
 */
const rotateObject = (
  obj: DrawableObject,
  startBbox: BoundingBox,
  origin: Point,
  pos: Point
): DrawableObject => {
  const cx = startBbox.x + startBbox.w / 2;
  const cy = startBbox.y + startBbox.h / 2;
  const a0 = Math.atan2(origin.y - cy, origin.x - cx);
  const a1 = Math.atan2(pos.y - cy, pos.x - cx);
  const delta = a1 - a0;
  const base = obj.rotation ?? 0;
  return { ...obj, rotation: base + delta };
};

/**
 * Dispatch on the gesture mode and return the transformed object. Pure —
 * given the same inputs always produces the same output.
 *
 * Rotated-resize handling: for kinds that honor `rotation` with a non-zero
 * angle, the pointer (`pos`) and `state.origin` arrive in WORLD coords but
 * `resizeBbox` operates in the object's local (unrotated) frame. We reverse-
 * rotate both into local space, run the standard resize math there, then
 * remap the new local bbox back into a world-frame AABB whose center is
 * shifted so the pin point (opposite corner / edge of the dragged handle)
 * stays at its original WORLD position. Without this, dragging the visually-
 * NW handle of a rotated rect treats the world pointer as if it were a
 * local-frame coord and the rect's geometry corrupts on the first move.
 */
const applyTransform = (
  state: TransformState,
  pos: Point,
  shift: boolean
): DrawableObject => {
  if (state.mode === 'translate') {
    const dx = pos.x - state.origin.x;
    const dy = pos.y - state.origin.y;
    return translateObject(state.startObj, dx, dy);
  }
  if (state.mode === 'rotate') {
    return rotateObject(state.startObj, state.startBbox, state.origin, pos);
  }

  const rot = state.startObj.rotation ?? 0;
  const honorsRotation =
    objectHonorsRotation(state.startObj) && Number.isFinite(rot) && rot !== 0;

  // 8 resize handles. For rotated kinds, reverse-rotate the pointer into the
  // object's local frame before handing to resizeBbox.
  const oldCenter: Point = {
    x: state.startBbox.x + state.startBbox.w / 2,
    y: state.startBbox.y + state.startBbox.h / 2,
  };
  const localPos = honorsRotation
    ? reverseRotatePoint(pos, oldCenter, rot)
    : pos;
  const next = resizeBbox(state.startBbox, state.mode, localPos, shift);

  if (!honorsRotation) {
    return applyBboxToObject(state.startObj, state.startBbox, next);
  }

  // Pin-preservation math (see JSDoc above). The pin is the opposite
  // corner/edge of the dragged handle. In LOCAL frame the pin is at the same
  // local coord on both the start bbox and `next` (by construction of
  // resizeBbox — it only moves the edges the handle controls). So the
  // displacement of the bbox CENTER in local space is half the displacement
  // of the moved edges. Rotating that displacement by `rot` gives the
  // displacement of the center in world space; offsetting the start world
  // center by that gives the new world center. The persisted world AABB is
  // (new world center) − (next.w/2, next.h/2).
  const newLocalCenter: Point = {
    x: next.x + next.w / 2,
    y: next.y + next.h / 2,
  };
  const localCenterDelta: Point = {
    x: newLocalCenter.x - oldCenter.x,
    y: newLocalCenter.y - oldCenter.y,
  };
  // Rotate the local center-displacement by +rot to get the world
  // center-displacement.
  const worldCenterDelta = rotatePoint(localCenterDelta, { x: 0, y: 0 }, rot);
  const newWorldCenter: Point = {
    x: oldCenter.x + worldCenterDelta.x,
    y: oldCenter.y + worldCenterDelta.y,
  };
  const worldBbox: BoundingBox = {
    x: newWorldCenter.x - next.w / 2,
    y: newWorldCenter.y - next.h / 2,
    w: next.w,
    h: next.h,
  };
  return applyBboxToObject(state.startObj, state.startBbox, worldBbox);
};

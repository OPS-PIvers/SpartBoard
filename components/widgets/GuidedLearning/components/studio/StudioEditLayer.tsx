import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { GuidedLearningRegion, GuidedLearningStep } from '@/types';
import type { PctPoint, PxRect, StageGeometry } from '../../types/stage';
import {
  MIN_REGION_PCT,
  pointInRegion,
  regionPath,
  regionRect,
} from '../../utils/regionGeometry';
import {
  RESIZE_HANDLES,
  clearCalloutPin,
  dragBox,
  insertVertex,
  moveStep,
  nearestEdge,
  resizeBox,
  setVertex,
  stepBox,
  stepWithBox,
  withCalloutBox,
  type PctBox,
  type ResizeHandle,
} from './regionEdits';
import {
  SNAP_PX,
  snapMove,
  snapPoint,
  snapTargets,
  calloutSnapTargets,
  type SnapGuides,
} from './snapping';
import { findCallout, screenScale } from './canvasScale';
import { stepHasCallout } from '../../utils/calloutStyle';
import { createGesturePreview, type GesturePreview } from './gesturePreview';
import {
  CALLOUT_HANDLES,
  clientRectToContainer,
  containerRectToBox,
  isTooltipCallout,
  leaderEnd,
  resizeCalloutBox,
  type CalloutHandle,
} from './calloutHandles';
import { useDeviceFrame } from './deviceFrameContext';
import { CalloutToolbar } from './CalloutToolbar';
import { isDoubleTap, type Tap } from './touchGestures';

export type DrawShape = GuidedLearningRegion['shape'];

/** Pointer travel, in screen px, that turns a press into a drag. */
const DRAW_PX = 4;
const MOVE_UNSELECTED_PX = 6;
const MOVE_SELECTED_PX = 2;
const CALLOUT_PX = 4;
const CLOSE_POLYGON_PX = 8;
const HANDLE_PX = 10;
const HANDLE_HIT_PX = 24;
const REPEAT_CLICK_MS = 500;
/** Pins are hard to hit at their drawn size, so they get the player's touch target. */
const MIN_PIN_HIT_PX = 44;
/** Screen px above a selected callout that its toolbar needs before it flips below. */
const TOOLBAR_ROOM_PX = 56;

interface StudioEditLayerProps {
  g: StageGeometry;
  /** Canvas zoom around the device frame. */
  zoom: number;
  steps: GuidedLearningStep[];
  imageIndex: number;
  selectedStepId: string | null;
  adding: boolean;
  shape: DrawShape;
  polygonDraft: PctPoint[] | null;
  onPolygonDraft: (next: PctPoint[] | null) => void;
  onClosePolygon: (points: PctPoint[]) => void;
  onSelect: (id: string | null) => void;
  onChange: (step: GuidedLearningStep) => void;
  onAdd: (at: PctPoint, region?: GuidedLearningRegion) => void;
  onCalloutFocus: (focused: boolean) => void;
  onEditCallout: (id: string) => void;
  /** Inline text editing is open; pointer input goes to the callout fields. */
  editing: boolean;
  /** `gl-callout-editing`: callout hover outline, handles and anchor dot. */
  calloutEditing?: boolean;
  /** The selected step's callout (not its region) is selected. */
  calloutSelected?: boolean;
  /** The Studio's delete-step action, with its undo toast. */
  onDeleteStep?: (id: string) => void;
  beginGesture: () => void;
  endGesture: () => void;
}

type Gesture =
  | {
      kind: 'draw';
      start: PctPoint;
      client: Client;
      drawing: boolean;
      box: PctBox | null;
    }
  | {
      kind: 'move';
      step: GuidedLearningStep;
      start: PctPoint;
      client: Client;
      threshold: number;
      active: boolean;
    }
  | {
      kind: 'resize';
      step: GuidedLearningStep;
      handle: ResizeHandle;
      active: boolean;
    }
  | {
      kind: 'vertex';
      step: GuidedLearningStep;
      index: number;
      active: boolean;
    }
  | {
      kind: 'callout-size';
      step: GuidedLearningStep;
      handle: CalloutHandle;
      /** The card's rendered box at pointerdown, in container px. */
      box: PxRect;
      active: boolean;
    }
  | {
      kind: 'callout';
      step: GuidedLearningStep;
      /** The card's rendered box at pointerdown, in container px. */
      box: PxRect;
      client: Client;
      active: boolean;
    };
type Client = { x: number; y: number };
/** The fields of a pointer move that the edit layer reads. */
type Move = {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

const NO_GUIDES: SnapGuides = { x: null, y: null };

/** Studio edit layer: place, draw, select, move, resize, reshape and pin callouts on the stage. */
export const StudioEditLayer: React.FC<StudioEditLayerProps> = ({
  g,
  zoom,
  steps,
  imageIndex,
  selectedStepId,
  adding,
  shape,
  polygonDraft,
  onPolygonDraft,
  onClosePolygon,
  onSelect,
  onChange,
  onAdd,
  onCalloutFocus,
  onEditCallout,
  editing,
  calloutEditing = false,
  calloutSelected = false,
  onDeleteStep,
  beginGesture,
  endGesture,
}) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const lastClickRef = useRef<{ x: number; y: number; at: number } | null>(
    null
  );
  const lastTapRef = useRef<Tap | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<PctPoint | null>(null);
  const [drawBox, setDrawBox] = useState<PctBox | null>(null);
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES);
  // The step as the open gesture would leave it; only this layer renders it until pointerup.
  const [draft, setDraft] = useState<GuidedLearningStep | null>(null);
  // Where the open callout drag or resize has put the card, in container px.
  const [calloutShift, setCalloutShift] = useState<{
    id: string;
    rect: PxRect;
  } | null>(null);
  const previewRef = useRef<GesturePreview | null>(null);
  // Mirrors of the two above, read synchronously when the gesture ends.
  const draftRef = useRef<GuidedLearningStep | null>(null);
  const calloutShiftRef = useRef<typeof calloutShift>(null);
  // A dblclick right after a drag is the drag's own second click, not a request to edit.
  const draggedRef = useRef(false);
  // Pointer moves coalesce to one applied move per animation frame.
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<Move | null>(null);
  useEffect(() => {
    const frame = frameRef;
    const open = gestureRef;
    const preview = previewRef;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      preview.current?.restore();
      preview.current = null;
      // Unmounting mid-gesture (Blur, Play) drops it; nothing was written yet.
      open.current = null;
    };
  }, []);

  const slideSteps = steps.filter((s) => s.imageIndex === imageIndex);
  const committed = slideSteps.find((s) => s.id === selectedStepId) ?? null;
  // Frames, handles and vertices are drawn from the draft while a gesture is open.
  const selected = committed && draft?.id === committed.id ? draft : committed;
  const k = useDeviceFrame()?.k ?? 1;
  const scale = screenScale(g, k * zoom);
  const limit = {
    x: SNAP_PX / scale.pxPerPct.x,
    y: SNAP_PX / scale.pxPerPct.y,
  };
  const toPx = (p: PctPoint) => g.imagePctToContainerPx(p);
  const containerPt = (c: Client) => toPx(g.clientToImagePct(c.x, c.y));

  // Topmost first: pins sit above drawn regions, and later steps above earlier ones.
  const hitsAt = (c: Client): GuidedLearningStep[] => {
    const pt = containerPt(c);
    const hit = (s: GuidedLearningStep) => {
      const r = g.regionFor(s);
      const target =
        r.shape === 'pin'
          ? {
              ...r,
              w: Math.max(r.w, MIN_PIN_HIT_PX / scale.screenPerPx),
              h: Math.max(r.h, MIN_PIN_HIT_PX / scale.screenPerPx),
            }
          : r;
      return pointInRegion(pt, target);
    };
    const reversed = [...slideSteps].reverse();
    return [
      ...reversed.filter((s) => !s.region && hit(s)),
      ...reversed.filter((s) => s.region && hit(s)),
    ];
  };

  const calloutRectOf = (id: string): DOMRect | null => {
    const stage = rootRef.current?.closest('[data-gl-stage]');
    return findCallout(stage, id)?.getBoundingClientRect() ?? null;
  };
  const inRect = (r: DOMRect, c: Client) =>
    c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom;

  // The selected callout's box in container px, kept current as it wraps, moves or restyles.
  const measureId =
    calloutEditing && selected && stepHasCallout(selected) ? selected.id : null;
  const calloutKind = selected
    ? `${selected.interactionType}:${selected.showOverlay ?? ''}`
    : '';
  const [calloutBox, setCalloutBox] = useState<{
    id: string;
    box: PxRect;
  } | null>(null);
  useLayoutEffect(() => {
    if (!measureId) return;
    const stage = rootRef.current?.closest('[data-gl-stage]');
    const el = findCallout(stage, measureId);
    if (!el) return;
    const read = () => {
      // The card is translated by an open drag; its resting box is what the frame starts from.
      if (previewRef.current) return;
      const box = clientRectToContainer(g, el.getBoundingClientRect());
      setCalloutBox((prev) =>
        prev?.id === measureId &&
        Math.abs(prev.box.x - box.x) < 0.5 &&
        Math.abs(prev.box.y - box.y) < 0.5 &&
        Math.abs(prev.box.w - box.w) < 0.5 &&
        Math.abs(prev.box.h - box.h) < 0.5
          ? prev
          : { id: measureId, box }
      );
    };
    read();
    const observers: { disconnect: () => void }[] = [];
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(read);
      ro.observe(el);
      observers.push(ro);
    }
    if (typeof MutationObserver !== 'undefined') {
      // Placement moves the box by its inline left/top, which a ResizeObserver misses.
      const mo = new MutationObserver(read);
      mo.observe(el, { attributes: true, attributeFilter: ['style'] });
      observers.push(mo);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [measureId, calloutKind, g, steps]);
  const restingBox =
    measureId && calloutBox?.id === measureId ? calloutBox.box : null;
  const selBox =
    calloutShift && calloutShift.id === measureId
      ? calloutShift.rect
      : restingBox;
  const [calloutHover, setCalloutHover] = useState(false);

  const snapOn = (e: Move) => !(e.ctrlKey || e.metaKey);
  const targets = () => snapTargets(slideSteps, selected?.id ?? null);
  const boxTargets = (id: string) => calloutSnapTargets(slideSteps, id);

  // Shows a callout drag or resize in this layer and on the card in the same frame.
  const showCallout = (
    gesture: { step: GuidedLearningStep; box: PxRect },
    rect: PxRect,
    nextGuides: SnapGuides
  ) => {
    const shift = { id: gesture.step.id, rect };
    calloutShiftRef.current = shift;
    flushSync(() => {
      setCalloutShift(shift);
      setGuides(nextGuides);
    });
    const preview = previewFor(gesture.step, 'card');
    preview.shift(rect.x - gesture.box.x, rect.y - gesture.box.y);
    if (rect.w !== gesture.box.w || rect.h !== gesture.box.h)
      preview.size(rect.w, rect.h);
    preview.route(rect, regionRect(g.regionFor(gesture.step)));
  };

  // A callout that stays put while its target changes: the anchor moves and the connector re-routes.
  const followTarget = (
    preview: GesturePreview,
    step: GuidedLearningStep,
    next: GuidedLearningStep
  ) => {
    const { w, h } = g.containerSize;
    preview.anchor(
      ((next.xPct - step.xPct) / 100) * w,
      ((next.yPct - step.yPct) / 100) * h
    );
    const box = calloutBox?.id === step.id ? calloutBox.box : null;
    if (box) preview.route(box, regionRect(g.regionFor(next)));
  };

  // Starts following a step's stage elements; the first call per gesture collects them.
  const previewFor = (
    step: GuidedLearningStep,
    callout: 'card' | 'overlay' | null
  ): GesturePreview => {
    if (!previewRef.current) {
      const stage = rootRef.current?.closest('[data-gl-stage]');
      previewRef.current = createGesturePreview(stage, step.id, {
        callout,
        spot: callout !== 'card',
      });
    }
    return previewRef.current;
  };

  // Renders the draft in this layer in the same frame as the stage preview.
  const showDraft = (next: GuidedLearningStep, nextGuides: SnapGuides) => {
    draftRef.current = next;
    flushSync(() => {
      setDraft(next);
      setGuides(nextGuides);
    });
  };

  // Writes the gesture's fields onto the step as it is now (an undo mid-drag may have changed it).
  const commit = (
    next: GuidedLearningStep | null,
    fields: readonly (keyof GuidedLearningStep)[]
  ) => {
    previewRef.current?.restore();
    previewRef.current = null;
    draftRef.current = null;
    calloutShiftRef.current = null;
    setDraft(null);
    setCalloutShift(null);
    const current = next && steps.find((s) => s.id === next.id);
    if (!next || !current) return;
    const merged: GuidedLearningStep = { ...current };
    for (const key of fields) {
      if (next[key] === undefined)
        delete (merged as Partial<GuidedLearningStep>)[key];
      else Object.assign(merged, { [key]: next[key] });
    }
    beginGesture();
    onChange(merged);
    endGesture();
  };

  // The result of an open gesture, or null when it has not moved anything yet.
  const gestureResult = (gesture: Gesture): GuidedLearningStep | null => {
    if (gesture.kind === 'callout' || gesture.kind === 'callout-size') {
      if (!gesture.active || !calloutShiftRef.current) return null;
      // The first drag or resize turns an automatic callout into a box where it is on screen (G13).
      return withCalloutBox(
        gesture.step,
        containerRectToBox(g, calloutShiftRef.current.rect)
      );
    }
    if (gesture.kind === 'draw') return null;
    return gesture.active ? draftRef.current : null;
  };

  // A second finger means a pinch: drop the open gesture, keeping any move made so far.
  const cancelGesture = () => {
    flushMove();
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setGuides(NO_GUIDES);
    setDrawBox(null);
    if (!gesture || gesture.kind === 'draw') return;
    commit(gestureResult(gesture), fieldsOf(gesture));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) {
      cancelGesture();
      return;
    }
    if (e.button !== 0) return;
    // A gesture whose release never arrived ends here, before the next one starts.
    if (gestureRef.current) cancelGesture();
    draggedRef.current = false;
    const client = { x: e.clientX, y: e.clientY };
    const p = g.clientToImagePct(client.x, client.y);
    const el = e.target as Element;

    if (adding) {
      if (shape === 'polygon') {
        const draft = polygonDraft ?? [];
        const first = draft[0];
        const nearFirst =
          first &&
          Math.hypot(
            (first.xPct - p.xPct) * scale.pxPerPct.x,
            (first.yPct - p.yPct) * scale.pxPerPct.y
          ) <= CLOSE_POLYGON_PX;
        if (draft.length >= 3 && (nearFirst || e.detail >= 2)) {
          onClosePolygon(draft);
          return;
        }
        onPolygonDraft([...draft, clampPct(p)]);
        return;
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gestureRef.current = {
        kind: 'draw',
        start: clampPct(p),
        client,
        drawing: false,
        box: null,
      };
      return;
    }

    const sizeHandle = el.closest<HTMLElement>('[data-gl-callout-handle]')
      ?.dataset.glCalloutHandle as CalloutHandle | undefined;
    if (selected && sizeHandle && selBox) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onCalloutFocus(true);
      gestureRef.current = {
        kind: 'callout-size',
        step: selected,
        handle: sizeHandle,
        box: selBox,
        active: false,
      };
      return;
    }
    const handle =
      el.closest<HTMLElement>('[data-gl-handle]')?.dataset.glHandle;
    const vertex =
      el.closest<HTMLElement>('[data-gl-vertex]')?.dataset.glVertex;
    if (selected && handle) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gestureRef.current =
        handle === 'move'
          ? {
              kind: 'move',
              step: selected,
              start: p,
              client,
              threshold: 0,
              active: false,
            }
          : {
              kind: 'resize',
              step: selected,
              handle: handle as ResizeHandle,
              active: false,
            };
      return;
    }
    if (selected && vertex !== undefined) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gestureRef.current = {
        kind: 'vertex',
        step: selected,
        index: Number(vertex),
        active: false,
      };
      return;
    }
    if (
      e.altKey &&
      selected?.region?.shape === 'polygon' &&
      selected.region.points
    ) {
      const edge = nearestEdge(
        selected.region.points,
        p,
        scale.pxPerPct,
        SNAP_PX
      );
      if (edge !== null) {
        onChange(insertVertex(selected, edge, p));
        return;
      }
    }

    const callout = selected ? calloutRectOf(selected.id) : null;
    if (selected && callout && inRect(callout, client)) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onCalloutFocus(true);
      gestureRef.current = {
        kind: 'callout',
        step: selected,
        box: clientRectToContainer(g, callout),
        client,
        active: false,
      };
      return;
    }
    onCalloutFocus(false);

    const hits = hitsAt(client);
    if (hits.length === 0) {
      onSelect(null);
      return;
    }
    const last = lastClickRef.current;
    const repeated =
      !!last &&
      Math.hypot(last.x - client.x, last.y - client.y) <= DRAW_PX &&
      e.timeStamp - last.at <= REPEAT_CLICK_MS;
    const selIndex = selected
      ? hits.findIndex((s) => s.id === selected.id)
      : -1;
    const target =
      (e.altKey || repeated) && hits.length > 1
        ? hits[(selIndex + 1) % hits.length]
        : selIndex >= 0
          ? hits[selIndex]
          : hits[0];
    const alreadySelected = target.id === selected?.id;
    if (!alreadySelected) onSelect(target.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gestureRef.current = {
      kind: 'move',
      step: target,
      start: p,
      client,
      threshold: alreadySelected ? MOVE_SELECTED_PX : MOVE_UNSELECTED_PX,
      active: false,
    };
  };

  const applyMove = (e: Move) => {
    const client = { x: e.clientX, y: e.clientY };
    const p = g.clientToImagePct(client.x, client.y);
    const gesture = gestureRef.current;
    if (!gesture) {
      if (adding) {
        if (polygonDraft) setPointer(clampPct(p));
        return;
      }
      const overCallout =
        !!measureId &&
        !!selected &&
        (() => {
          const r = calloutRectOf(selected.id);
          return !!r && inRect(r, client);
        })();
      if (overCallout !== calloutHover) setCalloutHover(overCallout);
      const id = overCallout ? null : (hitsAt(client)[0]?.id ?? null);
      if (id !== hoverId) setHoverId(id);
      return;
    }
    const snap = snapOn(e);
    switch (gesture.kind) {
      case 'draw': {
        if (!gesture.drawing) {
          if (dist(gesture.client, client) <= DRAW_PX) return;
          gesture.drawing = true;
        }
        const end = snap
          ? snapPoint(p, targets(), limit)
          : { ...p, guides: NO_GUIDES };
        gesture.box = dragBox(
          gesture.start,
          clampPct(end),
          e.shiftKey,
          scale.pxPerPct
        );
        setDrawBox(gesture.box);
        setGuides(end.guides);
        return;
      }
      case 'move': {
        if (!gesture.active) {
          if (dist(gesture.client, client) <= gesture.threshold) return;
          gesture.active = true;
        }
        const dx = p.xPct - gesture.start.xPct;
        const dy = p.yPct - gesture.start.yPct;
        let next = moveStep(gesture.step, dx, dy);
        let guidesNow = NO_GUIDES;
        if (snap) {
          const s = snapMove(stepBox(next), targets(), limit);
          if (s.dx || s.dy) next = moveStep(gesture.step, dx + s.dx, dy + s.dy);
          guidesNow = s.guides;
        }
        const from = g.regionFor(gesture.step);
        const to = g.regionFor(next);
        showDraft(next, guidesNow);
        const placed = !!(gesture.step.calloutPin ?? gesture.step.calloutBox);
        const preview = previewFor(gesture.step, placed ? null : 'overlay');
        preview.shift(to.cx - from.cx, to.cy - from.cy);
        if (placed) followTarget(preview, gesture.step, next);
        return;
      }
      case 'resize': {
        const h = gesture.handle;
        const at = snap
          ? snapPoint(p, targets(), limit, {
              x: h.includes('e') || h.includes('w'),
              y: h.includes('n') || h.includes('s'),
            })
          : { ...p, guides: NO_GUIDES };
        const region = gesture.step.region;
        if (region?.shape !== 'rect' && region?.shape !== 'ellipse') return;
        gesture.active = true;
        const next = stepWithBox(
          gesture.step,
          resizeBox(stepBox(gesture.step), h, at),
          region.shape
        );
        showDraft(next, at.guides);
        const preview = previewFor(gesture.step, null);
        preview.shape(regionPath(g.regionFor(next)));
        followTarget(preview, gesture.step, next);
        return;
      }
      case 'vertex': {
        const at = snap
          ? snapPoint(p, targets(), limit)
          : { ...p, guides: NO_GUIDES };
        gesture.active = true;
        const next = setVertex(gesture.step, gesture.index, at);
        showDraft(next, at.guides);
        const preview = previewFor(gesture.step, null);
        preview.shape(regionPath(g.regionFor(next)));
        followTarget(preview, gesture.step, next);
        return;
      }
      case 'callout-size': {
        const h = gesture.handle;
        const at = snap
          ? snapPoint(p, boxTargets(gesture.step.id), limit, {
              x: h.includes('e') || h.includes('w'),
              y: h.includes('n') || h.includes('s'),
            })
          : { ...p, guides: NO_GUIDES };
        gesture.active = true;
        const rect = resizeCalloutBox(gesture.box, h, toPx(at), {
          keepAspect: e.shiftKey,
          fromCentre: e.altKey,
          container: g.containerSize,
        });
        showCallout(gesture, rect, at.guides);
        return;
      }
      case 'callout': {
        if (!gesture.active) {
          if (dist(gesture.client, client) <= CALLOUT_PX) return;
          gesture.active = true;
        }
        const { box } = gesture;
        let rect = {
          ...box,
          x: box.x + (client.x - gesture.client.x) / scale.screenPerPx,
          y: box.y + (client.y - gesture.client.y) / scale.screenPerPx,
        };
        let guidesNow = NO_GUIDES;
        if (snap) {
          const a = g.containerPxToImagePct(rect.x, rect.y);
          const b = g.containerPxToImagePct(rect.x + rect.w, rect.y + rect.h);
          const s = snapMove(
            { l: a.xPct, t: a.yPct, r: b.xPct, b: b.yPct },
            boxTargets(gesture.step.id),
            limit
          );
          rect = {
            ...rect,
            x: rect.x + s.dx * (rect.w / Math.max(b.xPct - a.xPct, 1e-6)),
            y: rect.y + s.dy * (rect.h / Math.max(b.yPct - a.yPct, 1e-6)),
          };
          guidesNow = s.guides;
        }
        // A box may sit over the letterbox but never leaves the stage (G12), as the player clamps it.
        const { w, h } = g.containerSize;
        rect.x = clampRange(rect.x, 0, w - rect.w);
        rect.y = clampRange(rect.y, 0, h - rect.h);
        showCallout(gesture, rect, guidesNow);
        return;
      }
    }
  };

  const dropMove = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const move = pendingRef.current;
    pendingRef.current = null;
    return move;
  };
  // Applies the latest pending move now, so an ending gesture never loses its last position.
  const flushMove = () => {
    const move = dropMove();
    if (move) applyMove(move);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    pendingRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    };
    if (frameRef.current !== null) return;
    // At most one render stale; the gesture itself lives in refs.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      flushMove();
    });
  };

  const finish = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean
  ) => {
    flushMove();
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setGuides(NO_GUIDES);
    if (!gesture) return;
    const client = { x: e.clientX, y: e.clientY };
    if (gesture.kind === 'draw') {
      const box = gesture.box;
      setDrawBox(null);
      if (cancelled) return;
      if (!gesture.drawing || !box) {
        onAdd(gesture.start);
        return;
      }
      const w = box.r - box.l;
      const h = box.b - box.t;
      if (w < MIN_REGION_PCT || h < MIN_REGION_PCT) {
        onAdd(gesture.start);
        return;
      }
      onAdd(
        { xPct: (box.l + box.r) / 2, yPct: (box.t + box.b) / 2 },
        { shape: shape === 'ellipse' ? 'ellipse' : 'rect', wPct: w, hPct: h }
      );
      return;
    }
    draggedRef.current = gesture.active;
    if (gesture.active) {
      commit(gestureResult(gesture), fieldsOf(gesture));
      return;
    }
    lastClickRef.current = { ...client, at: e.timeStamp };
    // Touch has no reliable dblclick, so a double tap on the callout opens it for typing.
    if (e.pointerType !== 'mouse' && gesture.kind === 'callout' && !cancelled) {
      const tap = { ...client, at: e.timeStamp };
      if (isDoubleTap(lastTapRef.current, tap)) {
        lastTapRef.current = null;
        onEditCallout(gesture.step.id);
      } else {
        lastTapRef.current = tap;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (adding || !selected || draggedRef.current) return;
    const callout = calloutRectOf(selected.id);
    if (callout && inRect(callout, { x: e.clientX, y: e.clientY })) {
      onEditCallout(selected.id);
    }
  };

  const handleSize = HANDLE_PX / scale.screenPerPx;
  // Hit areas stay the same size on screen at any zoom: 24px for a mouse, 44px for touch (G6).
  const hitSize =
    (coarsePointer() ? MIN_PIN_HIT_PX : HANDLE_HIT_PX) / scale.screenPerPx;
  const stroke = 2 / scale.screenPerPx;
  const hover =
    !adding && hoverId && hoverId !== selected?.id
      ? slideSteps.find((s) => s.id === hoverId)
      : undefined;
  const hoverIndex = hover ? steps.indexOf(hover) : -1;
  const imgTop = toPx({ xPct: 0, yPct: 0 });
  const imgBottom = toPx({ xPct: 100, yPct: 100 });
  const selRegion = selected ? g.regionFor(selected) : null;
  const selRect = selRegion ? regionRect(selRegion) : null;

  return (
    <div
      ref={rootRef}
      data-testid="gl-studio-edit-layer"
      data-adding={adding || undefined}
      className={`absolute inset-0 touch-none select-none ${
        editing ? 'pointer-events-none' : 'pointer-events-auto'
      } ${adding ? 'cursor-crosshair' : calloutHover && selBox ? 'cursor-move' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={(e) => finish(e, true)}
      onPointerLeave={() => {
        if (!gestureRef.current) dropMove();
        setHoverId(null);
        setCalloutHover(false);
      }}
      onDoubleClick={onDoubleClick}
      // A native image or text drag would steal the pointer mid-gesture.
      onDragStart={(e) => e.preventDefault()}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {hover && (
          <path
            data-testid="gl-studio-hover"
            d={regionPath(g.regionFor(hover))}
            fill="none"
            stroke="white"
            strokeOpacity={0.8}
            strokeDasharray={`${4 * stroke} ${3 * stroke}`}
            strokeWidth={stroke}
          />
        )}
        {selRegion && (
          <path
            d={regionPath(selRegion)}
            fill="none"
            className="stroke-sky-400"
            strokeWidth={stroke}
          />
        )}
        {guides.x !== null && (
          <line
            data-testid="gl-studio-guide-x"
            x1={toPx({ xPct: guides.x, yPct: 0 }).x}
            x2={toPx({ xPct: guides.x, yPct: 0 }).x}
            y1={imgTop.y}
            y2={imgBottom.y}
            className="stroke-fuchsia-400"
            strokeWidth={stroke / 2}
          />
        )}
        {guides.y !== null && (
          <line
            data-testid="gl-studio-guide-y"
            y1={toPx({ xPct: 0, yPct: guides.y }).y}
            y2={toPx({ xPct: 0, yPct: guides.y }).y}
            x1={imgTop.x}
            x2={imgBottom.x}
            className="stroke-fuchsia-400"
            strokeWidth={stroke / 2}
          />
        )}
        {drawBox && (
          <DrawPreview
            box={drawBox}
            shape={shape}
            toPx={toPx}
            stroke={stroke}
          />
        )}
        {polygonDraft && polygonDraft.length > 0 && (
          <polyline
            data-testid="gl-studio-polygon-draft"
            points={[...polygonDraft, ...(pointer ? [pointer] : [])]
              .map((p) => {
                const c = toPx(p);
                return `${c.x},${c.y}`;
              })
              .join(' ')}
            fill="rgba(56,189,248,0.15)"
            className="stroke-sky-400"
            strokeWidth={stroke}
          />
        )}
      </svg>

      {hover && hoverIndex >= 0 && (
        <HoverChip
          rect={regionRect(g.regionFor(hover))}
          scale={scale.screenPerPx}
          label={t('glStudio.hoverChip', {
            n: hoverIndex + 1,
            type: t(`glStudio.interaction_${hover.interactionType}`),
          })}
        />
      )}

      {selected && selRect && (
        <div
          data-testid="gl-studio-selection"
          className="pointer-events-none absolute"
          style={{
            left: selRect.x,
            top: selRect.y,
            width: selRect.w,
            height: selRect.h,
          }}
        />
      )}

      {selected &&
        selRect &&
        !(calloutSelected && selBox) &&
        (selected.region?.shape === 'rect' ||
          selected.region?.shape === 'ellipse') && (
          <>
            {RESIZE_HANDLES.map((h) => {
              const x = h.includes('w') ? 0 : h.includes('e') ? 1 : 0.5;
              const y = h.includes('n') ? 0 : h.includes('s') ? 1 : 0.5;
              return (
                <div
                  key={h}
                  data-gl-handle={h}
                  className="absolute flex items-center justify-center"
                  style={{
                    left: selRect.x + x * selRect.w - hitSize / 2,
                    top: selRect.y + y * selRect.h - hitSize / 2,
                    width: hitSize,
                    height: hitSize,
                    cursor: `${h}-resize`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none rounded-sm border border-sky-500 bg-white shadow"
                    style={{ width: handleSize, height: handleSize }}
                  />
                </div>
              );
            })}
            <div
              data-gl-handle="move"
              className="absolute cursor-move rounded-full border border-sky-500 bg-sky-400/80 shadow"
              style={{
                left: selRect.x + selRect.w / 2 - handleSize / 2,
                top: selRect.y + selRect.h / 2 - handleSize / 2,
                width: handleSize,
                height: handleSize,
              }}
            />
          </>
        )}

      {selected?.region?.shape === 'polygon' &&
        selRegion?.points?.map((pt, i) => (
          <button
            key={i}
            type="button"
            data-gl-vertex={i}
            aria-label={t('glStudio.vertexN', { n: i + 1 })}
            className="absolute cursor-grab rounded-full border border-sky-500 bg-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            style={{
              left: pt.x - handleSize / 2,
              top: pt.y - handleSize / 2,
              width: handleSize,
              height: handleSize,
            }}
          />
        ))}

      {selected && selBox && !editing && (calloutHover || calloutSelected) && (
        <div
          data-testid={
            calloutSelected ? 'gl-callout-selection' : 'gl-callout-hover'
          }
          className={`pointer-events-none absolute ${
            calloutSelected
              ? 'outline outline-2 outline-sky-400'
              : 'outline-dashed outline-1 outline-white/90'
          }`}
          style={{
            left: selBox.x,
            top: selBox.y,
            width: selBox.w,
            height: selBox.h,
            outlineOffset: 2 / scale.screenPerPx,
            outlineWidth: (calloutSelected ? 2 : 1) / scale.screenPerPx,
          }}
        />
      )}

      {selected &&
        selBox &&
        calloutSelected &&
        !editing &&
        isTooltipCallout(selected) &&
        selected.region &&
        selRect &&
        (() => {
          const end = leaderEnd(selBox, selRect);
          const d = 10 / scale.screenPerPx;
          return (
            <span
              aria-hidden="true"
              data-testid="gl-callout-anchor-dot"
              className="pointer-events-none absolute rounded-full border-2 border-sky-500 bg-white shadow"
              style={{
                left: end.x - d / 2,
                top: end.y - d / 2,
                width: d,
                height: d,
              }}
            />
          );
        })()}

      {selected &&
        selBox &&
        calloutSelected &&
        !editing &&
        CALLOUT_HANDLES.map((h) => {
          const x = h.includes('w') ? 0 : h.includes('e') ? 1 : 0.5;
          const y = h.includes('n') ? 0 : h.includes('s') ? 1 : 0.5;
          const hit = hitSize;
          return (
            <div
              key={h}
              data-gl-callout-handle={h}
              data-testid={`gl-callout-handle-${h}`}
              className="absolute flex items-center justify-center"
              style={{
                left: selBox.x + x * selBox.w - hit / 2,
                top: selBox.y + y * selBox.h - hit / 2,
                width: hit,
                height: hit,
                cursor: `${h}-resize`,
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none rounded-sm border border-sky-500 bg-white shadow"
                style={{ width: handleSize, height: handleSize }}
              />
            </div>
          );
        })}

      {selected && selBox && calloutSelected && !editing && (
        <div
          className="absolute"
          style={(() => {
            const below = selBox.y * scale.screenPerPx < TOOLBAR_ROOM_PX;
            // Right-aligned on the right half, so the frame never clips it.
            const right = selBox.x + selBox.w / 2 > g.containerSize.w / 2;
            return {
              left: right ? selBox.x + selBox.w : selBox.x,
              top: below ? selBox.y + selBox.h : selBox.y,
              transform: `scale(${1 / scale.screenPerPx}) translate(${
                right ? '-100%' : '0'
              }, ${below ? '12px' : 'calc(-100% - 12px)'})`,
              transformOrigin: 'top left',
            };
          })()}
        >
          <CalloutToolbar
            step={selected}
            onChange={onChange}
            onEdit={() => onEditCallout(selected.id)}
            onDelete={() => onDeleteStep?.(selected.id)}
          />
        </div>
      )}

      {(selected?.calloutPin ?? selected?.calloutBox) &&
        selRect &&
        !(calloutSelected && selBox) && (
          <div
            className="absolute flex"
            style={{
              left: selRect.x,
              top: selRect.y + selRect.h + 8 / scale.screenPerPx,
              transform: `scale(${1 / scale.screenPerPx})`,
              transformOrigin: 'top left',
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange(clearCalloutPin(selected))}
              className="flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-lg hover:bg-slate-700"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('glStudio.resetCallout')}
            </button>
          </div>
        )}
    </div>
  );
};

const clampPct = (p: PctPoint): PctPoint => ({
  xPct: Math.min(Math.max(p.xPct, 0), 100),
  yPct: Math.min(Math.max(p.yPct, 0), 100),
});

const coarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

const dist = (a: Client, b: Client) => Math.hypot(a.x - b.x, a.y - b.y);

// What a Studio gesture may change; everything else keeps its value at release.
// The fields each kind of gesture writes; the rest of the step stays as it is at release.
const REGION_FIELDS = [
  'xPct',
  'yPct',
  'region',
] as const satisfies readonly (keyof GuidedLearningStep)[];
const CALLOUT_FIELDS = [
  'calloutBox',
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'tooltipPosition',
  'tooltipOffset',
] as const satisfies readonly (keyof GuidedLearningStep)[];

const fieldsOf = (gesture: { kind: string }) =>
  gesture.kind === 'callout' || gesture.kind === 'callout-size'
    ? CALLOUT_FIELDS
    : REGION_FIELDS;

const clampRange = (n: number, lo: number, hi: number) =>
  hi < lo ? lo : Math.min(Math.max(n, lo), hi);

const DrawPreview: React.FC<{
  box: PctBox;
  shape: DrawShape;
  toPx: (p: PctPoint) => { x: number; y: number };
  stroke: number;
}> = ({ box, shape, toPx, stroke }) => {
  const a = toPx({ xPct: box.l, yPct: box.t });
  const b = toPx({ xPct: box.r, yPct: box.b });
  const common = {
    'data-testid': 'gl-studio-draw-preview',
    fill: 'rgba(56,189,248,0.15)',
    className: 'stroke-sky-400',
    strokeWidth: stroke,
  };
  return shape === 'ellipse' ? (
    <ellipse
      {...common}
      cx={(a.x + b.x) / 2}
      cy={(a.y + b.y) / 2}
      rx={(b.x - a.x) / 2}
      ry={(b.y - a.y) / 2}
    />
  ) : (
    <rect {...common} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} />
  );
};

const HoverChip: React.FC<{
  rect: { x: number; y: number };
  scale: number;
  label: string;
}> = ({ rect, scale, label }) => (
  <div
    data-testid="gl-studio-hover-chip"
    className="pointer-events-none absolute whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-0.5 text-xs font-bold text-white shadow"
    style={{
      left: rect.x,
      top: rect.y - 24 / scale,
      transform: `scale(${1 / scale})`,
      transformOrigin: 'top left',
    }}
  >
    {label}
  </div>
);

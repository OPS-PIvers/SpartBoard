import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  setCalloutPin,
  setVertex,
  stepBox,
  stepWithBox,
  type PctBox,
  type ResizeHandle,
} from './regionEdits';
import {
  SNAP_PX,
  snapMove,
  snapPoint,
  snapTargets,
  type SnapGuides,
} from './snapping';
import { findCallout, screenScale } from './canvasScale';
import { stepHasCallout } from '../../utils/calloutStyle';
import {
  CALLOUT_HANDLES,
  clientRectToContainer,
  isTooltipCallout,
  leaderEnd,
  resizeCalloutSide,
  scaleCalloutCorner,
  withCalloutSize,
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
  | { kind: 'resize'; step: GuidedLearningStep; handle: ResizeHandle }
  | { kind: 'vertex'; step: GuidedLearningStep; index: number }
  | {
      kind: 'callout-size';
      step: GuidedLearningStep;
      handle: CalloutHandle;
      box: PxRect;
    }
  | {
      kind: 'callout';
      step: GuidedLearningStep;
      start: PctPoint;
      centre: PctPoint;
      client: Client;
      active: boolean;
    };
type Client = { x: number; y: number };
/** The fields of a pointer move that the edit layer reads. */
type Move = {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
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
  // Pointer moves coalesce to one applied move per animation frame.
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<Move | null>(null);
  useEffect(() => {
    const frame = frameRef;
    const open = gestureRef;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      // Unmounting mid-drag (Blur, Play) must still close the gesture, or autosave stays frozen.
      const gesture = open.current;
      open.current = null;
      if (
        gesture &&
        (gesture.kind === 'resize' ||
          gesture.kind === 'vertex' ||
          gesture.kind === 'callout-size' ||
          (gesture.kind !== 'draw' && gesture.active))
      )
        endGesture();
    };
  }, [endGesture]);

  const slideSteps = steps.filter((s) => s.imageIndex === imageIndex);
  const selected = slideSteps.find((s) => s.id === selectedStepId) ?? null;
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
  const selBox =
    measureId && calloutBox?.id === measureId ? calloutBox.box : null;
  const [calloutHover, setCalloutHover] = useState(false);

  const snapOn = (e: Move) => !(e.ctrlKey || e.metaKey);
  const targets = () => snapTargets(slideSteps, selected?.id ?? null);

  // A second finger means a pinch: drop the open gesture, keeping any move made so far.
  const cancelGesture = () => {
    flushMove();
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setGuides(NO_GUIDES);
    setDrawBox(null);
    if (!gesture || gesture.kind === 'draw') return;
    if (
      gesture.kind === 'resize' ||
      gesture.kind === 'vertex' ||
      gesture.kind === 'callout-size' ||
      gesture.active
    )
      endGesture();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) {
      cancelGesture();
      return;
    }
    if (e.button !== 0) return;
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
      };
      beginGesture();
      return;
    }
    const handle =
      el.closest<HTMLElement>('[data-gl-handle]')?.dataset.glHandle;
    const vertex =
      el.closest<HTMLElement>('[data-gl-vertex]')?.dataset.glVertex;
    if (selected && handle) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (handle === 'move') {
        gestureRef.current = {
          kind: 'move',
          step: selected,
          start: p,
          client,
          threshold: 0,
          active: true,
        };
      } else {
        gestureRef.current = {
          kind: 'resize',
          step: selected,
          handle: handle as ResizeHandle,
        };
      }
      beginGesture();
      return;
    }
    if (selected && vertex !== undefined) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gestureRef.current = {
        kind: 'vertex',
        step: selected,
        index: Number(vertex),
      };
      beginGesture();
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
        start: p,
        centre: g.clientToImagePct(
          callout.left + callout.width / 2,
          callout.top + callout.height / 2
        ),
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
          beginGesture();
        }
        const dx = p.xPct - gesture.start.xPct;
        const dy = p.yPct - gesture.start.yPct;
        let next = moveStep(gesture.step, dx, dy);
        if (snap) {
          const s = snapMove(stepBox(next), targets(), limit);
          if (s.dx || s.dy) next = moveStep(gesture.step, dx + s.dx, dy + s.dy);
          setGuides(s.guides);
        }
        onChange(next);
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
        onChange(
          stepWithBox(
            gesture.step,
            resizeBox(stepBox(gesture.step), h, at),
            region.shape
          )
        );
        setGuides(at.guides);
        return;
      }
      case 'vertex': {
        const at = snap
          ? snapPoint(p, targets(), limit)
          : { ...p, guides: NO_GUIDES };
        onChange(setVertex(gesture.step, gesture.index, at));
        setGuides(at.guides);
        return;
      }
      case 'callout-size': {
        const h = gesture.handle;
        const pinned = !!gesture.step.calloutPin;
        let at = containerPt(client);
        if (snap && (h === 'e' || h === 'w')) {
          const snapped = snapPoint(p, targets(), limit, { x: true, y: false });
          at = toPx(snapped);
          setGuides(snapped.guides);
        }
        const edit =
          h === 'e' || h === 'w'
            ? resizeCalloutSide(gesture.box, h, at.x, g.containerSize.w, pinned)
            : scaleCalloutCorner(
                gesture.box,
                h,
                at,
                gesture.step.calloutScale ?? 1,
                gesture.step.calloutWidthPct,
                pinned
              );
        let next: GuidedLearningStep = withCalloutSize(gesture.step, edit);
        if (edit.centre) {
          next = setCalloutPin(
            next,
            g.containerPxToImagePct(edit.centre.x, edit.centre.y)
          );
        }
        onChange(next);
        return;
      }
      case 'callout': {
        if (!gesture.active) {
          if (dist(gesture.client, client) <= CALLOUT_PX) return;
          gesture.active = true;
          beginGesture();
        }
        onChange(
          setCalloutPin(gesture.step, {
            xPct: gesture.centre.xPct + p.xPct - gesture.start.xPct,
            yPct: gesture.centre.yPct + p.yPct - gesture.start.yPct,
          })
        );
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
    const moved =
      gesture.kind === 'resize' ||
      gesture.kind === 'vertex' ||
      gesture.kind === 'callout-size' ||
      gesture.active;
    if (moved) {
      endGesture();
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
    if (adding || !selected) return;
    const callout = calloutRectOf(selected.id);
    if (callout && inRect(callout, { x: e.clientX, y: e.clientY })) {
      onEditCallout(selected.id);
    }
  };

  const handleSize = HANDLE_PX / scale.screenPerPx;
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
      className={`absolute inset-0 touch-none ${
        editing ? 'pointer-events-none' : 'pointer-events-auto'
      } ${adding ? 'cursor-crosshair' : calloutHover && selBox ? 'cursor-move' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onPointerLeave={() => {
        if (!gestureRef.current) dropMove();
        setHoverId(null);
        setCalloutHover(false);
      }}
      onDoubleClick={onDoubleClick}
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
                  className="absolute rounded-sm border border-sky-500 bg-white shadow"
                  style={{
                    left: selRect.x + x * selRect.w - handleSize / 2,
                    top: selRect.y + y * selRect.h - handleSize / 2,
                    width: handleSize,
                    height: handleSize,
                    cursor: `${h}-resize`,
                  }}
                />
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
          const x = h.includes('w') ? 0 : 1;
          const y = h === 'e' || h === 'w' ? 0.5 : h.includes('n') ? 0 : 1;
          const side = h === 'e' || h === 'w';
          const hit = Math.max(handleSize, MIN_PIN_HIT_PX / scale.screenPerPx);
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
                cursor: side ? 'ew-resize' : `${h}-resize`,
              }}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none border border-sky-500 bg-white shadow ${
                  side ? 'rounded-full' : 'rounded-sm'
                }`}
                style={{
                  width: side ? handleSize * 0.6 : handleSize,
                  height: side ? handleSize * 1.6 : handleSize,
                }}
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

      {selected?.calloutPin && selRect && !(calloutSelected && selBox) && (
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

const dist = (a: Client, b: Client) => Math.hypot(a.x - b.x, a.y - b.y);

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

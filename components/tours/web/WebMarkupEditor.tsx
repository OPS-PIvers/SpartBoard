import React, { useState } from 'react';
import type { TourMarkupShape } from '@/types';
import { TourPictureMarkup } from '@/components/tours/TourPictureMarkup';
import { MARKUP_BADGE } from '@/components/tours/tourPictureMarkupGeometry';

export type MarkupTool = 'arrow' | 'box' | 'number';

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2';

type Gesture =
  | { kind: 'create'; id: string; x: number; y: number }
  | { kind: 'move'; id: string; x: number; y: number; from: TourMarkupShape }
  | { kind: 'resize'; id: string; handle: Handle };

/** Shapes smaller than this on both sides are a stray click, not a drawing. */
const MIN_SIZE = 0.01;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

const moved = (s: TourMarkupShape, dx: number, dy: number): TourMarkupShape => {
  if (s.kind === 'box')
    return {
      ...s,
      x: Math.min(1 - s.w, Math.max(0, s.x + dx)),
      y: Math.min(1 - s.h, Math.max(0, s.y + dy)),
    };
  if (s.kind === 'number')
    return { ...s, x: clamp(s.x + dx), y: clamp(s.y + dy) };
  return {
    ...s,
    x1: clamp(s.x1 + dx),
    y1: clamp(s.y1 + dy),
    x2: clamp(s.x2 + dx),
    y2: clamp(s.y2 + dy),
  };
};

/** A box from any two corners. */
const boxBetween = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number
): TourMarkupShape => ({
  id,
  kind: 'box',
  x: Math.min(ax, bx),
  y: Math.min(ay, by),
  w: Math.abs(bx - ax),
  h: Math.abs(by - ay),
});

const resized = (
  s: TourMarkupShape,
  handle: Handle,
  x: number,
  y: number
): TourMarkupShape => {
  if (s.kind === 'arrow')
    return handle === 'p1' ? { ...s, x1: x, y1: y } : { ...s, x2: x, y2: y };
  if (s.kind !== 'box') return s;
  // The corner opposite the handle stays put.
  const ox = handle === 'nw' || handle === 'sw' ? s.x + s.w : s.x;
  const oy = handle === 'nw' || handle === 'ne' ? s.y + s.h : s.y;
  return boxBetween(s.id, ox, oy, x, y);
};

const tooSmall = (s: TourMarkupShape) =>
  (s.kind === 'box' && s.w < MIN_SIZE && s.h < MIN_SIZE) ||
  (s.kind === 'arrow' &&
    Math.abs(s.x2 - s.x1) < MIN_SIZE &&
    Math.abs(s.y2 - s.y1) < MIN_SIZE);

/** Draws, selects, moves, resizes and deletes markup over the stage picture; each finished gesture is one edit. */
export const WebMarkupEditor: React.FC<{
  shapes: readonly TourMarkupShape[];
  width: number;
  height: number;
  tool: MarkupTool | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (shapes: TourMarkupShape[]) => void;
  label: string;
}> = ({
  shapes,
  width,
  height,
  tool,
  selectedId,
  onSelect,
  onCommit,
  label,
}) => {
  const [draft, setDraft] = useState<TourMarkupShape[] | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const shown = draft ?? shapes;
  const unit = Math.max(width, height);
  const handle = unit * 0.012;
  const badge = unit * MARKUP_BADGE;

  const pointOf = (e: React.PointerEvent) => {
    const r = e.currentTarget.closest('svg')?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    };
  };

  const begin = (
    e: React.PointerEvent,
    g: Gesture,
    next: TourMarkupShape[]
  ) => {
    e.stopPropagation();
    e.currentTarget.closest('svg')?.setPointerCapture?.(e.pointerId);
    setGesture(g);
    setDraft(next);
  };

  const onBackground = (e: React.PointerEvent) => {
    if (!tool) {
      onSelect(null);
      return;
    }
    const { x, y } = pointOf(e);
    const id = crypto.randomUUID();
    if (tool === 'number') {
      const n =
        Math.max(0, ...shapes.map((s) => (s.kind === 'number' ? s.n : 0))) + 1;
      onCommit([...shapes, { id, kind: 'number', x, y, n }]);
      onSelect(id);
      return;
    }
    const created: TourMarkupShape =
      tool === 'box'
        ? { id, kind: 'box', x, y, w: 0, h: 0 }
        : { id, kind: 'arrow', x1: x, y1: y, x2: x, y2: y };
    begin(e, { kind: 'create', id, x, y }, [...shapes, created]);
    onSelect(id);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!gesture || !draft) return;
    const { x, y } = pointOf(e);
    setDraft(
      draft.map((s) => {
        if (s.id !== gesture.id) return s;
        if (gesture.kind === 'create')
          return s.kind === 'box'
            ? boxBetween(s.id, gesture.x, gesture.y, x, y)
            : s.kind === 'arrow'
              ? { ...s, x2: x, y2: y }
              : s;
        if (gesture.kind === 'move')
          return moved(gesture.from, x - gesture.x, y - gesture.y);
        return resized(s, gesture.handle, x, y);
      })
    );
  };

  const onUp = () => {
    if (gesture && draft) {
      const made = draft.find((s) => s.id === gesture.id);
      if (gesture.kind === 'create' && made && tooSmall(made)) onSelect(null);
      else if (draft !== shapes) onCommit(draft);
    }
    setGesture(null);
    setDraft(null);
  };

  const remove = () => {
    if (!selectedId) return;
    onCommit(shapes.filter((s) => s.id !== selectedId));
    onSelect(null);
  };

  const selected = shown.find((s) => s.id === selectedId);
  const handles: { id: Handle; x: number; y: number }[] = !selected
    ? []
    : selected.kind === 'box'
      ? [
          { id: 'nw', x: selected.x, y: selected.y },
          { id: 'ne', x: selected.x + selected.w, y: selected.y },
          { id: 'sw', x: selected.x, y: selected.y + selected.h },
          { id: 'se', x: selected.x + selected.w, y: selected.y + selected.h },
        ]
      : selected.kind === 'arrow'
        ? [
            { id: 'p1', x: selected.x1, y: selected.y1 },
            { id: 'p2', x: selected.x2, y: selected.y2 },
          ]
        : [];

  return (
    <div
      data-testid="web-markup-editor"
      className="absolute inset-0"
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
          e.preventDefault();
          e.stopPropagation();
          remove();
        }
        if (e.key === 'Escape' && selectedId) {
          e.stopPropagation();
          onSelect(null);
        }
      }}
    >
      <TourPictureMarkup shapes={shown} width={width} height={height} />
      {/* no-tour-anchor: the drawing surface over one step's picture */}
      <svg
        role="application"
        aria-label={label}
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 h-full w-full touch-none select-none focus:outline-hidden ${
          tool ? 'cursor-crosshair' : 'cursor-default'
        }`}
        onPointerDown={onBackground}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {shown.map((s) => {
          const pick = (e: React.PointerEvent) => {
            onSelect(s.id);
            const { x, y } = pointOf(e);
            begin(e, { kind: 'move', id: s.id, x, y, from: s }, [...shown]);
          };
          const common = {
            'data-testid': 'web-markup-shape',
            'data-shape-id': s.id,
            'data-selected': s.id === selectedId ? '' : undefined,
            onPointerDown: pick,
          };
          if (s.kind === 'box')
            return (
              <rect
                key={s.id}
                {...common}
                x={s.x * width}
                y={s.y * height}
                width={s.w * width}
                height={s.h * height}
                className="cursor-move fill-transparent stroke-transparent"
                strokeWidth={unit * 0.02}
              />
            );
          if (s.kind === 'arrow')
            return (
              <line
                key={s.id}
                {...common}
                x1={s.x1 * width}
                y1={s.y1 * height}
                x2={s.x2 * width}
                y2={s.y2 * height}
                className="cursor-move stroke-transparent"
                strokeWidth={unit * 0.025}
              />
            );
          return (
            <circle
              key={s.id}
              {...common}
              cx={s.x * width}
              cy={s.y * height}
              r={badge * 1.2}
              className="cursor-move fill-transparent"
            />
          );
        })}
        {selected && selected.kind !== 'arrow' && (
          <rect
            aria-hidden="true"
            {...(selected.kind === 'box'
              ? {
                  x: selected.x * width,
                  y: selected.y * height,
                  width: selected.w * width,
                  height: selected.h * height,
                }
              : {
                  x: selected.x * width - badge * 1.4,
                  y: selected.y * height - badge * 1.4,
                  width: badge * 2.8,
                  height: badge * 2.8,
                })}
            className="pointer-events-none fill-none stroke-brand-blue-primary"
            strokeWidth={unit * 0.003}
            strokeDasharray={`${unit * 0.01} ${unit * 0.006}`}
          />
        )}
        {handles.map((h) => (
          <rect
            key={h.id}
            data-testid={`web-markup-handle-${h.id}`}
            x={h.x * width - handle}
            y={h.y * height - handle}
            width={handle * 2}
            height={handle * 2}
            rx={handle / 3}
            className="cursor-pointer fill-white stroke-brand-blue-primary"
            strokeWidth={unit * 0.003}
            onPointerDown={(e) => {
              if (!selected) return;
              begin(e, { kind: 'resize', id: selected.id, handle: h.id }, [
                ...shown,
              ]);
            }}
          />
        ))}
      </svg>
    </div>
  );
};

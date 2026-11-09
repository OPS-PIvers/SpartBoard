import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperMarkupItem, PaperPointMm, PaperRectMm } from '@/types';
import { cropPxToSheetMm, type ImageSizePx } from '@/utils/paperMarkupRender';
import { tourTypeAttr } from '@/config/tourAnchors';
import { MarkupDisc, MarkupShape } from './MarkupShape';
import { layoutMarkupDiscs, type DiscPlacement } from './markupDiscs';
import {
  MIN_DISC_PX,
  MIN_HIT_PX,
  PAPER_MARKUP_STYLE,
  inkOf,
} from './markupStyle';
import {
  isRectItem,
  itemBoundsMm,
  readingOrder,
  type ResizeCorner,
} from './markupGeometry';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';

const CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

const cornerPoint = (r: PaperRectMm, c: ResizeCorner): PaperPointMm => ({
  x: c === 'nw' || c === 'sw' ? r.x : r.x + r.w,
  y: c === 'nw' || c === 'ne' ? r.y : r.y + r.h,
});

const pad = (r: PaperRectMm, by: number): PaperRectMm => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + by * 2,
  h: r.h + by * 2,
});
/** The selection outline sits just outside the mark so it never hides the mark's own stroke. */
const SELECTION_PAD_MM = 1;
/** The keyboard focus ring sits outside the selection outline, solid where selection is dashed. */
const FOCUS_PAD_MM = 2;

const CORNER_CURSOR: Record<ResizeCorner, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
};

const isFocusVisible = (el: Element) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

/** The drawing surface over the crop: an SVG in sheet millimetres, so marks scale with the image. */
export const PaperMarkupLayer: React.FC<{
  editor: PaperMarkupEditor;
  boxMm: PaperRectMm;
  image: ImageSizePx;
  onActivity?: () => void;
}> = ({ editor, boxMm, image, onActivity }) => {
  const { t } = useTranslation();
  const tm = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`, params);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const v = editor.viewport;
  const [widthPx, setWidthPx] = useState(0);
  const [roving, setRoving] = useState<string | null>(null);
  const [ringId, setRingId] = useState<string | null>(null);

  // Rendered width, so pins and numbers can stay legible when the image is small.
  useLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.getBoundingClientRect().width);
    measure();
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const pxPerMm = widthPx > 0 ? widthPx / v.w : 0;
  const minDiscMm = pxPerMm > 0 ? MIN_DISC_PX / pxPerMm : 0;
  const minHitMm = pxPerMm > 0 ? MIN_HIT_PX / pxPerMm : 0;

  const discs = useMemo(
    () => layoutMarkupDiscs(editor.shown, editor.numbers, v, minDiscMm),
    [editor.shown, editor.numbers, v, minDiscMm]
  );
  const order = useMemo(() => readingOrder(editor.shown), [editor.shown]);
  const tabStop =
    roving && order.includes(roving) ? roving : (order[0] ?? null);

  const toMm = (e: React.PointerEvent): PaperPointMm => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0)
      return { x: v.x, y: v.y };
    const px = {
      x: ((e.clientX - rect.left) / rect.width) * image.width,
      y: ((e.clientY - rect.top) / rect.height) * image.height,
    };
    return cropPxToSheetMm(px, boxMm, image);
  };
  const pct = (p: PaperPointMm) => ({
    left: `${((p.x - v.x) / v.w) * 100}%`,
    top: `${((p.y - v.y) / v.h) * 100}%`,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onActivity?.();
    const target = e.target as Element;
    const handle = target.closest('[data-markup-handle]');
    const itemEl = target.closest('[data-markup-item]');
    const started = editor.press({
      mm: toMm(e),
      client: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
      hitItemId: itemEl?.getAttribute('data-markup-item') ?? null,
      hitCorner:
        (handle?.getAttribute('data-markup-handle') as ResizeCorner | null) ??
        null,
    });
    layerRef.current?.focus({ preventScroll: true });
    if (!started) return;
    e.preventDefault();
    layerRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    editor.drag(e.pointerId, toMm(e), { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    editor.release(e.pointerId, toMm(e), { x: e.clientX, y: e.clientY });
    if (layerRef.current?.hasPointerCapture?.(e.pointerId))
      layerRef.current.releasePointerCapture(e.pointerId);
  };

  const focusMark = (id: string | undefined) => {
    const el = id
      ? layerRef.current?.querySelector<SVGGElement>(
          `[data-markup-focus="${id}"]`
        )
      : null;
    if (el) el.focus();
    else layerRef.current?.focus();
  };
  const onMarkKey = (id: string) => (e: React.KeyboardEvent) => {
    const selected = editor.selectedId === id;
    const at = order.indexOf(id);
    if (
      !selected &&
      ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)
    ) {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      focusMark(order[(at + step + order.length) % order.length]);
    } else if (!selected && (e.key === 'Enter' || e.key === ' ')) {
      editor.select(id);
    } else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      editor.deleteSelected();
      focusMark(order[at + 1] ?? order[at - 1]);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const labelOf = (item: PaperMarkupItem) => {
    const n = editor.numbers.get(item.id);
    if (item.kind === 'pin')
      return n ? tm('names.pinNumber', { number: n }) : tm('names.pin');
    const kind =
      item.kind === 'stamp'
        ? tm('tools.stampOf', { stamp: tm(`stamps.${item.symbol}`) })
        : tm(`names.${item.kind}`);
    return n ? tm('names.withComment', { kind, number: n }) : kind;
  };
  const markProps = (item: PaperMarkupItem) => ({
    'data-markup-item': item.id,
    'data-markup-anchor': item.id,
    'data-markup-focus': item.id,
    role: 'button',
    tabIndex: item.id === tabStop ? 0 : -1,
    'aria-label': labelOf(item),
    'aria-pressed': editor.selectedId === item.id,
    onFocus: (e: React.FocusEvent<SVGGElement>) => {
      setRoving(item.id);
      if (isFocusVisible(e.currentTarget)) setRingId(item.id);
    },
    onBlur: () => setRingId(null),
    onKeyDown: onMarkKey(item.id),
    className: `outline-hidden ${editor.tool === 'select' ? 'cursor-move' : ''}`,
    style: { touchAction: 'none' } as React.CSSProperties,
  });
  // A stamp's glyph is thin, so its hit area is a full disc, never under MIN_HIT_PX.
  const hitDisc = (at: PaperPointMm, r: number) => (
    <circle
      cx={at.x}
      cy={at.y}
      r={Math.max(r, minHitMm / 2)}
      fill="transparent"
    />
  );

  // A pin's box is its drawn disc, which may be larger than its millimetre size.
  const boundsOf = (item: PaperMarkupItem): PaperRectMm => {
    const disc = item.kind === 'pin' ? discs.get(item.id) : undefined;
    return disc
      ? { x: disc.x - disc.d / 2, y: disc.y - disc.d / 2, w: disc.d, h: disc.d }
      : itemBoundsMm(item);
  };
  const selected = editor.shown.find((i) => i.id === editor.selectedId);
  const selectedBounds = selected
    ? pad(boundsOf(selected), SELECTION_PAD_MM)
    : null;
  const ringItem = editor.shown.find((i) => i.id === ringId);
  const ringBounds = ringItem ? pad(boundsOf(ringItem), FOCUS_PAD_MM) : null;
  const drawing = editor.tool !== 'select';
  const pending =
    editor.comment?.target === 'pending-pin' ? editor.comment : null;
  const pendingDisc: DiscPlacement | null = pending
    ? {
        x: pending.at.x,
        y: pending.at.y,
        d: Math.max(PAPER_MARKUP_STYLE.pin.diameterMm, minDiscMm),
        halo: PAPER_MARKUP_STYLE.pin.haloMm,
        ink: inkOf(editor.color),
        label: '',
      }
    : null;
  const washes = editor.shown.filter((i) => i.kind === 'highlight');
  const lines = editor.shown.filter(
    (i) => i.kind === 'rect' || i.kind === 'ellipse' || i.kind === 'stamp'
  );

  return (
    <div
      ref={layerRef}
      tabIndex={0}
      role="group"
      aria-label={tm('layer')}
      {...tourTypeAttr('quiz-grading.markup-canvas', 'quiz')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => editor.cancelDrag()}
      onLostPointerCapture={() => editor.cancelDrag()}
      className={`absolute inset-0 select-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
        drawing ? 'cursor-crosshair' : ''
      }`}
      style={{ touchAction: drawing ? 'none' : 'pan-x pan-y' }}
    >
      <svg
        role="presentation"
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {washes.map((item) => (
          <g key={item.id} {...markProps(item)}>
            <MarkupShape item={item} />
          </g>
        ))}
        {lines.map((item) => (
          <g key={item.id} {...markProps(item)}>
            <MarkupShape item={item} />
            {item.kind === 'stamp' &&
              hitDisc(item.atMm, PAPER_MARKUP_STYLE.stamp.sizeMm / 2)}
          </g>
        ))}
        {editor.shown.map((item) => {
          const disc = discs.get(item.id);
          if (!disc) return null;
          if (item.kind === 'pin')
            return (
              <g key={item.id} {...markProps(item)}>
                <MarkupDisc disc={disc} />
                {hitDisc(disc, disc.d / 2)}
              </g>
            );
          return (
            <g key={`n-${item.id}`} data-markup-item={item.id}>
              <MarkupDisc disc={disc} />
            </g>
          );
        })}
        {editor.draft && (
          <g opacity={0.8}>
            <MarkupShape item={editor.draft} />
          </g>
        )}
        {pendingDisc && (
          <g data-markup-anchor="pending-pin" opacity={0.6}>
            <MarkupDisc disc={pendingDisc} />
          </g>
        )}
        {selectedBounds && (
          <rect
            x={selectedBounds.x}
            y={selectedBounds.y}
            width={selectedBounds.w}
            height={selectedBounds.h}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className="pointer-events-none stroke-brand-blue-primary"
          />
        )}
        {ringBounds && (
          <g className="pointer-events-none">
            <rect
              x={ringBounds.x}
              y={ringBounds.y}
              width={ringBounds.w}
              height={ringBounds.h}
              rx={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={4}
              stroke="white"
            />
            <rect
              data-markup-focus-ring
              x={ringBounds.x}
              y={ringBounds.y}
              width={ringBounds.w}
              height={ringBounds.h}
              rx={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              className="stroke-brand-blue-dark"
            />
          </g>
        )}
      </svg>
      {selected &&
        isRectItem(selected) &&
        !editor.dragging &&
        CORNERS.map((c) => (
          <span
            key={c}
            data-markup-handle={c}
            aria-hidden
            style={{
              ...pct(cornerPoint(pad(selected.rectMm, SELECTION_PAD_MM), c)),
              touchAction: 'none',
            }}
            className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${CORNER_CURSOR[c]}`}
          >
            <span className="pointer-events-none h-2.5 w-2.5 rounded-xs border-2 border-brand-blue-primary bg-white shadow-xs" />
          </span>
        ))}
    </div>
  );
};

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperPointMm, PaperRectMm } from '@/types';
import { cropPxToSheetMm, type ImageSizePx } from '@/utils/paperMarkupRender';
import { tourTypeAttr } from '@/config/tourAnchors';
import { MarkupShape } from './MarkupShape';
import { PIN_DIAMETER_MM, MARKUP_INK_HEX, PIN_OUTLINE_MM } from './markupStyle';
import { isRectItem, itemBoundsMm, type ResizeCorner } from './markupGeometry';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';

const CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

const cornerPoint = (r: PaperRectMm, c: ResizeCorner): PaperPointMm => ({
  x: c === 'nw' || c === 'sw' ? r.x : r.x + r.w,
  y: c === 'nw' || c === 'ne' ? r.y : r.y + r.h,
});

const CORNER_CURSOR: Record<ResizeCorner, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
};

/** The drawing surface over the crop: an SVG in sheet millimetres, so marks scale with the image. */
export const PaperMarkupLayer: React.FC<{
  editor: PaperMarkupEditor;
  boxMm: PaperRectMm;
  image: ImageSizePx;
  onActivity?: () => void;
}> = ({ editor, boxMm, image, onActivity }) => {
  const { t } = useTranslation();
  const tm = (key: string) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const v = editor.viewport;

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

  const selected = editor.shown.find((i) => i.id === editor.selectedId);
  const selectedBounds = selected ? itemBoundsMm(selected) : null;
  const drawing = editor.tool !== 'select';
  const pending =
    editor.comment?.target === 'pending-pin' ? editor.comment : null;

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
        aria-hidden
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {editor.shown.map((item) => (
          <g
            key={item.id}
            data-markup-item={item.id}
            data-markup-anchor={item.id}
            className={!drawing ? 'cursor-move' : undefined}
            style={{ touchAction: 'none' }}
          >
            <MarkupShape item={item} number={editor.numbers.get(item.id)} />
          </g>
        ))}
        {editor.draft && (
          <g opacity={0.8}>
            <MarkupShape item={editor.draft} />
          </g>
        )}
        {pending && (
          <circle
            data-markup-anchor="pending-pin"
            cx={pending.at.x}
            cy={pending.at.y}
            r={PIN_DIAMETER_MM / 2}
            fill={MARKUP_INK_HEX[editor.color]}
            fillOpacity={0.55}
            stroke="white"
            strokeWidth={PIN_OUTLINE_MM}
          />
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
              ...pct(cornerPoint(selected.rectMm, c)),
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

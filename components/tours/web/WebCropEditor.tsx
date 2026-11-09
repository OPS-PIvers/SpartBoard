import React, { useState } from 'react';
import { primaryBtn, secondaryBtn } from '@/components/common/lightChrome';
import { BlobImage } from './BlurBoxes';
import { clampCrop, MIN_CROP, type UnitRect } from './pictureCrop';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'move'; x: number; y: number; from: UnitRect }
  | { kind: 'corner'; corner: Corner };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const INSET = 16;

/** A crop from a dragged corner, the opposite corner staying put. */
function fromCorner(
  r: UnitRect,
  corner: Corner,
  x: number,
  y: number
): UnitRect {
  const ox = corner === 'nw' || corner === 'sw' ? r.x + r.w : r.x;
  const oy = corner === 'nw' || corner === 'ne' ? r.y + r.h : r.y;
  const w = Math.max(MIN_CROP, Math.abs(x - ox));
  const h = Math.max(MIN_CROP, Math.abs(y - oy));
  return clampCrop({
    x: x < ox ? ox - w : ox,
    y: y < oy ? oy - h : oy,
    w,
    h,
  });
}

/** Re-crops the stage picture inside its frame: the base (its capture, or itself) fits the frame and the crop is dragged on it. */
export const WebCropEditor: React.FC<{
  base: Blob | null;
  baseSize: { w: number; h: number };
  box: { w: number; h: number };
  initial: UnitRect;
  /** No capture was kept, so the crop can only get tighter. */
  tighterOnly: boolean;
  busy: boolean;
  failed: boolean;
  onApply: (crop: UnitRect) => void;
  onCancel: () => void;
}> = ({
  base,
  baseSize,
  box,
  initial,
  tighterOnly,
  busy,
  failed,
  onApply,
  onCancel,
}) => {
  const [crop, setCrop] = useState<UnitRect>(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Inset so the corner handles stay inside the frame even at full size.
  const scale = Math.min(
    (box.w - INSET * 2) / baseSize.w,
    (box.h - INSET * 2) / baseSize.h
  );
  const fit = { w: baseSize.w * scale, h: baseSize.h * scale };
  const unchanged =
    Math.abs(crop.x - initial.x) < 0.001 &&
    Math.abs(crop.y - initial.y) < 0.001 &&
    Math.abs(crop.w - initial.w) < 0.001 &&
    Math.abs(crop.h - initial.h) < 0.001;

  const pointOf = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return r.width && r.height
      ? {
          x: clamp((e.clientX - r.left) / r.width),
          y: clamp((e.clientY - r.top) / r.height),
        }
      : { x: 0, y: 0 };
  };
  const start = (e: React.PointerEvent<HTMLElement>, d: Drag) => {
    e.stopPropagation();
    e.currentTarget
      .closest<HTMLElement>('[data-crop-area]')
      ?.setPointerCapture?.(e.pointerId);
    setDrag(d);
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <>
      <div
        data-testid="web-crop-editor"
        className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl bg-slate-900"
      >
        <div
          data-crop-area=""
          role="group"
          aria-label="Drag the crop or its corners"
          className="relative touch-none select-none"
          style={{ width: fit.w, height: fit.h }}
          onPointerMove={(e) => {
            if (!drag) return;
            const { x, y } = pointOf(e);
            if (drag.kind === 'corner')
              setCrop(fromCorner(crop, drag.corner, x, y));
            else
              setCrop(
                clampCrop({
                  ...drag.from,
                  x: drag.from.x + x - drag.x,
                  y: drag.from.y + y - drag.y,
                })
              );
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          {base ? (
            <BlobImage
              blob={base}
              alt=""
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-slate-700 motion-reduce:animate-none" />
          )}
          {/* What the crop leaves out, dimmed. */}
          {[
            { left: 0, top: 0, width: '100%', height: pct(crop.y) },
            {
              left: 0,
              top: pct(crop.y + crop.h),
              width: '100%',
              bottom: 0,
            },
            {
              left: 0,
              top: pct(crop.y),
              width: pct(crop.x),
              height: pct(crop.h),
            },
            {
              left: pct(crop.x + crop.w),
              top: pct(crop.y),
              right: 0,
              height: pct(crop.h),
            },
          ].map((style, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute bg-slate-900/60"
              style={style}
            />
          ))}
          {/* no-tour-anchor: the crop drawn over one step's picture */}
          <button
            type="button"
            aria-label="Move the crop"
            data-testid="web-crop-rect"
            className="absolute cursor-move rounded-xs ring-2 ring-white focus-visible:outline-hidden focus-visible:ring-4"
            style={{
              left: pct(crop.x),
              top: pct(crop.y),
              width: pct(crop.w),
              height: pct(crop.h),
            }}
            onPointerDown={(e) => {
              const area = e.currentTarget.parentElement;
              const r = area?.getBoundingClientRect();
              const x = r?.width ? (e.clientX - r.left) / r.width : 0;
              const y = r?.height ? (e.clientY - r.top) / r.height : 0;
              start(e, { kind: 'move', x, y, from: crop });
            }}
          />
          {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <span
              key={c}
              aria-hidden="true"
              data-testid={`web-crop-handle-${c}`}
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-xs bg-white shadow-sm ring-1 ring-slate-900/20"
              style={{
                left: pct(c === 'nw' || c === 'sw' ? crop.x : crop.x + crop.w),
                top: pct(c === 'nw' || c === 'ne' ? crop.y : crop.y + crop.h),
              }}
              onPointerDown={(e) => start(e, { kind: 'corner', corner: c })}
            />
          ))}
        </div>
      </div>
      <div className="absolute -top-3 right-0 flex max-w-full -translate-y-full items-center gap-2 rounded-xl bg-white py-1 pl-3 pr-1 shadow-lg">
        <span className="min-w-0 text-sm text-slate-700">
          {tighterOnly
            ? 'Recorded before whole screens were kept, so this picture can only be cropped tighter.'
            : 'Drag the corners. The whole screen from the recording is shown.'}
        </span>
        {failed && (
          <span role="alert" className="shrink-0 text-sm text-red-700">
            The crop couldn&apos;t be saved.
          </span>
        )}
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={`${primaryBtn} shrink-0 disabled:opacity-50`}
          disabled={busy || unchanged || !base}
          title={unchanged ? 'Move or resize the crop first' : undefined}
          onClick={() => onApply(crop)}
        >
          {busy ? 'Cropping...' : 'Apply crop'}
        </button>
      </div>
    </>
  );
};

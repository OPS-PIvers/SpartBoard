import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { TourPictureMarkup } from '@/components/tours/TourPictureMarkup';
import { RingAndTip } from './picturePreview';
import { useMeasured } from './previewMeasure';
import type {
  StepPictureState,
  StepsLabels,
  StepsViewStep,
} from './stepsModel';

/** The widest a picture is drawn: never past its own pixels, nor 1.5 times the width it had on the page. */
const MAX_MAGNIFY = 1.5;

/** The target as a reader sees it: a ring that shows on any page colour, with the picture left at full brightness. */
export const TargetRing: React.FC<{
  target: NonNullable<StepsViewStep['picture']>['target'];
}> = ({ target }) =>
  target && (
    <span
      data-testid="step-picture-ring"
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${target.x * 100}%`,
        top: `${target.y * 100}%`,
        width: `${target.w * 100}%`,
        height: `${target.h * 100}%`,
      }}
    >
      <span className="absolute -inset-1.5 rounded-[10px] border-[3px] border-white shadow-[0_0_0_2px_rgba(15,23,42,0.65)]" />
    </span>
  );

/** About the width a picture prints at, so the ring keeps the size it has on screen. */
const PRINT_W = 680;
const PAD = 6;
const RADIUS = 10;

/** The spotlight as it prints: drawn in the picture's own space, so it needs no measuring (the print copy is never laid out on screen). */
export const PrintSpotlight: React.FC<{
  target: NonNullable<NonNullable<StepsViewStep['picture']>['target']>;
  ratio: number;
}> = ({ target, ratio }) => {
  const w = PRINT_W;
  const h = Math.round(PRINT_W * ratio);
  const x = target.x * w - PAD;
  const y = target.y * h - PAD;
  const bw = target.w * w + PAD * 2;
  const bh = target.h * h + PAD * 2;
  const r = Math.min(RADIUS, bw / 2, bh / 2);
  const hole = `M${x + r},${y} H${x + bw - r} A${r},${r} 0 0,1 ${x + bw},${y + r} V${y + bh - r} A${r},${r} 0 0,1 ${x + bw - r},${y + bh} H${x + r} A${r},${r} 0 0,1 ${x},${y + bh - r} V${y + r} A${r},${r} 0 0,1 ${x + r},${y} Z`;
  return (
    <svg
      data-testid="step-picture-print-spotlight"
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 hidden h-full w-full print:block"
    >
      <path
        d={`M0,0 H${w} V${h} H0 Z ${hole}`}
        fillRule="evenodd"
        fill="rgba(2,6,23,0.55)"
      />
      <rect
        x={x}
        y={y}
        width={bw}
        height={bh}
        rx={r}
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={10}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x}
        y={y}
        width={bw}
        height={bh}
        rx={r}
        fill="none"
        stroke="white"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/** One step's picture in the article: loading, ready with its target ringed, or a one-line notice when it can't show. Draws nothing for a step with no picture. */
export const StepPicture: React.FC<{
  step: StepsViewStep;
  index: number;
  state: StepPictureState | undefined;
  labels: StepsLabels;
  /** Picture markup (arrows, boxes, numbers) is drawn here, over the ring, in the picture's own 0-1 space. */
  markup?: React.ReactNode;
}> = ({ step, index, state, labels, markup }) => {
  const pic = step.picture;
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const [frameRef, frame] = useMeasured<HTMLElement>();
  if (!pic) return null;
  const src = state?.status === 'ready' ? state.src : null;
  const failed = state?.status === 'failed' || (!!src && brokenSrc === src);
  if (failed)
    return (
      <p
        data-testid="step-picture"
        data-state="failed"
        className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 print:hidden"
      >
        <ImageOff
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        {labels.pictureFailed}
      </p>
    );
  const sized = pic.w > 0 && pic.h > 0;
  return (
    <figure
      ref={frameRef}
      data-testid="step-picture"
      data-state={src ? 'ready' : 'loading'}
      className={`relative w-full max-w-[var(--pic-max)] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm [transform:translateZ(0)] print:shadow-none print:break-inside-avoid ${
        src ? '' : 'print:hidden'
      }`}
      style={
        {
          aspectRatio: sized ? `${pic.w} / ${pic.h}` : '16 / 9',
          '--pic-max': sized
            ? `${Math.round(Math.min(pic.w, Math.max(pic.cssW || pic.w, 360) * MAX_MAGNIFY))}px`
            : '100%',
        } as React.CSSProperties
      }
    >
      {src ? (
        <>
          <img
            src={src}
            alt={labels.pictureAlt(index + 1)}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain"
            onError={() => setBrokenSrc(src)}
          />
          {pic.target && sized && (
            <PrintSpotlight target={pic.target} ratio={pic.h / pic.w} />
          )}
          {pic.target && frame.w > 0 && (
            <div className="print:hidden">
              <RingAndTip
                step={{
                  title: step.title,
                  text: step.text,
                  observe: step.observe,
                }}
                index={index}
                total={1}
                size={frame}
                frac={pic.target}
                withTip={false}
              />
            </div>
          )}
          {pic.markup && (
            <TourPictureMarkup
              shapes={pic.markup}
              width={pic.w}
              height={pic.h}
              overDim
            />
          )}
          {markup && (
            <div
              data-testid="step-picture-markup"
              className="pointer-events-none absolute inset-0"
            >
              {markup}
            </div>
          )}
        </>
      ) : (
        <div
          role="status"
          aria-label={labels.pictureLoading}
          className="absolute inset-0 animate-pulse bg-slate-200 motion-reduce:animate-none"
        />
      )}
    </figure>
  );
};

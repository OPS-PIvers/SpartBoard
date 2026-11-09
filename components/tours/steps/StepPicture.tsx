import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type {
  StepPictureState,
  StepsLabels,
  StepsViewStep,
} from './stepsModel';

/** The widest a picture is drawn, as a multiple of its width in CSS pixels, so a capture never goes soft. */
const MAX_MAGNIFY = 1.5;

const Message: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-600">
    <ImageOff className="h-6 w-6 text-slate-400" aria-hidden="true" />
    <p>{text}</p>
  </div>
);

/** The target as the real tour shows it: the rest of the picture dimmed, the control ringed in white. */
const TargetRing: React.FC<{
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
      <span className="absolute -inset-1.5 rounded-[10px] border-[3px] border-white shadow-[0_0_0_9999px_rgba(2,6,23,0.55)] print:[print-color-adjust:exact]" />
    </span>
  );

/** One step's picture in the article: loading, ready with its target ringed, or failed. Draws nothing for a step with no picture. */
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
  if (!pic) return null;
  const src = state?.status === 'ready' ? state.src : null;
  const failed = state?.status === 'failed' || (!!src && brokenSrc === src);
  const sized = pic.w > 0 && pic.h > 0;
  return (
    <figure
      data-testid="step-picture"
      data-state={failed ? 'failed' : src ? 'ready' : 'loading'}
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 max-w-[var(--pic-max)] print:max-w-[12cm] print:break-inside-avoid"
      style={
        {
          aspectRatio: sized ? `${pic.w} / ${pic.h}` : '16 / 9',
          '--pic-max': sized
            ? `${Math.round(Math.max(pic.cssW || pic.w, 360) * MAX_MAGNIFY)}px`
            : '100%',
        } as React.CSSProperties
      }
    >
      {failed ? (
        <Message text={labels.pictureFailed} />
      ) : src ? (
        <>
          <img
            src={src}
            alt={labels.pictureAlt(index + 1)}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain"
            onError={() => setBrokenSrc(src)}
          />
          <TargetRing target={pic.target} />
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

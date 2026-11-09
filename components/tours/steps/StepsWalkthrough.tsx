import React, { useState, useSyncExternalStore } from 'react';
import { ImageOff } from 'lucide-react';
import { TourBar } from '@/components/tours/TourBar';
import { stageScale } from '@/components/tours/web/pictureTarget';
import { PreviewTip, RingAndTip } from './picturePreview';
import { TIP_H, TIP_W, useMeasured } from './previewMeasure';
import type { WalkthroughProps } from './StepsView';

const PAD_X = 16;
const BAR_H = 64;
const WIDE_TIP_W = TIP_W + 40;
const FALLBACK_CSS = { w: 1280, h: 720 };

const onResize = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const viewportHeight = () => window.innerHeight;
const noViewport = () => 800;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

const Message: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-200">
    <ImageOff className="h-6 w-6 text-slate-400" aria-hidden="true" />
    <p>{text}</p>
  </div>
);

/** One picture at a time, the target ringed, with the tour's own step bar and tip; read only. */
export const StepsWalkthrough: React.FC<WalkthroughProps> = ({
  steps,
  pictures,
  labels,
  onExit,
  renderText,
  renderMarkup,
}) => {
  const [asked, setAsked] = useState(0);
  const [hostRef, host] = useMeasured<HTMLDivElement>();
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  const vh = useSyncExternalStore(onResize, viewportHeight, noViewport);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const total = steps.length;
  const index = clamp(asked, 0, Math.max(0, total - 1));
  const step = steps[index];
  if (!step) return null;

  const pic = step.picture;
  const state = pictures[step.id];
  const src = state?.status === 'ready' ? state.src : null;
  const failed = state?.status === 'failed' || (!!src && brokenSrc === src);
  const sized = !!pic && pic.w > 0 && pic.h > 0;
  const css =
    pic && sized
      ? {
          w: pic.cssW || pic.w,
          h: Math.round(((pic.cssW || pic.w) * pic.h) / pic.w),
        }
      : FALLBACK_CSS;
  const room = {
    w: Math.max(0, host.w - PAD_X * 2),
    h: clamp(vh * 0.45, 220, 620),
  };
  const k = stageScale(css, pic && sized ? pic.w : css.w, room);
  const shown = { w: Math.round(css.w * k), h: Math.round(css.h * k) };
  const tipW = Math.min(WIDE_TIP_W, Math.max(0, room.w));
  const tipH = tipSize.h || TIP_H;
  const last = index + 1 === total;
  const goNext = () => (last ? onExit() : setAsked(index + 1));

  return (
    <div
      ref={hostRef}
      data-testid="steps-walkthrough"
      className="flex flex-col items-center gap-3 rounded-2xl bg-slate-800 px-4 pb-6 pt-2"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'ArrowLeft' && index > 0) setAsked(index - 1);
      }}
    >
      {/* Fixed chrome sits inside a transformed box, so it lays out here instead of over the page. */}
      <div
        className="relative w-full [transform:translateZ(0)] [&_[data-testid=tour-bar-grip]]:hidden"
        style={{ height: BAR_H }}
      >
        <TourBar
          current={index + 1}
          total={total}
          onBack={index > 0 ? () => setAsked(index - 1) : undefined}
          onNext={goNext}
          onExit={onExit}
          positionKey={null}
        />
      </div>
      {step.onlyIfAppears && (
        <p
          data-testid="steps-only-if"
          className="text-sm font-medium text-slate-200"
        >
          {labels.onlyIfAppears}
        </p>
      )}
      <div
        data-testid="steps-walkthrough-picture"
        data-state={
          failed ? 'failed' : src ? 'ready' : pic ? 'loading' : 'none'
        }
        className="relative overflow-hidden rounded-xl bg-slate-700 shadow-2xl [transform:translateZ(0)]"
        style={{ width: shown.w, height: shown.h }}
      >
        {!pic ? (
          <Message text={labels.noPicture} />
        ) : failed ? (
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
            {pic.target && (
              <RingAndTip
                step={{
                  title: step.title,
                  text: step.text,
                  observe: step.observe,
                }}
                index={index}
                total={total}
                size={shown}
                frac={pic.target}
                withTip={false}
              />
            )}
            {renderMarkup && (
              <div
                data-testid="step-picture-markup"
                className="pointer-events-none absolute inset-0"
              >
                {renderMarkup(step)}
              </div>
            )}
          </>
        ) : (
          <div
            role="status"
            aria-label={labels.pictureLoading}
            className="absolute inset-0 animate-pulse bg-slate-600 motion-reduce:animate-none"
          />
        )}
      </div>
      <div
        className="relative [transform:translateZ(0)]"
        style={{ width: tipW, height: tipH }}
      >
        <PreviewTip
          step={{
            title: step.title.trim() || labels.untitledStep,
            text: step.text,
            observe: step.observe,
          }}
          index={index}
          total={total}
          boxRef={tipRef}
          place={{ left: 0, top: 0, width: tipW }}
          tether={null}
          plain={false}
          onNext={goNext}
          renderText={renderText}
        />
      </div>
    </div>
  );
};

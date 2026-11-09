import React, { useEffect, useState } from 'react';
import { Globe, ImageOff } from 'lucide-react';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip } from '@/components/tours/TourTip';
import { TourBar } from '@/components/tours/TourBar';
import { tetherFor } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import { focusRing } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { BlobImage } from './BlurBoxes';
import { BlurEditor } from './webEditorParts';
import { usePictureBlob } from './webPictures';
import type { WebStep } from './webEditorModel';
import {
  placePreviewTip,
  stagePlacement,
  stageScale,
  type FracRect,
} from './pictureTarget';

interface Size {
  w: number;
  h: number;
}

// Callback-ref measuring, so nothing reads a ref during render.
function useMeasured<T extends HTMLElement>(): [(el: T | null) => void, Size] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const read = () =>
      setSize((was) =>
        was.w === el.clientWidth && was.h === el.clientHeight
          ? was
          : { w: el.clientWidth, h: el.clientHeight }
      );
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, size];
}

/** Room kept around the picture for its toolbar above and its note below. */
const STAGE_PAD = { x: 32, y: 72 };
const TIP_H = 120;

/** The learner's view at the size they see it: ring, tip and bar drawn by the real tour chrome. */
const LearnerPreview: React.FC<{
  step: WebStep;
  index: number;
  total: number;
  size: Size;
  frac: FracRect | null;
}> = ({ step, index, total, size, frac }) => {
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  const rect = frac
    ? {
        x: frac.x * size.w,
        y: frac.y * size.h,
        width: frac.w * size.w,
        height: frac.h * size.h,
      }
    : null;
  const tipH = tipSize.h || TIP_H;
  const tip = placePreviewTip(rect, size, tipH);
  const tether = rect
    ? tetherFor(
        {
          x: tip.left,
          y: tip.top ?? size.h - (tip.bottom ?? 0) - tipH,
          w: tip.width,
          h: tipH,
        },
        { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      )
    : null;
  const observe = step.web?.action === 'observe';
  const noop = () => undefined;
  return (
    // inert: the preview is a picture of the tour, never a live one.
    <div inert data-testid="web-stage-preview" className="absolute inset-0">
      {rect && (
        // No breathe loop: a still frame of it reads as a second, wider ring.
        <TourSpotlight rect={rect} clickThrough glide={false} />
      )}
      <TourBar
        current={index + 1}
        total={total}
        onBack={index > 0 ? noop : undefined}
        onNext={noop}
        onExit={noop}
        positionKey={null}
      />
      <TourTip
        boxRef={tipRef}
        headingRef={null}
        left={tip.left}
        top={tip.top}
        bottom={tip.bottom}
        width={tip.width}
        tether={tether}
        plain={!rect}
        animate={false}
        title={step.label?.trim() ?? ''}
        looking={false}
        status={null}
        next={
          observe || !rect
            ? { onNext: noop, last: index + 1 === total }
            : undefined
        }
      >
        {step.text?.trim() && (
          <p className="whitespace-pre-line text-sm text-slate-700">
            {step.text.trim()}
          </p>
        )}
      </TourTip>
    </div>
  );
};

const StageMessage: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="flex max-w-xs flex-col items-center gap-2 text-center text-slate-200">
    <ImageOff className="h-8 w-8 text-slate-400" aria-hidden="true" />
    <p className="text-base font-semibold">{title}</p>
    <p className="text-sm text-slate-300">{body}</p>
  </div>
);

/** The web editor's main area: the selected step's picture with the ring and tip on it as the learner sees them. */
export const WebPictureStage: React.FC<{
  step: WebStep | undefined;
  index: number;
  total: number;
  pictureSelected: boolean;
  onSelectPicture: (on: boolean) => void;
  /** Shown over the picture while it is selected. */
  tools: React.ReactNode;
  blurring: boolean;
  onBlurred: (blob: Blob) => Promise<void>;
  onCancelBlur: () => void;
}> = ({
  step,
  index,
  total,
  pictureSelected,
  onSelectPicture,
  tools,
  blurring,
  onBlurred,
  onCancelBlur,
}) => {
  const [stageRef, room] = useMeasured<HTMLElement>();
  const picture = step?.web?.picture;
  const { blob, failed } = usePictureBlob(picture?.path);
  const placement = picture
    ? stagePlacement(picture, step?.web?.locator)
    : null;
  const css =
    picture && placement
      ? {
          w: placement.cssW,
          h: Math.round((placement.cssW * picture.h) / picture.w),
        }
      : { w: 0, h: 0 };
  const k = picture
    ? stageScale(css, picture.w, {
        w: room.w - STAGE_PAD.x * 2,
        h: room.h - STAGE_PAD.y * 2,
      })
    : 1;
  const shown = { w: Math.round(css.w * k), h: Math.round(css.h * k) };
  return (
    <section
      ref={stageRef}
      aria-label="Step preview"
      data-testid="web-stage"
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-800"
    >
      {!step ? (
        <div className="flex max-w-xs flex-col items-center gap-2 text-center text-slate-200">
          <Globe className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-base font-semibold">No steps yet</p>
          <p className="text-sm text-slate-300">
            Record steps on the website to start.
          </p>
        </div>
      ) : !picture ? (
        <StageMessage
          title="No picture for this step"
          body="Fix on site takes a new one."
        />
      ) : failed ? (
        <StageMessage
          title="The picture couldn't load"
          body="Check your connection, or retake it with Fix on site."
        />
      ) : (
        <div
          data-testid="web-stage-box"
          data-scale={k.toFixed(3)}
          className="relative"
          style={{ width: shown.w, height: shown.h }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && pictureSelected) {
              e.stopPropagation();
              onSelectPicture(false);
            }
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-2xl">
            <div
              data-testid="web-stage-frame"
              // The scale makes the tour chrome's fixed layers sit inside the picture, drawn to the page's scale.
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: css.w,
                height: css.h,
                transform: `scale(${k})`,
              }}
            >
              {blob ? (
                <BlobImage
                  blob={blob}
                  alt={`Picture for step ${index + 1}`}
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <div className="absolute inset-0 animate-pulse bg-slate-100 motion-reduce:animate-none" />
              )}
              {!blurring && blob && (
                <LearnerPreview
                  step={step}
                  index={index}
                  total={total}
                  size={css}
                  frac={placement?.rect ?? null}
                />
              )}
            </div>
          </div>
          {blurring ? (
            <BlurEditor
              key={picture.path}
              path={picture.path}
              index={index}
              onApply={onBlurred}
              onCancel={onCancelBlur}
            />
          ) : (
            <>
              <button
                type="button"
                aria-pressed={pictureSelected}
                aria-label="Select picture"
                data-testid="web-stage-picture"
                onClick={() => onSelectPicture(!pictureSelected)}
                className={`absolute inset-0 rounded-xl ${focusRing} ${
                  pictureSelected
                    ? 'ring-4 ring-brand-blue-primary ring-offset-2 ring-offset-slate-800'
                    : 'hover:ring-2 hover:ring-white/40'
                }`}
                {...tourAttr('web-tour-editor.picture')}
              />
              {pictureSelected && (
                <div
                  role="toolbar"
                  aria-label="Picture tools"
                  data-testid="web-stage-picture-tools"
                  className="absolute -top-3 right-0 flex -translate-y-full gap-1 rounded-xl bg-white p-1 shadow-lg"
                >
                  {tools}
                </div>
              )}
              {placement?.source === 'none' && blob && (
                <p
                  data-testid="web-stage-no-ring"
                  className="absolute left-0 right-0 top-full mt-3 text-center text-xs text-slate-300"
                >
                  Retake or fix this step on the site to preview its ring.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

import React, { useEffect, useState } from 'react';
import { Globe, ImageOff } from 'lucide-react';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip } from '@/components/tours/TourTip';
import { TourBar } from '@/components/tours/TourBar';
import { tetherFor } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import { focusRing } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { BlurEditor, WebStepPicture } from './webEditorParts';
import type { WebStep } from './webEditorModel';
import { placePreviewTip, targetInPicture } from './pictureTarget';

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

const STAGE_PAD = 56;
const TIP_H = 120;

/** The picture at the largest size that fits, keeping its shape. */
const fit = (picture: Size, room: Size): Size => {
  const w = Math.max(0, room.w - STAGE_PAD * 2);
  const h = Math.max(0, room.h - STAGE_PAD * 2);
  if (!picture.w || !picture.h) return { w: 0, h: 0 };
  // Not measured yet (or no layout, as in tests): the picture's own size.
  if (!w || !h) return picture;
  const scale = Math.min(w / picture.w, h / picture.h);
  return {
    w: Math.round(picture.w * scale),
    h: Math.round(picture.h * scale),
  };
};

/** The learner's view of one step: the ring, tip and bar drawn by the real tour chrome. */
const LearnerPreview: React.FC<{
  step: WebStep;
  index: number;
  total: number;
  size: Size;
}> = ({ step, index, total, size }) => {
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  const frac = targetInPicture(step.web?.locator);
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
        <TourSpotlight
          rect={rect}
          breathe={!observe}
          clickThrough
          glide={false}
        />
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
        next={observe ? { onNext: noop, last: index + 1 === total } : undefined}
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
  const size = picture ? fit(picture, room) : { w: 0, h: 0 };
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
      ) : blurring && picture ? (
        <div className="flex h-full w-full items-center justify-center overflow-y-auto p-8">
          <BlurEditor
            key={picture.path}
            path={picture.path}
            index={index}
            onApply={onBlurred}
            onCancel={onCancelBlur}
          />
        </div>
      ) : !picture ? (
        <div className="flex max-w-xs flex-col items-center gap-2 text-center text-slate-200">
          <ImageOff className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-base font-semibold">No picture for this step</p>
          <p className="text-sm text-slate-300">Fix on site takes a new one.</p>
        </div>
      ) : size.w > 0 ? (
        <div
          className="relative"
          style={{ width: size.w, height: size.h }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && pictureSelected) {
              e.stopPropagation();
              onSelectPicture(false);
            }
          }}
        >
          <div
            data-testid="web-stage-frame"
            // A transform makes the tour chrome's fixed layers sit inside the picture.
            className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-2xl [transform:translateZ(0)]"
          >
            <WebStepPicture
              path={picture.path}
              label={`Picture for step ${index + 1}`}
              className="absolute inset-0 h-full w-full"
            />
            <LearnerPreview
              step={step}
              index={index}
              total={total}
              size={size}
            />
          </div>
          <button
            type="button"
            aria-pressed={pictureSelected}
            aria-label="Select picture"
            data-testid="web-stage-picture"
            {...tourAttr('web-tour-editor.picture')}
            onClick={() => onSelectPicture(!pictureSelected)}
            className={`absolute inset-0 rounded-xl ${focusRing} ${
              pictureSelected
                ? 'ring-4 ring-brand-blue-primary ring-offset-2 ring-offset-slate-800'
                : 'hover:ring-2 hover:ring-white/40'
            }`}
          />
          {pictureSelected && (
            <div
              role="toolbar"
              aria-label="Picture tools"
              data-testid="web-stage-picture-tools"
              className="absolute -top-3 right-3 flex -translate-y-full gap-1 rounded-xl bg-white p-1 shadow-lg"
            >
              {tools}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

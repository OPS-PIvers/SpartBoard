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

const PAD_X = 32;
const GAP = 12;
/** The step bar's band above the picture, in CSS pixels before scaling. */
const BAR_BAND = { w: 380, h: 60 };
/** Room under the picture for its tools (unscaled). */
const TOOLS_H = 48;
const TIP_W = 320;
const TIP_H = 140;
const NOTE_H = 28;

const noop = () => undefined;

/** A layer drawn at CSS size and scaled; its transform also holds the tour chrome's fixed layers inside it. */
const Scaled: React.FC<{
  css: Size;
  k: number;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  children: React.ReactNode;
}> = ({ css, k, className = '', style, testId, children }) => (
  <div
    className={`absolute ${className}`}
    style={{ width: css.w * k, height: css.h * k, ...style }}
  >
    <div
      data-testid={testId}
      className="absolute left-0 top-0 origin-top-left"
      style={{ width: css.w, height: css.h, transform: `scale(${k})` }}
    >
      {children}
    </div>
  </div>
);

/** The step's tip as the learner reads it. */
const PreviewTip: React.FC<{
  step: WebStep;
  index: number;
  total: number;
  boxRef: React.Ref<HTMLDivElement>;
  place: { left: number; top?: number; bottom?: number; width: number };
  tether: ReturnType<typeof tetherFor> | null;
  plain: boolean;
}> = ({ step, index, total, boxRef, place, tether, plain }) => (
  <TourTip
    boxRef={boxRef}
    headingRef={null}
    left={place.left}
    top={place.top}
    bottom={place.bottom}
    width={place.width}
    tether={tether}
    plain={plain}
    animate={false}
    title={step.label?.trim() ?? ''}
    looking={false}
    status={null}
    next={
      step.web?.action === 'observe' || plain
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
);

/** The ring and its tip on the picture, at the page's own scale. */
const RingAndTip: React.FC<{
  step: WebStep;
  index: number;
  total: number;
  size: Size;
  frac: FracRect;
}> = ({ step, index, total, size, frac }) => {
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  const rect = {
    x: frac.x * size.w,
    y: frac.y * size.h,
    width: frac.w * size.w,
    height: frac.h * size.h,
  };
  const tipH = tipSize.h || TIP_H;
  const place = placePreviewTip(rect, size, tipH);
  const tether = tetherFor(
    {
      x: place.left,
      y: place.top ?? size.h - (place.bottom ?? 0) - tipH,
      w: place.width,
      h: tipH,
    },
    { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
  );
  return (
    // inert: the preview is a picture of the tour, never a live one.
    <div inert data-testid="web-stage-preview" className="absolute inset-0">
      {/* No breathe loop: a still frame of it reads as a second, wider ring. */}
      <TourSpotlight rect={rect} clickThrough glide={false} />
      <PreviewTip
        step={step}
        index={index}
        total={total}
        boxRef={tipRef}
        place={place}
        tether={tether}
        plain={false}
      />
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

/** The web editor's main area: the step bar above the picture, and the ring and tip on it as the learner sees them. */
export const WebPictureStage: React.FC<{
  step: WebStep | undefined;
  index: number;
  total: number;
  pictureSelected: boolean;
  onSelectPicture: (on: boolean) => void;
  /** Shown under the picture while it is selected. */
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
  const [dockRef, dockSize] = useMeasured<HTMLDivElement>();
  const picture = step?.web?.picture;
  const { blob, failed } = usePictureBlob(picture?.path);
  const placement = picture
    ? stagePlacement(picture, step?.web?.locator)
    : null;
  const ring = placement?.rect ?? null;
  const css =
    picture && placement
      ? {
          w: placement.cssW,
          h: Math.round((placement.cssW * picture.h) / picture.w),
        }
      : { w: 0, h: 0 };
  // Above: the bar band; below: the tools, or the docked tip and its note when there is no ring.
  const chrome = (k: number) =>
    BAR_BAND.h * k +
    GAP * 2 +
    Math.max(TOOLS_H, ring ? 0 : (dockSize.h || TIP_H) * k + NOTE_H);
  const fitIn = (k: number) =>
    picture
      ? stageScale(css, picture.w, {
          w: room.w - PAD_X * 2,
          h: room.h - GAP * 2 - chrome(k),
        })
      : 1;
  // One refinement: the chrome's room depends on the scale it is drawn at.
  const k = fitIn(fitIn(1));
  const shown = { w: Math.round(css.w * k), h: Math.round(css.h * k) };
  const dockW = Math.min(TIP_W, css.w);
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
          style={{
            width: shown.w,
            height: shown.h,
            // Centres the picture with its chrome, which is taller below when the tip docks there.
            marginTop: BAR_BAND.h * k + GAP,
            marginBottom:
              (ring
                ? TOOLS_H
                : Math.max(TOOLS_H, chrome(k) - BAR_BAND.h * k - GAP * 2)) +
              GAP,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && pictureSelected) {
              e.stopPropagation();
              onSelectPicture(false);
            }
          }}
        >
          {!blurring && (
            <Scaled
              css={BAR_BAND}
              k={k}
              testId="web-stage-bar"
              className="bottom-full left-1/2 mb-1 -translate-x-1/2"
            >
              <div inert className="absolute inset-0">
                <TourBar
                  current={index + 1}
                  total={total}
                  onBack={index > 0 ? noop : undefined}
                  onNext={noop}
                  onExit={noop}
                  positionKey={null}
                />
              </div>
            </Scaled>
          )}
          <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-2xl">
            <Scaled
              css={css}
              k={k}
              testId="web-stage-frame"
              className="inset-0"
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
              {!blurring && blob && ring && (
                <RingAndTip
                  step={step}
                  index={index}
                  total={total}
                  size={css}
                  frac={ring}
                />
              )}
            </Scaled>
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
                  className="absolute right-0 top-full mt-3 flex gap-1 rounded-xl bg-white p-1 shadow-lg"
                >
                  {tools}
                </div>
              )}
              {!ring && blob && (
                <div
                  data-testid="web-stage-dock"
                  className="absolute left-0 top-full mt-3 flex flex-col gap-2"
                >
                  <div
                    className="relative"
                    style={{
                      width: dockW * k,
                      height: (dockSize.h || TIP_H) * k,
                    }}
                  >
                    <div
                      inert
                      className="absolute left-0 top-0 origin-top-left"
                      style={{
                        width: dockW,
                        height: dockSize.h || TIP_H,
                        transform: `scale(${k})`,
                      }}
                    >
                      <PreviewTip
                        step={step}
                        index={index}
                        total={total}
                        boxRef={dockRef}
                        place={{ left: 0, top: 0, width: dockW }}
                        tether={null}
                        plain
                      />
                    </div>
                  </div>
                  <p
                    data-testid="web-stage-no-ring"
                    className="text-xs text-slate-300"
                    style={{ maxWidth: Math.max(dockW * k, 240) }}
                  >
                    Retake or fix this step on the site to preview its ring.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

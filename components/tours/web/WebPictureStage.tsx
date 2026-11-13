import React from 'react';
import { Globe, ImageOff } from 'lucide-react';
import { TourBar } from '@/components/tours/TourBar';
import { focusRing } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { BlobImage } from './BlurBoxes';
import { TourPictureMarkup } from '@/components/tours/TourPictureMarkup';
import { usePictureBlob } from './webPictures';
import {
  PreviewTip,
  RingAndTip,
  Scaled,
  type PreviewStep,
} from '@/components/tours/steps/picturePreview';
import {
  noop,
  TIP_H,
  TIP_W,
  useMeasured,
  type Size,
} from '@/components/tours/steps/previewMeasure';
import type { WebStep } from './webEditorModel';
import { stagePlacement, stageScale } from './pictureTarget';
import { WebMessageStage } from './WebMessageStage';
import { isMessageStep } from './tourSequence';

/** A picture tool's layer over the stage picture, given the picture's box as shown. */
export interface StageEditing {
  kind: 'blur' | 'crop' | 'markup';
  render: (box: Size) => React.ReactNode;
}

const PAD_X = 32;
const GAP = 12;
/** The step bar's band above the picture, in CSS pixels before scaling. */
const BAR_BAND = { w: 380, h: 60 };
/** Room under the picture for its tools (unscaled). */
const TOOLS_H = 48;
const NOTE_H = 28;

const previewStepOf = (step: WebStep): PreviewStep => ({
  title: step.label ?? '',
  text: step.text ?? '',
  observe: step.web?.action === 'observe',
});

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
  /** A picture tool at work (blur, crop, mark up): drawn in the picture's own box, so the frame never moves. */
  editing: StageEditing | null;
}> = ({
  step,
  index,
  total,
  pictureSelected,
  onSelectPicture,
  tools,
  editing,
}) => {
  const blurring = !!editing;
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
      ) : isMessageStep(step) ? (
        <WebMessageStage step={step} index={index} total={total} />
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
              {editing?.kind !== 'markup' && picture.markup && (
                <TourPictureMarkup
                  shapes={picture.markup}
                  width={picture.w}
                  height={picture.h}
                  overDim
                />
              )}
              {blob && ring && (!editing || editing.kind === 'markup') && (
                <RingAndTip
                  step={previewStepOf(step)}
                  index={index}
                  total={total}
                  size={css}
                  frac={ring}
                  guide={editing?.kind === 'markup'}
                />
              )}
            </Scaled>
          </div>
          {editing ? (
            editing.render(shown)
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
                        step={previewStepOf(step)}
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

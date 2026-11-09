import React from 'react';
import { noop, TIP_H, useMeasured, type Size } from './previewMeasure';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip } from '@/components/tours/TourTip';
import { tetherFor } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import {
  placePreviewTip,
  type FracRect,
} from '@/components/tours/web/pictureTarget';

/** A layer drawn at CSS size and scaled; its transform also holds the tour chrome's fixed layers inside it. */
export const Scaled: React.FC<{
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

/** The step as its tip reads it: title and words. */
export interface PreviewStep {
  title: string;
  text: string;
  /** Observe steps show the tip's own Next, as the real tour does. */
  observe: boolean;
}

/** The step's tip as the learner reads it. */
export const PreviewTip: React.FC<{
  step: PreviewStep;
  index: number;
  total: number;
  boxRef: React.Ref<HTMLDivElement>;
  place: { left: number; top?: number; bottom?: number; width: number };
  tether: ReturnType<typeof tetherFor> | null;
  plain: boolean;
  onNext?: () => void;
  renderText?: (text: string) => React.ReactNode;
}> = ({
  step,
  index,
  total,
  boxRef,
  place,
  tether,
  plain,
  onNext = noop,
  renderText,
}) => (
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
    title={step.title.trim()}
    looking={false}
    status={null}
    next={
      step.observe || plain ? { onNext, last: index + 1 === total } : undefined
    }
  >
    {step.text.trim() && (
      <p className="whitespace-pre-line text-sm text-slate-700">
        {renderText ? renderText(step.text.trim()) : step.text.trim()}
      </p>
    )}
  </TourTip>
);

/** The ring on a picture, and its tip too unless `withTip` is off; `size` is the frame's size in its own pixels. */
export const RingAndTip: React.FC<{
  step: PreviewStep;
  index: number;
  total: number;
  size: Size;
  frac: FracRect;
  withTip?: boolean;
}> = ({ step, index, total, size, frac, withTip = true }) => {
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
      {withTip && (
        <PreviewTip
          step={step}
          index={index}
          total={total}
          boxRef={tipRef}
          place={place}
          tether={tether}
          plain={false}
        />
      )}
    </div>
  );
};

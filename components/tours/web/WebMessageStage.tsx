import React from 'react';
import { TourBar } from '@/components/tours/TourBar';
import { PreviewTip } from '@/components/tours/steps/picturePreview';
import {
  noop,
  TIP_H,
  useMeasured,
} from '@/components/tours/steps/previewMeasure';
import type { GuidedLearningStep } from '@/types';

const WIDTH = 380;
const BAR_H = 60;
const PAD = 48;
// A short message grows to fill the stage, never past this multiple of its real size.
const MAX_SCALE = 2;

/** A Message step as the learner sees it: the step bar over a centred tip, scaled up to fill the stage, with no picture behind it. */
export const WebMessageStage: React.FC<{
  step: GuidedLearningStep;
  index: number;
  total: number;
}> = ({ step, index, total }) => {
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  const [roomRef, room] = useMeasured<HTMLDivElement>();
  const height = BAR_H + (tipSize.h || TIP_H);
  const k = Math.max(
    1,
    Math.min(
      MAX_SCALE,
      (room.w - PAD * 2) / WIDTH || 1,
      (room.h - PAD * 2) / height || 1
    )
  );
  return (
    <div
      ref={roomRef}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div
        className="relative shrink-0"
        style={{ width: WIDTH * k, height: height * k }}
      >
        {/* The transform makes the bar and tip (position: fixed) sit inside this box, as they do in the picture stage. */}
        <div
          inert
          data-testid="web-stage-message"
          data-scale={k.toFixed(3)}
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: WIDTH, height, transform: `scale(${k})` }}
        >
          <TourBar
            current={index + 1}
            total={total}
            onBack={index > 0 ? noop : undefined}
            onNext={noop}
            onExit={noop}
            positionKey={null}
          />
          <PreviewTip
            step={{
              title: step.label ?? '',
              text: step.text ?? '',
              observe: false,
            }}
            index={index}
            total={total}
            boxRef={tipRef}
            place={{ left: 0, top: BAR_H, width: WIDTH }}
            tether={null}
            plain
          />
        </div>
      </div>
    </div>
  );
};

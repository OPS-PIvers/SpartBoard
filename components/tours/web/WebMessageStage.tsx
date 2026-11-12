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

/** A Message step as the learner sees it: the step bar over a centred tip, with no picture behind it. */
export const WebMessageStage: React.FC<{
  step: GuidedLearningStep;
  index: number;
  total: number;
}> = ({ step, index, total }) => {
  const [tipRef, tipSize] = useMeasured<HTMLDivElement>();
  return (
    // The transform makes the bar and tip (position: fixed) sit inside this box, as they do in the picture stage.
    <div
      inert
      data-testid="web-stage-message"
      className="relative"
      style={{
        width: WIDTH,
        height: BAR_H + (tipSize.h || TIP_H),
        transform: 'translateZ(0)',
      }}
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
  );
};

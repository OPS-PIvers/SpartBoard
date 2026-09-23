import React from 'react';
import type { GuidedLearningPublicStep, GuidedLearningSet } from '@/types';
import { GuidedLearningStage } from '@/components/widgets/GuidedLearning/components/GuidedLearningStage';
import { DeviceFrame } from '@/components/widgets/GuidedLearning/components/studio/DeviceFrame';
import { customPreset } from '@/components/widgets/GuidedLearning/components/studio/devicePresets';
import type { TourStep } from './tourSession';

const PREVIEW = customPreset(480, 270);
const NO_ANSWERS: ReadonlySet<string> = new Set();
const noop = () => undefined;

/** The step's recorded slide, shown when its anchor can't be found on screen. */
const TourMiniPlayer: React.FC<{ set: GuidedLearningSet; step: TourStep }> = ({
  set,
  step,
}) => (
  <div
    data-testid="tour-mini-player"
    className="aspect-video w-full overflow-hidden rounded-lg"
  >
    <DeviceFrame preset={PREVIEW}>
      <GuidedLearningStage
        set={set}
        steps={[step as unknown as GuidedLearningPublicStep]}
        imageIndex={step.imageIndex ?? 0}
        activeStepId={step.id}
        authorMode="explore"
        answeredStepIds={NO_ANSWERS}
        teacherMode
        zoomScale={1}
        forceOverlay
        onPinClick={noop}
        onAdvance={noop}
        onDismiss={noop}
      />
    </DeviceFrame>
  </div>
);

export default TourMiniPlayer;

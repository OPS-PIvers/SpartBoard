import React, { useMemo } from 'react';
import type { GuidedLearningSet } from '@/types';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { StepsView, type StepsMode } from './StepsView';
import { StepsWalkthrough } from './StepsWalkthrough';
import { stepsFromLiveTour } from './liveSteps';
import type { StepPictures } from './stepsModel';
import { useStepsLabels } from './useStepsLabels';

/** A Live tour read as steps. Its pictures are the thumbnails already on the steps, so nothing is fetched here. */
export const LiveTourStepsView: React.FC<{
  set: GuidedLearningSet;
  initialMode?: StepsMode;
}> = ({ set, initialMode }) => {
  const labels = useStepsLabels();
  const { steps, urls } = useMemo(() => stepsFromLiveTour(set), [set]);
  const pictures = useMemo<StepPictures>(
    () =>
      Object.fromEntries(
        Object.entries(urls).map(([id, src]) => [
          id,
          { status: 'ready' as const, src },
        ])
      ),
    [urls]
  );
  return (
    <StepsView
      steps={steps}
      pictures={pictures}
      labels={labels}
      walkthrough={StepsWalkthrough}
      initialMode={initialMode}
      renderText={renderStepText}
      print={{ title: set.title }}
    />
  );
};

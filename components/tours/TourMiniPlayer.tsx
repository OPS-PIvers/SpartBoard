import React from 'react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { freshTourPictureUrl } from '@/components/widgets/GuidedLearning/utils/liveTour';

/** The step's picture, shown when its anchor can't be found on screen. */
const TourMiniPlayer: React.FC<{
  set: GuidedLearningSet;
  step: GuidedLearningStep;
}> = ({ set, step }) => {
  const url = freshTourPictureUrl(step, set);
  if (!url) return null;
  return (
    <div
      data-testid="tour-mini-player"
      className="aspect-video w-full overflow-hidden rounded-lg bg-slate-900"
    >
      <img
        src={url}
        alt=""
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
};

export default TourMiniPlayer;

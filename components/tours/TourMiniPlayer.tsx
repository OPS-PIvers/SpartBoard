import React from 'react';
import type { GuidedLearningStep } from '@/types';
import { freshTourThumbnail } from '@/components/widgets/GuidedLearning/utils/liveTour';

/** The step's picture, shown when its anchor can't be found on screen. */
const TourMiniPlayer: React.FC<{ step: GuidedLearningStep }> = ({ step }) => {
  const thumb = freshTourThumbnail(step);
  if (!thumb) return null;
  return (
    <div
      data-testid="tour-mini-player"
      className="aspect-video w-full overflow-hidden rounded-lg bg-slate-900"
    >
      <img
        src={thumb.url}
        alt=""
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
};

export default TourMiniPlayer;

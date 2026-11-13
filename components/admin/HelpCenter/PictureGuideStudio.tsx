import React, { lazy, Suspense } from 'react';
import type { GuidedLearningSet } from '@/types';

const GuidedLearningStudio = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio').then(
    (m) => ({ default: m.GuidedLearningStudio })
  )
);

/** Opens a Help Center Picture guide in the Guided Learning Studio. */
export const PictureGuideStudio: React.FC<{
  set: GuidedLearningSet;
  onSave: (set: GuidedLearningSet) => Promise<void>;
  onClose: () => void;
}> = ({ set, onSave, onClose }) => (
  <Suspense fallback={null}>
    <GuidedLearningStudio
      key={set.id}
      set={set}
      meta={null}
      onClose={onClose}
      onSave={onSave}
    />
  </Suspense>
);

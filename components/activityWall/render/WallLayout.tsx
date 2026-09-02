import React from 'react';
import { SubmissionCard } from './SubmissionCard';
import { prepareSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

/** Free-form wall: a responsive masonry-ish grid of cards, pinned first. */
export const WallLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
  showNames,
  ...actions
}) => {
  const scale = wallScale(mode);
  const items = prepareSubmissions(submissions, mode);

  return (
    <div
      className="grid h-full w-full grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start overflow-auto"
      style={{ gap: scale.gap, padding: scale.pad }}
      data-testid="aw-layout-wall"
    >
      {items.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          mode={mode}
          showNames={showNames}
          {...actions}
        />
      ))}
    </div>
  );
};

export default WallLayout;

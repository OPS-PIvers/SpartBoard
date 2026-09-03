import React from 'react';
import { buildWordCloud, wordColor } from '@/utils/activityWallWordCloud';
import { visibleSubmissions, wallScale } from './scale';
import { AddSpot } from './AddSpot';
import { showsAddSpots } from './addSpots';
import type { WallRenderProps } from './types';

/** Word cloud: weighted words, no cards. Sizing follows the render mode. */
export const WordCloudLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
  onAddAt,
}) => {
  const scale = wallScale(mode);
  const addSpots = showsAddSpots(mode, onAddAt);
  const words = buildWordCloud(visibleSubmissions(submissions, mode));

  return (
    <div className="group relative h-full w-full">
      {addSpots && (
        <AddSpot
          mode={mode}
          placement={{}}
          onAddAt={onAddAt}
          className="absolute z-10 shadow-lg"
          style={{ right: scale.pad, bottom: scale.pad }}
        />
      )}
      <div
        className="flex h-full w-full flex-wrap content-center items-center justify-center overflow-auto"
        style={{ gap: scale.gap, padding: scale.pad }}
        data-testid="aw-layout-wordcloud"
      >
        {words.map(({ word, count, weight }) => (
          <span
            key={word}
            title={`${word} (${count})`}
            className="rounded-lg bg-white/90 font-black leading-none"
            style={{
              fontSize:
                mode === 'widget'
                  ? `clamp(11px, ${(3 + weight * 12).toFixed(2)}cqmin, 96px)`
                  : `${(3 + weight * 12).toFixed(2)}vmin`,
              padding: `0 ${mode === 'widget' ? 'min(8px, 2cqmin)' : '8px'}`,
              color: wordColor(word),
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
};

export default WordCloudLayout;

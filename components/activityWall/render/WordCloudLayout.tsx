import React from 'react';
import { buildWordCloud, wordColor } from '@/utils/activityWallWordCloud';
import { visibleSubmissions, wallScale } from './scale';
import type { WallRenderProps } from './types';

/** Word cloud: weighted words, no cards. Sizing follows the render mode. */
export const WordCloudLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
}) => {
  const scale = wallScale(mode);
  const words = buildWordCloud(visibleSubmissions(submissions, mode));
  const unit = mode === 'widget' ? 'cqmin' : 'vmin';

  return (
    <div
      className="flex h-full w-full flex-wrap content-center items-center justify-center overflow-auto"
      style={{ gap: scale.gap, padding: scale.pad }}
      data-testid="aw-layout-wordcloud"
    >
      {words.map(({ word, count, weight }) => (
        <span
          key={word}
          title={`${word} (${count})`}
          className="rounded-lg bg-white/90 px-2 font-black leading-none"
          style={{
            fontSize: `${(3 + weight * 12).toFixed(2)}${unit}`,
            color: wordColor(word),
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
};

export default WordCloudLayout;

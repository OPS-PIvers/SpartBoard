import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningSet } from '@/types';
import type { EngagementSummary } from '../../utils/progress';

interface Props {
  set: Pick<GuidedLearningSet, 'imageUrls' | 'imageKinds'>;
  misclicksBySlide: EngagementSummary['misclicksBySlide'];
}

/** Missed clicks as dots over each slide; clicks are image-%, so the media box is the image itself. */
export const MisclickHeatmap: React.FC<Props> = ({ set, misclicksBySlide }) => {
  const { t } = useTranslation();
  const slides = [...misclicksBySlide.entries()]
    .filter(([idx, dots]) => dots.length > 0 && set.imageUrls[idx])
    .sort(([a], [b]) => a - b);

  if (slides.length === 0) {
    return (
      <p className="text-slate-300" style={{ fontSize: 'min(12px, 4.5cqmin)' }}>
        {t('glEngagement.noMisclicks')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2" style={{ gap: 'min(8px, 2cqmin)' }}>
      {slides.map(([idx, dots]) => {
        const url = set.imageUrls[idx];
        const caption = t('glEngagement.slide', { number: idx + 1 });
        return (
          <figure
            key={idx}
            className="bg-white/5 rounded-xl overflow-hidden"
            data-testid={`heatmap-slide-${idx}`}
          >
            <div className="relative">
              {set.imageKinds?.[idx] === 'video' ? (
                <video
                  src={url}
                  muted
                  preload="metadata"
                  className="block w-full h-auto"
                />
              ) : (
                <img src={url} alt={caption} className="block w-full h-auto" />
              )}
              {dots.map((d, i) => (
                <span
                  key={`${d.stepId}-${i}`}
                  aria-hidden="true"
                  className="absolute rounded-full bg-red-500/60 ring-1 ring-white/80 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    width: 'min(10px, 2.5cqmin)',
                    height: 'min(10px, 2.5cqmin)',
                  }}
                />
              ))}
            </div>
            <figcaption
              className="flex justify-between text-slate-300"
              style={{
                fontSize: 'min(12px, 4.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                gap: 'min(8px, 2cqmin)',
              }}
            >
              <span className="text-white font-medium">{caption}</span>
              <span className="tabular-nums">
                {t('glEngagement.misclicks', { count: dots.length })}
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
};

import React from 'react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
}

/** Text overlay that blends directly onto the image at the hotspot location */
export const TooltipInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
}) => {
  const x = (step.xPct / 100) * containerWidth;
  const y = (step.yPct / 100) * containerHeight;

  // Determine tooltip offset direction so it stays inside the container
  const offsetX = step.xPct > 60 ? -8 : 12;
  const offsetY = step.yPct > 70 ? -40 : 8;
  const alignRight = step.xPct > 60;

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: x + offsetX,
        top: y + offsetY,
        maxWidth: 'min(200px, 40cqw)',
      }}
    >
      <div
        className={`bg-black/70 backdrop-blur-sm text-white rounded-lg leading-relaxed shadow-lg border border-white/10 ${alignRight ? 'text-right' : 'text-left'}`}
        style={{
          padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
          fontSize: 'min(12px, 3cqmin)',
        }}
      >
        {step.label && (
          <div
            className="font-bold mb-0.5"
            style={{ fontSize: 'min(12px, 3.2cqmin)' }}
          >
            {step.label}
          </div>
        )}
        {step.text}
      </div>
    </div>
  );
};

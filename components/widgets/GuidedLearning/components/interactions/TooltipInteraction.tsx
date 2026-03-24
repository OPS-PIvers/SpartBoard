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
      style={{ left: x + offsetX, top: y + offsetY, maxWidth: 200 }}
    >
      <div
        className={`bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-lg border border-white/10 ${alignRight ? 'text-right' : 'text-left'}`}
      >
        {step.label && <div className="font-semibold mb-0.5">{step.label}</div>}
        {step.text}
      </div>
    </div>
  );
};

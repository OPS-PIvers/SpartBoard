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
  const tooltipWidth = Math.min(280, containerWidth * 0.42);
  const tooltipHeight = Math.max(68, containerHeight * 0.15);
  const viewportPadding = 16;
  const offset = Math.max(0, step.tooltipOffset ?? 12);
  const desiredPosition = step.tooltipPosition ?? 'auto';

  let position = desiredPosition;
  if (desiredPosition === 'auto') {
    const roomBelow = containerHeight - y;
    const roomAbove = y;
    const roomRight = containerWidth - x;
    if (roomBelow >= tooltipHeight + offset + viewportPadding) {
      position = 'below';
    } else if (roomAbove >= tooltipHeight + offset + viewportPadding) {
      position = 'above';
    } else if (roomRight >= tooltipWidth + offset + viewportPadding) {
      position = 'right';
    } else {
      position = 'left';
    }
  }

  const anchorStyles: Record<
    NonNullable<GuidedLearningPublicStep['tooltipPosition']>,
    React.CSSProperties
  > = {
    above: {
      left: x,
      top: y - offset,
      transform: 'translate(-50%, -100%)',
      transformOrigin: '50% 100%',
    },
    below: {
      left: x,
      top: y + offset,
      transform: 'translate(-50%, 0)',
      transformOrigin: '50% 0%',
    },
    left: {
      left: x - offset,
      top: y,
      transform: 'translate(-100%, -50%)',
      transformOrigin: '100% 50%',
    },
    right: {
      left: x + offset,
      top: y,
      transform: 'translate(0, -50%)',
      transformOrigin: '0% 50%',
    },
    auto: {},
  };

  type ResolvedTooltipPosition = 'above' | 'below' | 'left' | 'right';
  const resolvedPosition: ResolvedTooltipPosition =
    position === 'auto' ? 'below' : position;
  const bubbleAlignment =
    resolvedPosition === 'left'
      ? 'items-end text-right'
      : 'items-start text-left';
  const arrowClassByPosition = {
    above:
      'absolute left-1/2 -bottom-[5px] -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-black/80',
    below:
      'absolute left-1/2 -top-[5px] -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-black/80',
    left: 'absolute top-1/2 -right-[5px] -translate-y-1/2 border-y-[6px] border-l-[6px] border-y-transparent border-l-black/80',
    right:
      'absolute top-1/2 -left-[5px] -translate-y-1/2 border-y-[6px] border-r-[6px] border-y-transparent border-r-black/80',
  } as const;

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        ...anchorStyles[resolvedPosition],
        maxWidth: 'min(280px, 42cqw)',
      }}
    >
      <div
        className={`relative flex flex-col ${bubbleAlignment} bg-black/80 backdrop-blur-md text-white rounded-xl leading-relaxed shadow-xl border border-white/15`}
        style={{
          padding: 'min(10px, 2.3cqmin) min(12px, 3cqmin)',
          fontSize: 'min(13px, 3.1cqmin)',
        }}
      >
        <span className={arrowClassByPosition[resolvedPosition]} />
        {step.label && (
          <div
            className="font-bold mb-0.5"
            style={{ fontSize: 'min(12px, 3.3cqmin)' }}
          >
            {step.label}
          </div>
        )}
        {step.text}
      </div>
    </div>
  );
};

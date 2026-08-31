import React from 'react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
}

/** Glass tooltip card anchored to the hotspot with a connector line */
export const TooltipInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
}) => {
  const x = (step.xPct / 100) * containerWidth;
  const y = (step.yPct / 100) * containerHeight;
  const tooltipWidth = Math.min(340, containerWidth * 0.5);
  const tooltipHeight = Math.max(76, containerHeight * 0.16);
  const viewportPadding = 16;
  const offset = Math.max(0, step.tooltipOffset ?? 16);
  const desiredPosition = step.tooltipPosition ?? 'auto';

  let position = desiredPosition;
  if (desiredPosition === 'auto') {
    const roomBelow = containerHeight - y;
    const roomAbove = y;
    const roomRight = containerWidth - x;
    const roomLeft = x;
    const requiredVerticalSpace = tooltipHeight + offset + viewportPadding;
    const requiredHorizontalSpace = tooltipWidth + offset + viewportPadding;

    if (roomBelow >= requiredVerticalSpace) {
      position = 'below';
    } else if (roomAbove >= requiredVerticalSpace) {
      position = 'above';
    } else if (roomRight >= requiredHorizontalSpace) {
      position = 'right';
    } else if (roomLeft >= requiredHorizontalSpace) {
      position = 'left';
    } else {
      const availableSpaceByPosition = [
        { position: 'below' as const, space: roomBelow },
        { position: 'above' as const, space: roomAbove },
        { position: 'right' as const, space: roomRight },
        { position: 'left' as const, space: roomLeft },
      ];
      position = availableSpaceByPosition.reduce((best, current) =>
        current.space > best.space ? current : best
      ).position;
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

  // Connector line spanning the gap between the hotspot and the card edge.
  const connectorStyleByPosition: Record<
    ResolvedTooltipPosition,
    React.CSSProperties
  > = {
    above: {
      left: '50%',
      bottom: -offset,
      height: offset,
      width: 2,
      transform: 'translateX(-50%)',
    },
    below: {
      left: '50%',
      top: -offset,
      height: offset,
      width: 2,
      transform: 'translateX(-50%)',
    },
    left: {
      top: '50%',
      right: -offset,
      width: offset,
      height: 2,
      transform: 'translateY(-50%)',
    },
    right: {
      top: '50%',
      left: -offset,
      width: offset,
      height: 2,
      transform: 'translateY(-50%)',
    },
  };

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        ...anchorStyles[resolvedPosition],
        maxWidth: 'min(340px, 50cqw)',
      }}
    >
      <div
        className={`relative flex flex-col ${bubbleAlignment} bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl leading-relaxed shadow-2xl border border-white/20 ring-1 ring-black/40 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none`}
        style={{
          padding: 'min(12px, 2.8cqmin) min(16px, 3.6cqmin)',
          fontSize: 'min(16px, 4cqmin)',
        }}
      >
        {offset > 2 && (
          <span
            aria-hidden="true"
            className="absolute bg-white/60"
            style={connectorStyleByPosition[resolvedPosition]}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-white shadow"
          style={{
            width: 6,
            height: 6,
            ...(resolvedPosition === 'above'
              ? { left: '50%', bottom: -offset - 3, marginLeft: -3 }
              : resolvedPosition === 'below'
                ? { left: '50%', top: -offset - 3, marginLeft: -3 }
                : resolvedPosition === 'left'
                  ? { top: '50%', right: -offset - 3, marginTop: -3 }
                  : { top: '50%', left: -offset - 3, marginTop: -3 }),
          }}
        />
        {step.label && (
          <div
            className="font-bold text-white mb-1 tracking-tight"
            style={{ fontSize: 'min(15px, 4.2cqmin)' }}
          >
            {step.label}
          </div>
        )}
        <div className="text-slate-100">{step.text}</div>
      </div>
    </div>
  );
};

import React from 'react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
  panZoomActive?: boolean;
}

/**
 * Spotlight interaction: dims the entire widget area except for a circular
 * cutout centred on the hotspot position. Uses an SVG mask approach so the
 * underlying image is visible inside the spotlight circle.
 */
export const SpotlightInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
  panZoomActive = false,
}) => {
  const cx = panZoomActive
    ? containerWidth / 2
    : (step.xPct / 100) * containerWidth;
  const cy = panZoomActive
    ? containerHeight / 2
    : (step.yPct / 100) * containerHeight;
  // Radius as % of the smaller container dimension
  const radiusPct = step.spotlightRadius ?? 25;
  const radius = (Math.min(containerWidth, containerHeight) * radiusPct) / 100;
  const maskId = `spotlight-mask-${step.id}`;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      width={containerWidth}
      height={containerHeight}
      style={{ top: 0, left: 0 }}
    >
      <defs>
        <mask id={maskId}>
          {/* White = visible, black = hidden  */}
          <rect width="100%" height="100%" fill="white" />
          <circle cx={cx} cy={cy} r={radius} fill="black" />
        </mask>
      </defs>
      {/* Dark overlay with hole cut out via mask */}
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.72)"
        mask={`url(#${maskId})`}
      />
      {/* Spotlight rim */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={2}
      />
      {/* Label below spotlight if present */}
      {step.label && (
        <text
          x={cx}
          y={cy + radius + Math.max(12, containerHeight * 0.04)}
          textAnchor="middle"
          fill="white"
          fontFamily="inherit"
          fontWeight="bold"
          style={{ fontSize: 'min(14px, 4cqmin)' }}
          opacity={0.9}
        >
          {step.label}
        </text>
      )}
    </svg>
  );
};

import React from 'react';
import { GuidedLearningPublicStep } from '@/types';
import type { EffectiveRegion } from '../../types/stage';
import { regionPath, regionRect } from '../../utils/regionGeometry';
import { renderStepText } from '../../utils/richText';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
  /** Drawn region in container px; absent = the radius circle. */
  region?: EffectiveRegion;
  /** Studio inline editor shown in place of the label. */
  editor?: React.ReactNode;
}

/**
 * Spotlight interaction: dims the entire widget area except for a cutout
 * (the drawn region, or a circle centred on the hotspot). Uses an SVG mask
 * so the underlying image is visible inside the cutout.
 */
export const SpotlightInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
  region,
  editor,
}) => {
  const cx = (step.xPct / 100) * containerWidth;
  const cy = (step.yPct / 100) * containerHeight;
  // Radius as % of the smaller container dimension
  const radiusPct = step.spotlightRadius ?? 25;
  const radius = (Math.min(containerWidth, containerHeight) * radiusPct) / 100;
  const maskId = `spotlight-mask-${step.id}`;
  const path = region ? regionPath(region) : null;
  const labelX = region ? region.cx : cx;
  const shapeBottom = region ? regionRect(region).y + region.h : cy + radius;

  return (
    <>
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
            {path ? (
              <path data-gl-spot={step.id} d={path} fill="black" />
            ) : (
              <circle
                data-gl-spot={step.id}
                cx={cx}
                cy={cy}
                r={radius}
                fill="black"
              />
            )}
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
        {path ? (
          <path
            data-testid="gl-spotlight-rim"
            data-gl-spot={step.id}
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
          />
        ) : (
          <circle
            data-testid="gl-spotlight-rim"
            data-gl-spot={step.id}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
          />
        )}
      </svg>
      {/* Label below the lit area, as HTML so it can carry bold and links */}
      {(!!step.label || !!editor) && (
        <div
          data-gl-callout={step.id}
          data-gl-overlay={step.id}
          className={`absolute z-20 pointer-events-none text-white font-bold text-center ${
            editor ? '' : 'whitespace-nowrap'
          }`}
          style={{
            left: labelX,
            top: shapeBottom + Math.max(12, containerHeight * 0.04),
            transform: 'translate(-50%, -80%)',
            fontSize: 'var(--gl-text-title, min(14px, 4cqmin))',
            opacity: 0.9,
          }}
        >
          {editor ?? renderStepText(step.label)}
        </div>
      )}
    </>
  );
};

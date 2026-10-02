import React from 'react';
import { SPARTY_GRID, SPARTY_PALETTE, type SpartyPose } from './spartyFrames';
import { SPARTY_RUNS, buildSpartyKeyframes } from './spartyRender';

const KEYFRAMES = buildSpartyKeyframes();

interface SpartyProps {
  pose?: SpartyPose;
  /** Rendered px; keep to multiples of 32 so pixels stay square. */
  size?: number;
  label?: string;
  /** Hide from screen readers when nearby text already says what Sparty does. */
  decorative?: boolean;
  className?: string;
}

export const Sparty: React.FC<SpartyProps> = ({
  pose = 'idle',
  size = 64,
  label = 'Sparty',
  decorative = false,
  className,
}) => (
  <>
    <style href="sparty-keyframes" precedence="default">
      {KEYFRAMES}
    </style>
    <svg
      viewBox={`0 0 ${SPARTY_GRID} ${SPARTY_GRID}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={['sparty', `sparty-${pose}`, className]
        .filter(Boolean)
        .join(' ')}
      data-pose={pose}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      {SPARTY_RUNS[pose].map((runs, i) => (
        <g
          key={i}
          className={`sparty-f${i}`}
          visibility={i === 0 ? undefined : 'hidden'}
        >
          {runs.map((r) => (
            <rect
              key={`${r.x}-${r.y}`}
              x={r.x}
              y={r.y}
              width={r.width}
              height={1}
              fill={SPARTY_PALETTE[r.color]}
            />
          ))}
        </g>
      ))}
    </svg>
  </>
);

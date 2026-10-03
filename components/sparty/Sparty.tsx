import React from 'react';
import { SPARTY_GRID, SPARTY_PALETTE, type SpartyPose } from './spartyFrames';
import {
  SPARTY_EDGE_RUNS,
  SPARTY_RUNS,
  buildSpartyKeyframes,
  firstFrame,
  type SpartyRun,
} from './spartyRender';

const KEYFRAMES = buildSpartyKeyframes();
const EDGE_FILL = 'rgba(234, 236, 245, 0.3)';

interface SpartyProps {
  pose?: SpartyPose;
  /** Rendered px; keep to multiples of 32 so pixels stay square. */
  size?: number;
  label?: string;
  /** Hide from screen readers when nearby text already says what Sparty does. */
  decorative?: boolean;
  /** Mirror him so the sword faces the other way. */
  flip?: boolean;
  /** Add a faint light outline so he reads on dark surfaces. */
  onDark?: boolean;
  className?: string;
}

const Runs: React.FC<{ runs: SpartyRun[] }> = ({ runs }) => (
  <>
    {runs.map((r) => (
      <rect
        key={`${r.x}-${r.y}`}
        x={r.x}
        y={r.y}
        width={r.width}
        height={1}
        fill={r.color === 'edge' ? EDGE_FILL : SPARTY_PALETTE[r.color]}
      />
    ))}
  </>
);

export const Sparty: React.FC<SpartyProps> = ({
  pose = 'idle',
  size = 64,
  label = 'Sparty',
  decorative = false,
  flip = false,
  onDark = false,
  className,
}) => {
  const shown = firstFrame(pose);
  return (
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
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
        data-pose={pose}
        {...(decorative
          ? { 'aria-hidden': true }
          : { role: 'img', 'aria-label': label })}
      >
        {SPARTY_RUNS[pose].map((runs, i) => (
          <g
            key={`${pose}-${i}`}
            className={`sparty-f${i}`}
            visibility={i === shown ? undefined : 'hidden'}
          >
            {onDark && <Runs runs={SPARTY_EDGE_RUNS[pose][i]} />}
            <Runs runs={runs} />
          </g>
        ))}
      </svg>
    </>
  );
};

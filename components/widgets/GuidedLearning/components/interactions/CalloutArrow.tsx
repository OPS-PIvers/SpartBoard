import React from 'react';
import type { Point } from '../../utils/calloutPlacement';

interface Props {
  from: Point;
  to: Point;
}

const HEAD = 7;

/** Connector from a callout's edge to its target, with a small head at the target. */
export const CalloutArrow: React.FC<Props> = ({ from, to }) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return null;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = to.x - ux * HEAD;
  const baseY = to.y - uy * HEAD;
  const head = `${to.x},${to.y} ${baseX - uy * (HEAD / 2)},${baseY + ux * (HEAD / 2)} ${baseX + uy * (HEAD / 2)},${baseY - ux * (HEAD / 2)}`;
  return (
    <svg
      aria-hidden="true"
      data-testid="gl-callout-arrow"
      className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={baseX}
        y2={baseY}
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <polygon points={head} fill="rgba(255,255,255,0.85)" />
    </svg>
  );
};

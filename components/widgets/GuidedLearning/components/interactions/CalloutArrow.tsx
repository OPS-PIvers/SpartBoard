import React from 'react';
import { leaderCurve, type Point } from '../../utils/calloutPlacement';

interface Props {
  from: Point;
  to: Point;
  /** Outward normal of the box edge the line leaves; absent = straight line. */
  normal?: Point;
  color?: string;
  halo?: string;
}

const HEAD = 7;

/** Curved connector from a callout's edge to its target, with a small head at the target. */
export const CalloutArrow: React.FC<Props> = ({
  from,
  to,
  normal,
  color = 'rgba(255,255,255,0.85)',
  halo = 'rgba(15,23,42,0.55)',
}) => {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 3) return null;
  const chordDir = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const { c1, c2, endTangent } = leaderCurve(from, normal ?? chordDir, to);
  const ux = endTangent.x;
  const uy = endTangent.y;
  // The line stops at the head's base so the round cap doesn't poke through the tip.
  const baseX = to.x - ux * HEAD;
  const baseY = to.y - uy * HEAD;
  const d = `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x - ux * HEAD} ${c2.y - uy * HEAD} ${baseX} ${baseY}`;
  const head = `${to.x},${to.y} ${baseX - uy * (HEAD / 2)},${baseY + ux * (HEAD / 2)} ${baseX + uy * (HEAD / 2)},${baseY - ux * (HEAD / 2)}`;
  return (
    <svg
      aria-hidden="true"
      data-testid="gl-callout-arrow"
      className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
    >
      <path
        d={d}
        fill="none"
        stroke={halo}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <polygon
        points={head}
        fill={halo}
        stroke={halo}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        data-testid="gl-callout-arrow-line"
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <polygon points={head} fill={color} />
    </svg>
  );
};

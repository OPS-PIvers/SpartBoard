import React from 'react';
import { leaderCurve, type Point } from '../../utils/calloutPlacement';

interface Props {
  from: Point;
  to: Point;
  /** Outward normal of the box edge the line leaves; absent = straight line. */
  normal?: Point;
  color?: string;
  halo?: string;
  /** Step id, so a Studio drag preview can find and rewrite this connector. */
  stepId?: string;
  /** Renders an empty, hidden connector that a Studio drag preview can fill in. */
  hidden?: boolean;
}

export interface CalloutArrowPaths {
  /** SVG path `d` for the line. */
  d: string;
  /** SVG polygon `points` for the head. */
  head: string;
}

const HEAD = 7;

/** Line path and head polygon for a connector; null when too short to draw. */
// eslint-disable-next-line react-refresh/only-export-components
export function calloutArrowPaths(
  from: Point,
  to: Point,
  normal?: Point
): CalloutArrowPaths | null {
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
  return { d, head };
}

/** Curved connector from a callout's edge to its target, with a small head at the target. */
export const CalloutArrow: React.FC<Props> = ({
  from,
  to,
  normal,
  color = 'rgba(255,255,255,0.85)',
  halo = 'rgba(15,23,42,0.55)',
  stepId,
  hidden = false,
}) => {
  const paths = hidden ? null : calloutArrowPaths(from, to, normal);
  if (!paths && !hidden) return null;
  const d = paths?.d ?? '';
  const head = paths?.head ?? '';
  return (
    <svg
      aria-hidden="true"
      data-testid={hidden ? undefined : 'gl-callout-arrow'}
      data-gl-connector={stepId}
      style={hidden ? { display: 'none' } : undefined}
      className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
    >
      <path
        data-gl-connector-line=""
        d={d}
        fill="none"
        stroke={halo}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <polygon
        data-gl-connector-head=""
        points={head}
        fill={halo}
        stroke={halo}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        data-testid="gl-callout-arrow-line"
        data-gl-connector-line=""
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <polygon data-gl-connector-head="" points={head} fill={color} />
    </svg>
  );
};

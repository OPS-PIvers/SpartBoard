import React from 'react';

interface TourSpotlightProps {
  rect: { x: number; y: number; width: number; height: number } | null;
  padding?: number;
  radius?: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Full-viewport dim with a rounded cutout; the cutout passes clicks through, the dim does not. */
export const TourSpotlight: React.FC<TourSpotlightProps> = ({
  rect,
  padding = 6,
  radius = 10,
}) => {
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight;
  let d = `M0,0 H${vw} V${vh} H0 Z`;
  if (rect) {
    const x = round(rect.x - padding);
    const y = round(rect.y - padding);
    const w = round(rect.width + padding * 2);
    const h = round(rect.height + padding * 2);
    const r = Math.min(radius, w / 2, h / 2);
    d += ` M${x + r},${y} H${x + w - r} A${r},${r} 0 0,1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0,1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0,1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0,1 ${x + r},${y} Z`;
  }
  return (
    <svg
      data-testid="tour-spotlight"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      width={vw}
      height={vh}
    >
      <path
        d={d}
        fillRule="evenodd"
        className="fill-slate-950/55 motion-safe:transition-[d] motion-safe:duration-300"
        style={{ pointerEvents: 'auto' }}
      />
      {rect && (
        <rect
          data-testid="tour-spotlight-ring"
          x={rect.x - padding}
          y={rect.y - padding}
          width={rect.width + padding * 2}
          height={rect.height + padding * 2}
          rx={radius}
          className="fill-none stroke-white"
          strokeWidth={2}
        />
      )}
    </svg>
  );
};

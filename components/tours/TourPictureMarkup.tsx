import React from 'react';
import type { TourMarkupShape } from '@/types';
import {
  MARKUP_BADGE,
  MARKUP_HEAD,
  MARKUP_STROKE,
  arrowHead,
} from './tourPictureMarkupGeometry';

export interface TourPictureMarkupProps {
  /** Shapes in 0-1 coordinates of the picture. */
  shapes: readonly TourMarkupShape[];
  /** The picture's pixel size; the layer keeps its proportions and scales with the box it fills. */
  width: number;
  height: number;
  className?: string;
}

/** Markup drawn over a step picture, read-only: fills its positioned parent, which has the picture's shape. */
export const TourPictureMarkup: React.FC<TourPictureMarkupProps> = ({
  shapes,
  width,
  height,
  className = '',
}) => {
  if (shapes.length === 0 || width <= 0 || height <= 0) return null;
  const unit = Math.max(width, height);
  const stroke = Math.max(2, unit * MARKUP_STROKE);
  const badge = unit * MARKUP_BADGE;
  return (
    <svg
      aria-hidden="true"
      data-testid="tour-picture-markup"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible ${className}`}
    >
      {shapes.map((s) => {
        if (s.kind === 'box')
          return (
            <rect
              key={s.id}
              x={s.x * width}
              y={s.y * height}
              width={s.w * width}
              height={s.h * height}
              rx={stroke * 2}
              className="fill-none stroke-brand-red-primary"
              strokeWidth={stroke}
            />
          );
        if (s.kind === 'arrow') {
          const [x1, y1, x2, y2] = [
            s.x1 * width,
            s.y1 * height,
            s.x2 * width,
            s.y2 * height,
          ];
          return (
            <g
              key={s.id}
              className="fill-brand-red-primary stroke-brand-red-primary"
            >
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
              <polygon
                points={arrowHead(x1, y1, x2, y2, unit * MARKUP_HEAD)}
                strokeWidth={stroke / 2}
                strokeLinejoin="round"
              />
            </g>
          );
        }
        return (
          <g key={s.id}>
            <circle
              cx={s.x * width}
              cy={s.y * height}
              r={badge}
              className="fill-brand-red-primary stroke-white"
              strokeWidth={stroke / 2}
            />
            <text
              x={s.x * width}
              y={s.y * height}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-white font-bold"
              fontSize={badge * 1.2}
            >
              {s.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

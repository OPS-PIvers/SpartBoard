import React from 'react';

interface ResultsWatermarkProps {
  /** Display name shown in the watermark. Sanitized via React text node interpolation. */
  studentName: string;
  /** ms timestamp of when the teacher published — formatted to locale string. */
  publishedAt: number;
}

/**
 * Repeating diagonal low-opacity SVG watermark overlaid on the published-quiz
 * results view. Rotates the pattern at -30deg and tiles it across the entire
 * viewport. Strictly decorative — `pointer-events-none` + `aria-hidden` so it
 * does not interfere with focus, screen readers, or interaction.
 *
 * Why SVG <pattern> over CSS-grid tiles: pattern with `patternTransform` rotates
 * the tile (not just each label), so the diagonal repeat is seamless across the
 * full page regardless of viewport size. CSS-grid would clip the rotation at
 * the container edges.
 */
export const ResultsWatermark: React.FC<ResultsWatermarkProps> = ({
  studentName,
  publishedAt,
}) => {
  const patternId = React.useId();
  const label = `${studentName} • ${new Date(publishedAt).toLocaleString()}`;
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full select-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width="360"
          height="120"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-30)"
        >
          <text
            x="0"
            y="60"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="14"
            fill="currentColor"
            opacity="0.12"
          >
            {label}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};

import React from 'react';
import type { PaperMarkupItem, PaperMarkupStamp } from '@/types';
import { onInk } from '@/utils/paperMarkupRender';
import type { DiscPlacement } from './markupDiscs';
import {
  PAPER_MARKUP_STYLE,
  PAPER_STAMP_GLYPHS,
  inkOf,
  markupColorOf,
  washOf,
} from './markupStyle';

const { stamp: STAMP, shape: SHAPE, highlight: HIGHLIGHT } = PAPER_MARKUP_STYLE;

/** A stamp glyph centred on `x`,`y`, `size` mm across, drawn as the print draws it. */
export const StampGlyph: React.FC<{
  symbol: PaperMarkupStamp;
  color: string;
  x: number;
  y: number;
  size?: number;
}> = ({ symbol, color, x, y, size = STAMP.sizeMm }) => {
  const glyph = PAPER_STAMP_GLYPHS[symbol];
  return (
    <path
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size})`}
      d={glyph.d}
      fill={glyph.solid ? color : 'none'}
      stroke={color}
      strokeWidth={STAMP.strokeMm / STAMP.sizeMm}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

/** A highlight, box, circle or stamp; numbers and pins are drawn by `MarkupDisc` on top. */
export const MarkupShape: React.FC<{ item: PaperMarkupItem }> = ({ item }) => {
  const color = markupColorOf(item);
  const ink = inkOf(color);
  switch (item.kind) {
    case 'highlight': {
      const r = item.rectMm;
      return (
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={washOf(color)}
          fillOpacity={HIGHLIGHT.opacity}
          style={{ mixBlendMode: HIGHLIGHT.blend }}
        />
      );
    }
    case 'rect': {
      const r = item.rectMm;
      return (
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="transparent"
          stroke={ink}
          strokeWidth={SHAPE.strokeMm}
          strokeLinejoin="round"
        />
      );
    }
    case 'ellipse': {
      const r = item.rectMm;
      return (
        <ellipse
          cx={r.x + r.w / 2}
          cy={r.y + r.h / 2}
          rx={r.w / 2}
          ry={r.h / 2}
          fill="transparent"
          stroke={ink}
          strokeWidth={SHAPE.strokeMm}
        />
      );
    }
    case 'stamp':
      return (
        <StampGlyph
          symbol={item.symbol}
          color={ink}
          x={item.atMm.x}
          y={item.atMm.y}
        />
      );
    case 'pin':
      return null;
  }
};

/** A dark disc with a white number and a white halo, as printed. */
export const MarkupDisc: React.FC<{ disc: DiscPlacement }> = ({ disc }) => {
  const r = disc.d / 2;
  const size = disc.label.length > 1 ? disc.d * 0.6 : disc.d * 0.68;
  return (
    <>
      <circle cx={disc.x} cy={disc.y} r={r + disc.halo / 2} fill="#fff" />
      <circle cx={disc.x} cy={disc.y} r={r} fill={disc.ink} />
      {disc.label && (
        <text
          x={disc.x}
          y={disc.y}
          dy="0.35em"
          textAnchor="middle"
          fontSize={size}
          fill={onInk(disc.ink)}
          fontFamily="Arial,Helvetica,sans-serif"
          fontWeight={700}
        >
          {disc.label}
        </text>
      )}
    </>
  );
};

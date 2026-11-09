import React from 'react';
import type { PaperMarkupItem, PaperMarkupStamp } from '@/types';
import {
  COMMENT_BADGE_DIAMETER_MM,
  COMMENT_BADGE_FONT_MM,
  HIGHLIGHT_OPACITY,
  MARKUP_HIGHLIGHT_HEX,
  MARKUP_INK_HEX,
  PIN_DIAMETER_MM,
  PIN_FONT_MM,
  PIN_OUTLINE_MM,
  SHAPE_STROKE_MM,
  STAMP_GLYPHS,
  STAMP_STROKE_MM,
  markupColorOf,
} from './markupStyle';

export const StampGlyph: React.FC<{
  symbol: PaperMarkupStamp;
  color: string;
  x: number;
  y: number;
  /** 1 draws the glyph at its sheet size. */
  scale?: number;
}> = ({ symbol, color, x, y, scale = 1 }) => {
  const glyph = STAMP_GLYPHS[symbol];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d={glyph.d}
        fill="none"
        stroke={color}
        strokeWidth={STAMP_STROKE_MM}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {glyph.dot && (
        <circle
          cx={glyph.dot.cx}
          cy={glyph.dot.cy}
          r={glyph.dot.r}
          fill={color}
        />
      )}
    </g>
  );
};

const Badge: React.FC<{
  x: number;
  y: number;
  diameter: number;
  font: number;
  color: string;
  number?: number;
}> = ({ x, y, diameter, font, color, number }) => (
  <g>
    <circle
      cx={x}
      cy={y}
      r={diameter / 2}
      fill={color}
      stroke="white"
      strokeWidth={PIN_OUTLINE_MM}
    />
    {number !== undefined && (
      <text
        x={x}
        y={y}
        fill="white"
        fontSize={font}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontFamily: 'Lexend, system-ui, sans-serif' }}
      >
        {number}
      </text>
    )}
  </g>
);

/** One saved mark drawn in sheet millimetres; `number` is its comment number. */
export const MarkupShape: React.FC<{
  item: PaperMarkupItem;
  number?: number;
}> = ({ item, number }) => {
  const color = markupColorOf(item);
  const ink = MARKUP_INK_HEX[color];
  switch (item.kind) {
    case 'highlight': {
      const r = item.rectMm;
      return (
        <>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={MARKUP_HIGHLIGHT_HEX[color]}
            fillOpacity={HIGHLIGHT_OPACITY}
            style={{ mixBlendMode: 'multiply' }}
          />
          {number !== undefined && (
            <Badge
              x={r.x + r.w}
              y={r.y}
              diameter={COMMENT_BADGE_DIAMETER_MM}
              font={COMMENT_BADGE_FONT_MM}
              color={ink}
              number={number}
            />
          )}
        </>
      );
    }
    case 'rect':
    case 'ellipse': {
      const r = item.rectMm;
      return (
        <>
          {item.kind === 'rect' ? (
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="transparent"
              stroke={ink}
              strokeWidth={SHAPE_STROKE_MM}
            />
          ) : (
            <ellipse
              cx={r.x + r.w / 2}
              cy={r.y + r.h / 2}
              rx={r.w / 2}
              ry={r.h / 2}
              fill="transparent"
              stroke={ink}
              strokeWidth={SHAPE_STROKE_MM}
            />
          )}
          {number !== undefined && (
            <Badge
              x={r.x + r.w}
              y={r.y}
              diameter={COMMENT_BADGE_DIAMETER_MM}
              font={COMMENT_BADGE_FONT_MM}
              color={ink}
              number={number}
            />
          )}
        </>
      );
    }
    case 'stamp':
      return (
        <>
          <StampGlyph
            symbol={item.symbol}
            color={ink}
            x={item.atMm.x}
            y={item.atMm.y}
          />
          {number !== undefined && (
            <Badge
              x={item.atMm.x + 3}
              y={item.atMm.y - 3}
              diameter={COMMENT_BADGE_DIAMETER_MM}
              font={COMMENT_BADGE_FONT_MM}
              color={ink}
              number={number}
            />
          )}
        </>
      );
    case 'pin':
      return (
        <Badge
          x={item.atMm.x}
          y={item.atMm.y}
          diameter={PIN_DIAMETER_MM}
          font={PIN_FONT_MM}
          color={ink}
          number={number}
        />
      );
  }
};

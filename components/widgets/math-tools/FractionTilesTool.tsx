import React, { useState } from 'react';
import { FRACTION_COLORS } from './mathToolUtils';

const BAR_H = 30;
const BAR_W = 400;
const GAP = 4;

function getColor(denom: number): string {
  return FRACTION_COLORS[denom] ?? '#64748b';
}

const DENOMINATORS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

export const FractionTilesTool: React.FC = () => {
  const [selected, setSelected] = useState<Set<number>>(new Set([1, 2, 3, 4]));

  const rows = DENOMINATORS.filter((d) => selected.has(d));
  const svgH = rows.length * (BAR_H + GAP) + 16;

  const toggleDenom = (d: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Denominator toggles */}
      <div className="flex flex-wrap gap-1">
        {DENOMINATORS.map((d) => (
          <button
            key={d}
            onClick={() => toggleDenom(d)}
            className={`px-2 py-0.5 rounded-full text-xxs font-black border transition-all ${
              selected.has(d)
                ? 'text-white border-transparent'
                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            }`}
            style={
              selected.has(d)
                ? { backgroundColor: getColor(d), borderColor: getColor(d) }
                : {}
            }
          >
            1/{d}
          </button>
        ))}
      </div>

      {/* Tile SVG */}
      <div className="overflow-x-auto">
        <svg
          width={BAR_W + 60}
          height={svgH}
          viewBox={`0 0 ${BAR_W + 60} ${svgH}`}
          style={{ display: 'block' }}
          role="img"
          aria-label="Fraction tiles"
        >
          {rows.map((denom, rowIdx) => {
            const y = 8 + rowIdx * (BAR_H + GAP);
            const color = getColor(denom);
            const tileW = BAR_W / denom;

            return (
              <g key={denom}>
                {/* Label */}
                <text
                  x={BAR_W + 8}
                  y={y + BAR_H / 2 + 5}
                  fontSize={11}
                  fill={color}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  1/{denom}
                </text>
                {/* Tiles */}
                {Array.from({ length: denom }).map((_, i) => (
                  <g key={i}>
                    <rect
                      x={i * tileW + 0.5}
                      y={y}
                      width={tileW - 1}
                      height={BAR_H}
                      rx={3}
                      fill={color}
                      opacity={0.85}
                    />
                    {/* Highlight */}
                    <rect
                      x={i * tileW + 2}
                      y={y + 2}
                      width={tileW - 5}
                      height={6}
                      rx={2}
                      fill="rgba(255,255,255,0.25)"
                    />
                    {/* Fraction text if wide enough */}
                    {tileW > 28 && (
                      <text
                        x={i * tileW + tileW / 2}
                        y={y + BAR_H / 2 + 5}
                        textAnchor="middle"
                        fontSize={Math.min(12, tileW * 0.3)}
                        fill="white"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {denom === 1 ? '1' : `1/${denom}`}
                      </text>
                    )}
                  </g>
                ))}
                {/* Whole bar outline */}
                <rect
                  x={0}
                  y={y}
                  width={BAR_W}
                  height={BAR_H}
                  rx={3}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={0.4}
                />
              </g>
            );
          })}
          {rows.length === 0 && (
            <text
              x={(BAR_W + 60) / 2}
              y={svgH / 2}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={13}
            >
              Select fractions above
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};

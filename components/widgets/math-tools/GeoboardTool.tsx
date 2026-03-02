import React, { useState, useCallback } from 'react';

const COLS = 5;
const ROWS = 5;
const PEG_GAP = 52;
const PAD = 32;
const PEG_R = 5;

const BAND_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
];

interface Peg {
  row: number;
  col: number;
}

interface Band {
  id: string;
  pegs: Peg[];
  color: string;
}

function pegX(col: number) {
  return PAD + col * PEG_GAP;
}
function pegY(row: number) {
  return PAD + row * PEG_GAP;
}

function pegsEqual(a: Peg, b: Peg) {
  return a.row === b.row && a.col === b.col;
}

function polygonArea(pegs: Peg[]): number {
  if (pegs.length < 3) return 0;
  let area = 0;
  const n = pegs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pegX(pegs[i].col) * pegY(pegs[j].row);
    area -= pegX(pegs[j].col) * pegY(pegs[i].row);
  }
  return Math.abs(area / 2) / (PEG_GAP * PEG_GAP);
}

export const GeoboardTool: React.FC = () => {
  const [bands, setBands] = useState<Band[]>([]);
  const [activePegs, setActivePegs] = useState<Peg[]>([]);
  const [colorIdx, setColorIdx] = useState(0);

  const svgW = PAD * 2 + (COLS - 1) * PEG_GAP;
  const svgH = PAD * 2 + (ROWS - 1) * PEG_GAP;

  const handlePegClick = useCallback(
    (row: number, col: number) => {
      const peg = { row, col };
      // Check if closing the polygon (clicked first peg again)
      if (activePegs.length >= 2 && pegsEqual(peg, activePegs[0])) {
        // Close polygon
        const newBand: Band = {
          id: Math.random().toString(36).slice(2),
          pegs: activePegs,
          color: BAND_COLORS[colorIdx % BAND_COLORS.length],
        };
        setBands((prev) => [...prev, newBand]);
        setActivePegs([]);
        setColorIdx((c) => c + 1);
        return;
      }
      // Check if peg already in active selection
      if (activePegs.some((p) => pegsEqual(p, peg))) return;
      setActivePegs((prev) => [...prev, peg]);
    },
    [activePegs, colorIdx]
  );

  const clearAll = () => {
    setBands([]);
    setActivePegs([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xxs text-slate-400">
          Click pegs to stretch a band. Click the first peg again to close.
        </p>
        <button
          onClick={clearAll}
          className="text-xxs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="flex justify-center">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ background: '#1e293b', borderRadius: 12 }}
          role="img"
          aria-label="Geoboard"
        >
          {/* Grid lines */}
          {Array.from({ length: ROWS }).map((_, row) =>
            Array.from({ length: COLS - 1 }).map((_, col) => (
              <line
                key={`h-${row}-${col}`}
                x1={pegX(col)}
                y1={pegY(row)}
                x2={pegX(col + 1)}
                y2={pegY(row)}
                stroke="#334155"
                strokeWidth={0.8}
              />
            ))
          )}
          {Array.from({ length: COLS }).map((_, col) =>
            Array.from({ length: ROWS - 1 }).map((_, row) => (
              <line
                key={`v-${col}-${row}`}
                x1={pegX(col)}
                y1={pegY(row)}
                x2={pegX(col)}
                y2={pegY(row + 1)}
                stroke="#334155"
                strokeWidth={0.8}
              />
            ))
          )}

          {/* Completed bands */}
          {bands.map((band) => (
            <g key={band.id}>
              <polygon
                points={band.pegs
                  .map((p) => `${pegX(p.col)},${pegY(p.row)}`)
                  .join(' ')}
                fill={band.color + '33'}
                stroke={band.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {/* Area label */}
              {band.pegs.length >= 3 && (
                <text
                  x={
                    band.pegs.reduce((s, p) => s + pegX(p.col), 0) /
                    band.pegs.length
                  }
                  y={
                    band.pegs.reduce((s, p) => s + pegY(p.row), 0) /
                    band.pegs.length
                  }
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill={band.color}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {polygonArea(band.pegs).toFixed(1)} u²
                </text>
              )}
            </g>
          ))}

          {/* Active rubber band */}
          {activePegs.length >= 2 && (
            <polyline
              points={activePegs
                .map((p) => `${pegX(p.col)},${pegY(p.row)}`)
                .join(' ')}
              fill="none"
              stroke={BAND_COLORS[colorIdx % BAND_COLORS.length]}
              strokeWidth={2.5}
              strokeDasharray="5,3"
              strokeLinejoin="round"
            />
          )}

          {/* Pegs */}
          {Array.from({ length: ROWS }).map((_, row) =>
            Array.from({ length: COLS }).map((_, col) => {
              const isActive = activePegs.some((p) =>
                pegsEqual(p, { row, col })
              );
              const isFirst =
                activePegs.length > 0 && pegsEqual(activePegs[0], { row, col });
              return (
                <circle
                  key={`p-${row}-${col}`}
                  cx={pegX(col)}
                  cy={pegY(row)}
                  r={isActive ? PEG_R + 3 : PEG_R}
                  fill={
                    isActive
                      ? BAND_COLORS[colorIdx % BAND_COLORS.length]
                      : '#94a3b8'
                  }
                  stroke={isFirst ? 'white' : 'transparent'}
                  strokeWidth={2}
                  style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                  onClick={() => handlePegClick(row, col)}
                  role="button"
                  aria-label={`Peg row ${row + 1} col ${col + 1}`}
                />
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
};

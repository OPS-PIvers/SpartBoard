import React, { useState, useRef, useCallback } from 'react';

interface PlottedPoint {
  id: string;
  x: number;
  y: number;
  label: string;
}

const GRID_SIZE = 10; // grid units each direction from origin
const CANVAS_PX = 360;
const PAD = 32;
const STEP = (CANVAS_PX - PAD * 2) / (GRID_SIZE * 2);

function unitToSvg(val: number, axis: 'x' | 'y'): number {
  if (axis === 'x') return PAD + (val + GRID_SIZE) * STEP;
  return PAD + (GRID_SIZE - val) * STEP;
}

function svgToUnit(px: number, axis: 'x' | 'y'): number {
  if (axis === 'x') return Math.round((px - PAD) / STEP - GRID_SIZE);
  return Math.round(GRID_SIZE - (px - PAD) / STEP);
}

function makeId() {
  return Math.random().toString(36).slice(2, 7);
}

const POINT_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
];

export const CoordinatePlaneTool: React.FC = () => {
  const [points, setPoints] = useState<PlottedPoint[]>([]);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const colorIdx = useRef(0);

  const getSvgCoords = useCallback(
    (e: React.MouseEvent): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = getSvgCoords(e);
      if (!coords) return;
      const ux = svgToUnit(coords.x, 'x');
      const uy = svgToUnit(coords.y, 'y');
      if (Math.abs(ux) <= GRID_SIZE && Math.abs(uy) <= GRID_SIZE) {
        setHoverPos({ x: ux, y: uy });
      } else {
        setHoverPos(null);
      }
    },
    [getSvgCoords]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const coords = getSvgCoords(e);
      if (!coords) return;
      const ux = svgToUnit(coords.x, 'x');
      const uy = svgToUnit(coords.y, 'y');
      if (Math.abs(ux) > GRID_SIZE || Math.abs(uy) > GRID_SIZE) return;
      // Don't add duplicate at exact position
      if (points.some((p) => p.x === ux && p.y === uy)) return;
      const id = makeId();
      const label = String.fromCharCode(65 + (points.length % 26));
      setPoints((prev) => [...prev, { id, x: ux, y: uy, label }]);
      colorIdx.current = (colorIdx.current + 1) % POINT_COLORS.length;
    },
    [getSvgCoords, points]
  );

  const removePoint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPoints((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAll = () => {
    setPoints([]);
    colorIdx.current = 0;
  };

  const svgW = CANVAS_PX;
  const svgH = CANVAS_PX;

  const gridLines: React.ReactNode[] = [];
  for (let g = -GRID_SIZE; g <= GRID_SIZE; g++) {
    const isMajor = g % 5 === 0;
    const x = unitToSvg(g, 'x');
    const y = unitToSvg(g, 'y');
    gridLines.push(
      <line
        key={`v${g}`}
        x1={x}
        y1={PAD}
        x2={x}
        y2={svgH - PAD}
        stroke={isMajor ? '#cbd5e1' : '#f1f5f9'}
        strokeWidth={isMajor ? 1 : 0.6}
      />,
      <line
        key={`h${g}`}
        x1={PAD}
        y1={y}
        x2={svgW - PAD}
        y2={y}
        stroke={isMajor ? '#cbd5e1' : '#f1f5f9'}
        strokeWidth={isMajor ? 1 : 0.6}
      />
    );
    if (isMajor && g !== 0) {
      gridLines.push(
        <text
          key={`xl${g}`}
          x={x}
          y={unitToSvg(0, 'y') + 14}
          textAnchor="middle"
          fontSize={9}
          fill="#94a3b8"
          fontFamily="monospace"
        >
          {g}
        </text>,
        <text
          key={`yl${g}`}
          x={unitToSvg(0, 'x') - 10}
          y={y + 4}
          textAnchor="end"
          fontSize={9}
          fill="#94a3b8"
          fontFamily="monospace"
        >
          {g}
        </text>
      );
    }
  }

  const originX = unitToSvg(0, 'x');
  const originY = unitToSvg(0, 'y');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xxs text-slate-400">
          Click the grid to plot points. Click a point to remove it.
        </span>
        {points.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xxs bg-slate-100 hover:bg-slate-200 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{
            display: 'block',
            cursor: 'crosshair',
            background: 'white',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPos(null)}
          role="img"
          aria-label="Coordinate plane"
        >
          {gridLines}
          {/* Axes */}
          <defs>
            <marker
              id="axArrow"
              markerWidth="6"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="#475569" />
            </marker>
          </defs>
          {/* X axis */}
          <line
            x1={PAD - 4}
            y1={originY}
            x2={svgW - PAD + 4}
            y2={originY}
            stroke="#475569"
            strokeWidth={1.5}
            markerEnd="url(#axArrow)"
          />
          {/* Y axis */}
          <line
            x1={originX}
            y1={svgH - PAD + 4}
            x2={originX}
            y2={PAD - 4}
            stroke="#475569"
            strokeWidth={1.5}
            markerEnd="url(#axArrow)"
          />
          {/* Axis labels */}
          <text
            x={svgW - PAD + 6}
            y={originY + 4}
            fontSize={11}
            fill="#475569"
            fontFamily="monospace"
            fontWeight="bold"
          >
            x
          </text>
          <text
            x={originX + 4}
            y={PAD - 6}
            fontSize={11}
            fill="#475569"
            fontFamily="monospace"
            fontWeight="bold"
          >
            y
          </text>
          {/* Origin */}
          <text
            x={originX - 10}
            y={originY + 14}
            fontSize={9}
            fill="#94a3b8"
            fontFamily="monospace"
          >
            O
          </text>

          {/* Hover indicator */}
          {hoverPos && (
            <circle
              cx={unitToSvg(hoverPos.x, 'x')}
              cy={unitToSvg(hoverPos.y, 'y')}
              r={7}
              fill="rgba(99,102,241,0.25)"
              stroke="#6366f1"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}

          {/* Plotted points */}
          {points.map((pt, idx) => {
            const color = POINT_COLORS[idx % POINT_COLORS.length];
            const px = unitToSvg(pt.x, 'x');
            const py = unitToSvg(pt.y, 'y');
            return (
              <g
                key={pt.id}
                onClick={(e) => removePoint(pt.id, e)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={`Point ${pt.label} (${pt.x}, ${pt.y})`}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={6}
                  fill={color}
                  stroke="white"
                  strokeWidth={1.5}
                />
                <text
                  x={px + 8}
                  y={py - 6}
                  fontSize={10}
                  fill={color}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {pt.label}({pt.x},{pt.y})
                </text>
              </g>
            );
          })}
        </svg>

        {/* Point list */}
        {points.length > 0 && (
          <div className="flex flex-col gap-1 text-xxs font-mono min-w-fit">
            {points.map((pt, idx) => (
              <div
                key={pt.id}
                className="flex items-center gap-1"
                style={{ color: POINT_COLORS[idx % POINT_COLORS.length] }}
              >
                <span className="font-bold">{pt.label}</span>
                <span className="text-slate-500">
                  ({pt.x}, {pt.y})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {hoverPos && (
        <p className="text-xxs text-slate-400 text-center">
          ({hoverPos.x}, {hoverPos.y})
        </p>
      )}
    </div>
  );
};

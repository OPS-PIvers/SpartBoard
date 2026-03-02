import React from 'react';
import { MathToolType } from '@/types';

// ---------------------------------------------------------------------------
// Fraction tile colours — must match FractionTilesTool.tsx
// ---------------------------------------------------------------------------
const FRACTION_COLORS: Record<number, string> = {
  1: '#6366f1',
  2: '#f43f5e',
  3: '#f59e0b',
  4: '#10b981',
  5: '#3b82f6',
  6: '#8b5cf6',
  8: '#ec4899',
  10: '#14b8a6',
  12: '#f97316',
};

// ---------------------------------------------------------------------------
// Pattern block colours — must match PatternBlocksTool.tsx
// ---------------------------------------------------------------------------
const PATTERN_BLOCK_COLORS: Record<string, string> = {
  hexagon: '#f59e0b',
  trapezoid: '#ef4444',
  triangle: '#10b981',
  'rhombus-wide': '#3b82f6',
  'rhombus-narrow': '#8b5cf6',
  square: '#f97316',
};

// ---------------------------------------------------------------------------
// Pattern block shape geometry (centred at origin, UNIT = 40)
// ---------------------------------------------------------------------------
const PB_UNIT = 40;

function patternBlockPoints(pieceId: string): string {
  const u = PB_UNIT;
  switch (pieceId) {
    case 'hexagon': {
      const r = u * 1.15;
      return Array.from({ length: 6 })
        .map((_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
        })
        .join(' ');
    }
    case 'trapezoid':
      return `${-u},${u * 0.5} ${u},${u * 0.5} ${u * 0.5},${-u * 0.5} ${-u * 0.5},${-u * 0.5}`;
    case 'triangle':
      return `0,${-u} ${-u * 0.87},${u * 0.5} ${u * 0.87},${u * 0.5}`;
    case 'rhombus-wide':
      return `0,${-u * 0.6} ${u},0 0,${u * 0.6} ${-u},0`;
    case 'rhombus-narrow':
      return `0,${-u * 0.8} ${u * 0.5},0 0,${u * 0.8} ${-u * 0.5},0`;
    case 'square':
      return `${-u * 0.65},${-u * 0.65} ${u * 0.65},${-u * 0.65} ${u * 0.65},${u * 0.65} ${-u * 0.65},${u * 0.65}`;
    default:
      return `${-u},${-u} ${u},${-u} ${u},${u} ${-u},${u}`;
  }
}

// ---------------------------------------------------------------------------
// Base-10 Block SVGs
// ---------------------------------------------------------------------------

function Base10UnitSVG() {
  return (
    <svg
      viewBox="0 0 50 50"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x="2"
        y="2"
        width="46"
        height="46"
        fill="#3b82f6"
        rx="4"
        stroke="white"
        strokeWidth="2"
      />
      <rect
        x="3"
        y="3"
        width="44"
        height="14"
        fill="rgba(255,255,255,0.18)"
        rx="3"
      />
      <text
        x="25"
        y="34"
        textAnchor="middle"
        fill="white"
        fontSize="20"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        1
      </text>
    </svg>
  );
}

function Base10RodSVG() {
  const N = 10;
  const CW = 20;
  const CH = 14;
  const PAD = 1;
  const totalH = N * CH + PAD * 2;
  return (
    <svg
      viewBox={`0 0 ${CW + PAD * 2} ${totalH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      {Array.from({ length: N }).map((_, i) => (
        <rect
          key={i}
          x={PAD}
          y={PAD + i * CH}
          width={CW}
          height={CH - 1}
          fill="#3b82f6"
          rx="1.5"
          stroke="white"
          strokeWidth="0.8"
        />
      ))}
      <text
        x={(CW + PAD * 2) / 2}
        y={totalH - 2}
        textAnchor="middle"
        fill="#1d4ed8"
        fontSize="6"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        10
      </text>
    </svg>
  );
}

function Base10FlatSVG() {
  const N = 10;
  const CELL = 10;
  const PAD = 1;
  const size = N * CELL + PAD * 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      {Array.from({ length: N }).flatMap((_, row) =>
        Array.from({ length: N }).map((_, col) => (
          <rect
            key={`${row}-${col}`}
            x={PAD + col * CELL}
            y={PAD + row * CELL}
            width={CELL - 1}
            height={CELL - 1}
            fill="#3b82f6"
            rx="0.8"
            stroke="white"
            strokeWidth="0.5"
          />
        ))
      )}
    </svg>
  );
}

function Base10CubeSVG() {
  // Simple isometric 3D cube
  return (
    <svg
      viewBox="0 0 90 96"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Left face */}
      <polygon
        points="8,52 45,32 45,88 8,86"
        fill="#1d4ed8"
        stroke="white"
        strokeWidth="1.2"
      />
      {/* Right face */}
      <polygon
        points="45,32 82,52 82,86 45,88"
        fill="#3b82f6"
        stroke="white"
        strokeWidth="1.2"
      />
      {/* Top face */}
      <polygon
        points="8,52 45,32 82,52 45,70"
        fill="#93c5fd"
        stroke="white"
        strokeWidth="1.2"
      />
      {/* Label */}
      <text
        x="45"
        y="70"
        textAnchor="middle"
        fill="#1e3a8a"
        fontSize="9"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        1000
      </text>
    </svg>
  );
}

function Base10PieceSVG({ pieceId }: { pieceId: string }) {
  switch (pieceId) {
    case 'unit':
      return <Base10UnitSVG />;
    case 'rod':
      return <Base10RodSVG />;
    case 'flat':
      return <Base10FlatSVG />;
    case 'cube':
      return <Base10CubeSVG />;
    default:
      return <Base10UnitSVG />;
  }
}

// ---------------------------------------------------------------------------
// Fraction Bar SVG
// ---------------------------------------------------------------------------

function FractionBarSVG({ pieceId }: { pieceId: string }) {
  const [, denomStr] = pieceId.split('-');
  const denom = Number(denomStr) || 1;
  const color = FRACTION_COLORS[denom] ?? '#64748b';
  const label = denom === 1 ? '1' : `1/${denom}`;

  return (
    <svg
      viewBox="0 0 100 26"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="25"
        fill={color}
        rx="3"
        stroke="white"
        strokeWidth="1"
      />
      {/* Highlight strip */}
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="8"
        fill="rgba(255,255,255,0.2)"
        rx="2"
      />
      <text
        x="50"
        y="18"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {label}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pattern Block SVG
// ---------------------------------------------------------------------------

function PatternBlockSVG({ pieceId }: { pieceId: string }) {
  const color = PATTERN_BLOCK_COLORS[pieceId] ?? '#64748b';
  const points = patternBlockPoints(pieceId);
  const VB = PB_UNIT * 1.35;

  return (
    <svg
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon
        points={points}
        fill={color}
        stroke="white"
        strokeWidth="2.5"
        opacity={0.92}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Algebra Tile SVG
// ---------------------------------------------------------------------------

function AlgebraTileSVG({ pieceId }: { pieceId: string }) {
  const isNeg = pieceId.endsWith('-neg');
  const tileType = pieceId.replace('-pos', '').replace('-neg', '');

  const posColor = '#0ea5e9'; // sky-500
  const negColor = '#ef4444'; // red-500
  const posUnitColor = '#f59e0b'; // amber-500
  const negUnitColor = '#fca5a5'; // red-300 (light, with red border)

  switch (tileType) {
    case 'x2': {
      const color = isNeg ? negColor : posColor;
      const label = isNeg ? '−x²' : 'x²';
      return (
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <rect
            x="2"
            y="2"
            width="96"
            height="96"
            fill={color}
            rx="5"
            stroke="white"
            strokeWidth="2"
          />
          <rect
            x="3"
            y="3"
            width="94"
            height="22"
            fill="rgba(255,255,255,0.18)"
            rx="4"
          />
          <text
            x="50"
            y="64"
            textAnchor="middle"
            fill="white"
            fontSize="26"
            fontWeight="bold"
            fontFamily="Georgia, serif"
            fontStyle="italic"
          >
            {label}
          </text>
        </svg>
      );
    }
    case 'x': {
      const color = isNeg ? negColor : posColor;
      const label = isNeg ? '−x' : 'x';
      return (
        <svg viewBox="0 0 100 28" width="100%" height="100%">
          <rect
            x="1"
            y="1"
            width="98"
            height="26"
            fill={color}
            rx="4"
            stroke="white"
            strokeWidth="1.5"
          />
          <rect
            x="2"
            y="2"
            width="96"
            height="8"
            fill="rgba(255,255,255,0.18)"
            rx="3"
          />
          <text
            x="50"
            y="19"
            textAnchor="middle"
            fill="white"
            fontSize="13"
            fontWeight="bold"
            fontFamily="Georgia, serif"
            fontStyle="italic"
          >
            {label}
          </text>
        </svg>
      );
    }
    case 'one': {
      const fill = isNeg ? negUnitColor : posUnitColor;
      const textColor = isNeg ? '#991b1b' : '#78350f';
      const stroke = isNeg ? negColor : '#d97706';
      const label = isNeg ? '−1' : '1';
      return (
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            fill={fill}
            rx="4"
            stroke={stroke}
            strokeWidth="2"
          />
          <text
            x="20"
            y="27"
            textAnchor="middle"
            fill={textColor}
            fontSize="16"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {label}
          </text>
        </svg>
      );
    }
    default:
      return (
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <rect x="2" y="2" width="36" height="36" fill="#e2e8f0" rx="4" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Public export — routes to the correct SVG by toolType + pieceId
// ---------------------------------------------------------------------------

export const StickerPieceSVG: React.FC<{
  toolType: MathToolType;
  pieceId: string;
}> = ({ toolType, pieceId }) => {
  switch (toolType) {
    case 'base-10':
      return <Base10PieceSVG pieceId={pieceId} />;
    case 'fraction-tiles':
      return <FractionBarSVG pieceId={pieceId} />;
    case 'pattern-blocks':
      return <PatternBlockSVG pieceId={pieceId} />;
    case 'algebra-tiles':
      return <AlgebraTileSVG pieceId={pieceId} />;
    default:
      return (
        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
          ?
        </div>
      );
  }
};

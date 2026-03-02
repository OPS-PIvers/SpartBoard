import React from 'react';
import { MathToolType } from '@/types';
import {
  AlgebraTileKind,
  ALGEBRA_TILE_META,
  FRACTION_COLORS,
  PATTERN_BLOCK_COLORS,
  getPatternBlockPoints,
} from './mathToolUtils';

// Unit size used for sticker-size pattern block SVGs
const PB_STICKER_UNIT = 40;

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
// Pattern Block SVG — uses shared getPatternBlockPoints from mathToolUtils
// ---------------------------------------------------------------------------

function PatternBlockSVG({ pieceId }: { pieceId: string }) {
  const color = PATTERN_BLOCK_COLORS[pieceId] ?? '#64748b';
  const points = getPatternBlockPoints(pieceId, PB_STICKER_UNIT);
  const VB = PB_STICKER_UNIT * 1.35;

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
// Algebra Tile SVG — colours sourced from ALGEBRA_TILE_META (single source of truth)
// ---------------------------------------------------------------------------

function AlgebraTileSVG({ pieceId }: { pieceId: string }) {
  const kind = pieceId as AlgebraTileKind;
  const meta = ALGEBRA_TILE_META[kind];

  // Fallback for unrecognised pieceId
  if (!meta) {
    return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <rect x="2" y="2" width="36" height="36" fill="#e2e8f0" rx="4" />
      </svg>
    );
  }

  // Determine viewBox aspect ratio from tile proportions
  // x² tiles are square; x tiles are wide rectangles; unit tiles are small squares
  const tileType = kind.replace('-pos', '').replace('-neg', '');

  switch (tileType) {
    case 'x2': {
      return (
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <rect
            x="2"
            y="2"
            width="96"
            height="96"
            fill={meta.fill}
            rx="5"
            stroke={meta.stroke}
            strokeWidth="2"
          />
          <rect
            x="3"
            y="3"
            width="94"
            height="22"
            fill="rgba(255,255,255,0.25)"
            rx="4"
          />
          <text
            x="50"
            y="64"
            textAnchor="middle"
            fill={meta.textColor}
            fontSize="26"
            fontWeight="bold"
            fontFamily="Georgia, serif"
            fontStyle="italic"
          >
            {meta.label}
          </text>
        </svg>
      );
    }
    case 'x': {
      return (
        <svg viewBox="0 0 100 28" width="100%" height="100%">
          <rect
            x="1"
            y="1"
            width="98"
            height="26"
            fill={meta.fill}
            rx="4"
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
          <rect
            x="2"
            y="2"
            width="96"
            height="8"
            fill="rgba(255,255,255,0.25)"
            rx="3"
          />
          <text
            x="50"
            y="19"
            textAnchor="middle"
            fill={meta.textColor}
            fontSize="13"
            fontWeight="bold"
            fontFamily="Georgia, serif"
            fontStyle="italic"
          >
            {meta.label}
          </text>
        </svg>
      );
    }
    case 'unit': {
      return (
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            fill={meta.fill}
            rx="4"
            stroke={meta.stroke}
            strokeWidth="2"
          />
          <text
            x="20"
            y="27"
            textAnchor="middle"
            fill={meta.textColor}
            fontSize="16"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {meta.label}
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

import React, { useState } from 'react';
import {
  AlgebraTileKind,
  AlgebraTileStyle,
  ALGEBRA_TILE_META,
} from './mathToolUtils';

interface Tile {
  id: string;
  kind: AlgebraTileKind;
}

const PALETTE_KINDS = Object.keys(ALGEBRA_TILE_META) as AlgebraTileKind[];

function getTileValue(kind: Tile['kind']): string {
  const signs: Record<Tile['kind'], number> = {
    'x2-pos': 1,
    'x2-neg': -1,
    'x-pos': 1,
    'x-neg': -1,
    'unit-pos': 1,
    'unit-neg': -1,
  };
  return signs[kind] > 0 ? '+' : '−';
}

export const AlgebraTilesTool: React.FC = () => {
  const [tiles, setTiles] = useState<Tile[]>([
    { id: crypto.randomUUID(), kind: 'x2-pos' },
    { id: crypto.randomUUID(), kind: 'x-pos' },
    { id: crypto.randomUUID(), kind: 'x-pos' },
    { id: crypto.randomUUID(), kind: 'unit-pos' },
    { id: crypto.randomUUID(), kind: 'unit-pos' },
    { id: crypto.randomUUID(), kind: 'unit-pos' },
  ]);

  const addTile = (kind: Tile['kind']) => {
    setTiles((prev) => [...prev, { id: crypto.randomUUID(), kind }]);
  };

  const removeTile = (id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  };

  // Build expression string
  const expr = (() => {
    const x2 =
      tiles.filter((t) => t.kind === 'x2-pos').length -
      tiles.filter((t) => t.kind === 'x2-neg').length;
    const x =
      tiles.filter((t) => t.kind === 'x-pos').length -
      tiles.filter((t) => t.kind === 'x-neg').length;
    const unit =
      tiles.filter((t) => t.kind === 'unit-pos').length -
      tiles.filter((t) => t.kind === 'unit-neg').length;
    const parts: string[] = [];
    if (x2 !== 0) parts.push(`${x2 === 1 ? '' : x2 === -1 ? '−' : x2}x²`);
    if (x !== 0) parts.push(`${x === 1 ? '' : x === -1 ? '−' : x}x`);
    if (unit !== 0) parts.push(`${unit}`);
    return parts.length > 0 ? parts.join(' + ').replace('+ −', '− ') : '0';
  })();

  // Layout tiles in a grid
  const PAD = 12;
  const TILE_GAP = 6;
  const CANVAS_W = 420;

  // Arrange by kind groups
  const groups: Tile['kind'][] = [
    'x2-pos',
    'x2-neg',
    'x-pos',
    'x-neg',
    'unit-pos',
    'unit-neg',
  ];

  type TileRect = {
    tile: Tile;
    x: number;
    y: number;
    meta: AlgebraTileStyle;
  };
  const rects: TileRect[] = [];
  let curX = PAD;
  let curY = PAD;
  let rowH = 0;

  for (const kind of groups) {
    const meta = ALGEBRA_TILE_META[kind];
    const group = tiles.filter((t) => t.kind === kind);
    for (const tile of group) {
      if (curX + meta.w > CANVAS_W - PAD && curX > PAD) {
        curX = PAD;
        curY += rowH + TILE_GAP;
        rowH = 0;
      }
      rects.push({ tile, x: curX, y: curY, meta });
      curX += meta.w + TILE_GAP;
      rowH = Math.max(rowH, meta.h);
    }
    if (group.length > 0) {
      curX = PAD;
      curY += rowH + TILE_GAP * 2;
      rowH = 0;
    }
  }

  const CANVAS_H = Math.max(180, curY + rowH + PAD);

  return (
    <div className="flex flex-col gap-3">
      {/* Expression display */}
      <div className="flex items-center justify-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
        <span className="text-xxs font-black text-slate-400 uppercase tracking-widest">
          Expression:
        </span>
        <span className="font-mono font-bold text-indigo-700 text-sm">
          {expr}
        </span>
      </div>

      {/* Palette */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
        {PALETTE_KINDS.map((kind) => {
          const meta = ALGEBRA_TILE_META[kind];
          return (
            <button
              key={kind}
              onClick={() => addTile(kind)}
              title={`Add ${meta.label}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200 text-xxs font-black"
              style={{ color: meta.textColor }}
            >
              <span>{getTileValue(kind)}</span>
              <span>{meta.label.replace('−', '')}</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{ display: 'block' }}
          role="img"
          aria-label={`Algebra tiles showing ${expr}`}
        >
          {rects.map(({ tile, x, y, meta }) => (
            <g
              key={tile.id}
              style={{ cursor: 'pointer' }}
              onClick={() => removeTile(tile.id)}
              role="button"
              aria-label={`Remove ${meta.label} tile`}
            >
              <rect
                x={x}
                y={y}
                width={meta.w}
                height={meta.h}
                rx={4}
                fill={meta.fill}
                stroke={meta.stroke}
                strokeWidth={1.5}
              />
              <text
                x={x + meta.w / 2}
                y={y + meta.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(14, meta.w * 0.18, meta.h * 0.55)}
                fill={meta.textColor}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {meta.label}
              </text>
            </g>
          ))}
          {tiles.length === 0 && (
            <text
              x={CANVAS_W / 2}
              y={CANVAS_H / 2}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={13}
            >
              Add tiles from the palette above
            </text>
          )}
        </svg>
      </div>
      <p className="text-xxs text-slate-400 text-center">
        Click a tile to remove it
      </p>
    </div>
  );
};

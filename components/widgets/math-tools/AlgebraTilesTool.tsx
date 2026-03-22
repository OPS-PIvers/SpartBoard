import React, { useState, useMemo } from 'react';
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

  const PAD = 12;
  const TILE_GAP = 6;
  const CANVAS_W = 420;

  type TileRect = {
    tile: Tile;
    x: number;
    y: number;
    meta: AlgebraTileStyle;
  };

  const { expr, rects, CANVAS_H } = useMemo(() => {
    const GROUPS: Tile['kind'][] = [
      'x2-pos',
      'x2-neg',
      'x-pos',
      'x-neg',
      'unit-pos',
      'unit-neg',
    ];
    // Single pass to group tiles and compute counts
    const groupedTiles: Record<AlgebraTileKind, Tile[]> = {
      'x2-pos': [],
      'x2-neg': [],
      'x-pos': [],
      'x-neg': [],
      'unit-pos': [],
      'unit-neg': [],
    };

    for (const tile of tiles) {
      groupedTiles[tile.kind].push(tile);
    }

    const x2 = groupedTiles['x2-pos'].length - groupedTiles['x2-neg'].length;
    const x = groupedTiles['x-pos'].length - groupedTiles['x-neg'].length;
    const unit =
      groupedTiles['unit-pos'].length - groupedTiles['unit-neg'].length;

    const parts: string[] = [];
    if (x2 !== 0) parts.push(`${x2 === 1 ? '' : x2 === -1 ? '−' : x2}x²`);
    if (x !== 0) parts.push(`${x === 1 ? '' : x === -1 ? '−' : x}x`);
    if (unit !== 0) parts.push(`${unit}`);
    const computedExpr =
      parts.length > 0 ? parts.join(' + ').replace('+ −', '− ') : '0';

    const computedRects: TileRect[] = [];
    let curX = PAD;
    let curY = PAD;
    let rowH = 0;

    for (const kind of GROUPS) {
      const meta = ALGEBRA_TILE_META[kind];
      const group = groupedTiles[kind];
      for (const tile of group) {
        if (curX + meta.w > CANVAS_W - PAD && curX > PAD) {
          curX = PAD;
          curY += rowH + TILE_GAP;
          rowH = 0;
        }
        computedRects.push({ tile, x: curX, y: curY, meta });
        curX += meta.w + TILE_GAP;
        rowH = Math.max(rowH, meta.h);
      }
      if (group.length > 0) {
        curX = PAD;
        curY += rowH + TILE_GAP * 2;
        rowH = 0;
      }
    }

    const computedCanvasH = Math.max(180, curY + rowH + PAD);

    return {
      expr: computedExpr,
      rects: computedRects,
      CANVAS_H: computedCanvasH,
    };
  }, [tiles]);

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {/* Expression display */}
      <div className="flex items-center justify-center gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-100 shrink-0">
        <span
          className="font-black text-slate-400 uppercase tracking-widest"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          Expression:
        </span>
        <span
          className="font-mono font-bold text-indigo-700 tabular-nums"
          style={{ fontSize: 'min(14px, 4cqmin)' }}
        >
          {expr}
        </span>
      </div>

      {/* Palette */}
      <div className="flex flex-wrap items-center justify-center gap-1 p-2 bg-slate-50/50 rounded-xl border border-slate-100 shrink-0">
        {PALETTE_KINDS.map((kind) => {
          const meta = ALGEBRA_TILE_META[kind];
          return (
            <button
              key={kind}
              onClick={() => addTile(kind)}
              title={`Add ${meta.label}`}
              className="flex items-center gap-1 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200 font-black"
              style={{
                color: meta.textColor,
                fontSize: 'min(10px, 3.5cqmin)',
                padding: 'min(4px, 1cqmin) min(8px, 1.8cqmin)',
              }}
            >
              <span>{getTileValue(kind)}</span>
              <span>{meta.label.replace('−', '')}</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-x-auto custom-scrollbar rounded-xl border border-slate-100 bg-white shadow-inner shadow-slate-50">
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
      <p
        className="text-slate-400 text-center font-bold italic shrink-0"
        style={{ fontSize: 'min(9px, 3.2cqmin)' }}
      >
        Click a tile to remove it
      </p>
    </div>
  );
};

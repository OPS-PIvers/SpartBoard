import React, { useState, useCallback } from 'react';
import { getPatternBlockPoints, PATTERN_BLOCK_COLORS } from './mathToolUtils';

type ShapeType =
  | 'hexagon'
  | 'trapezoid'
  | 'triangle'
  | 'rhombus-wide'
  | 'rhombus-narrow'
  | 'square';

interface PlacedBlock {
  id: string;
  shape: ShapeType;
  x: number;
  y: number;
  rotation: number;
}

const UNIT = 28; // base unit in px

/** Delegates to the shared getPatternBlockPoints helper in mathToolUtils */
function shapePoints(shape: ShapeType): string {
  return getPatternBlockPoints(shape, UNIT);
}

const PALETTE_SHAPES: ShapeType[] = [
  'hexagon',
  'trapezoid',
  'triangle',
  'rhombus-wide',
  'rhombus-narrow',
  'square',
];
const PALETTE_LABELS: Record<ShapeType, string> = {
  hexagon: 'Hexagon',
  trapezoid: 'Trapezoid',
  triangle: 'Triangle',
  'rhombus-wide': 'Wide Rhombus',
  'rhombus-narrow': 'Narrow Rhombus',
  square: 'Square',
};

const CANVAS_W = 420;
const CANVAS_H = 260;

export const PatternBlocksTool: React.FC = () => {
  const [blocks, setBlocks] = useState<PlacedBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const addBlock = useCallback((shape: ShapeType) => {
    const newId = crypto.randomUUID();
    // Spread new blocks across the canvas in a deterministic offset pattern
    setBlocks((prev) => {
      const idx = prev.length;
      const cols = 3;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const newBlock: PlacedBlock = {
        id: newId,
        shape,
        x: 80 + col * 110,
        y: 60 + row * 90,
        rotation: 0,
      };
      return [...prev, newBlock];
    });
    setSelected(newId);
  }, []);

  const rotateSelected = useCallback(() => {
    if (!selected) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === selected ? { ...b, rotation: (b.rotation + 30) % 360 } : b
      )
    );
  }, [selected]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    setBlocks((prev) => prev.filter((b) => b.id !== selected));
    setSelected(null);
  }, [selected]);

  const handleBlockClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Palette */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
        {PALETTE_SHAPES.map((shape) => (
          <button
            key={shape}
            onClick={() => addBlock(shape)}
            title={PALETTE_LABELS[shape]}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200"
          >
            <svg width={36} height={36} viewBox="-20 -20 40 40">
              <polygon
                points={shapePoints(shape)}
                fill={PATTERN_BLOCK_COLORS[shape]}
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={1}
              />
            </svg>
            <span className="text-slate-400" style={{ fontSize: 9 }}>
              {PALETTE_LABELS[shape].split(' ')[0]}
            </span>
          </button>
        ))}
      </div>

      {/* Selected controls */}
      {selected && (
        <div className="flex gap-2 items-center justify-end">
          <button
            onClick={rotateSelected}
            className="text-xxs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-1 rounded-lg font-black uppercase tracking-wider transition-colors"
          >
            Rotate 30°
          </button>
          <button
            onClick={removeSelected}
            className="text-xxs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded-lg font-black uppercase tracking-wider transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        className="rounded-xl border border-slate-100 bg-white overflow-hidden"
        onClick={() => setSelected(null)}
      >
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{ display: 'block' }}
          role="img"
          aria-label="Pattern blocks canvas"
        >
          {/* Dot grid */}
          {Array.from({ length: Math.ceil(CANVAS_H / 20) }).map((_, row) =>
            Array.from({ length: Math.ceil(CANVAS_W / 20) }).map((_, col) => (
              <circle
                key={`d-${row}-${col}`}
                cx={col * 20}
                cy={row * 20}
                r={1}
                fill="#e2e8f0"
              />
            ))
          )}
          {/* Placed blocks */}
          {blocks.map((block) => (
            <polygon
              key={block.id}
              points={shapePoints(block.shape)}
              transform={`translate(${block.x},${block.y}) rotate(${block.rotation})`}
              fill={PATTERN_BLOCK_COLORS[block.shape]}
              stroke={block.id === selected ? '#1e293b' : 'rgba(0,0,0,0.15)'}
              strokeWidth={block.id === selected ? 2.5 : 1}
              opacity={0.9}
              style={{
                cursor: 'pointer',
                filter:
                  block.id === selected
                    ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))'
                    : 'none',
              }}
              onClick={(e) => handleBlockClick(block.id, e)}
              role="button"
              aria-label={`${block.shape} block`}
            />
          ))}
          {blocks.length === 0 && (
            <text
              x={CANVAS_W / 2}
              y={CANVAS_H / 2}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize={13}
              fontFamily="sans-serif"
            >
              Click a shape above to add it
            </text>
          )}
        </svg>
      </div>
      <p className="text-xxs text-slate-400 text-center">
        Click shapes to select · Click again to deselect · Rotate or remove with
        controls above
      </p>
    </div>
  );
};

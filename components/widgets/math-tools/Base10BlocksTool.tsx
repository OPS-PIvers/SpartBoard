import React, { useState } from 'react';

const UNIT_SIZE = 18; // px
const GAP = 2;

interface Block {
  type: 'unit' | 'rod' | 'flat';
  id: string;
}

/** Renders a single base-10 block (unit square, rod, or flat) */
function BlockShape({ type }: { type: Block['type'] }) {
  if (type === 'unit') {
    return (
      <rect
        width={UNIT_SIZE}
        height={UNIT_SIZE}
        rx={2}
        fill="#60a5fa"
        stroke="#2563eb"
        strokeWidth={1}
      />
    );
  }
  if (type === 'rod') {
    // 10 units tall
    return (
      <g>
        {Array.from({ length: 10 }).map((_, i) => (
          <rect
            key={i}
            x={0}
            y={i * (UNIT_SIZE + GAP)}
            width={UNIT_SIZE}
            height={UNIT_SIZE}
            rx={2}
            fill="#34d399"
            stroke="#059669"
            strokeWidth={0.8}
          />
        ))}
      </g>
    );
  }
  // flat: 10×10
  return (
    <g>
      {Array.from({ length: 10 }).map((_, row) =>
        Array.from({ length: 10 }).map((_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * (UNIT_SIZE + GAP)}
            y={row * (UNIT_SIZE + GAP)}
            width={UNIT_SIZE}
            height={UNIT_SIZE}
            rx={1}
            fill="#fbbf24"
            stroke="#d97706"
            strokeWidth={0.6}
          />
        ))
      )}
    </g>
  );
}

function blockW(type: Block['type']): number {
  if (type === 'unit') return UNIT_SIZE;
  if (type === 'rod') return UNIT_SIZE;
  return 10 * (UNIT_SIZE + GAP) - GAP;
}

function blockH(type: Block['type']): number {
  if (type === 'unit') return UNIT_SIZE;
  if (type === 'rod') return 10 * (UNIT_SIZE + GAP) - GAP;
  return 10 * (UNIT_SIZE + GAP) - GAP;
}

export const Base10BlocksTool: React.FC = () => {
  const [blocks, setBlocks] = useState<Block[]>([
    { type: 'flat', id: crypto.randomUUID() },
    { type: 'rod', id: crypto.randomUUID() },
    { type: 'rod', id: crypto.randomUUID() },
    { type: 'unit', id: crypto.randomUUID() },
    { type: 'unit', id: crypto.randomUUID() },
    { type: 'unit', id: crypto.randomUUID() },
  ]);

  const addBlock = (type: Block['type']) => {
    setBlocks((prev) => [...prev, { type, id: crypto.randomUUID() }]);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const total = blocks.reduce((sum, b) => {
    if (b.type === 'flat') return sum + 100;
    if (b.type === 'rod') return sum + 10;
    return sum + 1;
  }, 0);

  const colGap = 16;
  let xOffset = 8;
  const svgH = 10 * (UNIT_SIZE + GAP) + 40;
  const positions: { id: string; x: number; y: number; type: Block['type'] }[] =
    [];

  for (const block of blocks) {
    const bh = blockH(block.type);
    positions.push({
      id: block.id,
      x: xOffset,
      y: svgH - bh - 8,
      type: block.type,
    });
    xOffset += blockW(block.type) + colGap;
  }

  const svgW = Math.max(360, xOffset + 8);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xxs font-black text-slate-400 uppercase tracking-widest">
          Add:
        </span>
        {(
          [
            { type: 'flat', label: 'Flat (100)', color: 'bg-amber-400' },
            { type: 'rod', label: 'Rod (10)', color: 'bg-emerald-400' },
            { type: 'unit', label: 'Unit (1)', color: 'bg-blue-400' },
          ] as const
        ).map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => addBlock(type)}
            className={`${color} text-white text-xxs font-black px-2 py-1 rounded-lg shadow-sm hover:opacity-90 transition-opacity`}
          >
            + {label}
          </button>
        ))}
        <span className="ml-auto text-sm font-black text-slate-700">
          Total: <span className="text-indigo-600">{total}</span>
        </span>
      </div>

      {/* Block canvas */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', minWidth: svgW }}
          role="img"
          aria-label={`Base-10 blocks showing ${total}`}
        >
          {/* Ground line */}
          <line
            x1={4}
            y1={svgH - 4}
            x2={svgW - 4}
            y2={svgH - 4}
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
          {positions.map(({ id, x, y, type }) => (
            <g
              key={id}
              transform={`translate(${x}, ${y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => removeBlock(id)}
              role="button"
              aria-label={`Remove ${type} block`}
            >
              <BlockShape type={type} />
              {/* × remove overlay */}
              <rect
                width={blockW(type)}
                height={blockH(type)}
                fill="rgba(239,68,68,0)"
                rx={2}
                className="hover:fill-red-500/20 transition-all"
              />
            </g>
          ))}
          {blocks.length === 0 && (
            <text
              x={svgW / 2}
              y={svgH / 2}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={13}
            >
              Add blocks above
            </text>
          )}
        </svg>
      </div>
      <p className="text-xxs text-slate-400 text-center">
        Click a block to remove it
      </p>
    </div>
  );
};

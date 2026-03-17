import React, { useRef, useState, useEffect, useCallback } from 'react';
import { MathToolConfig, PlaceValueBlock } from '@/types';

interface PlaceValueToolProps {
  config: MathToolConfig;
  onUpdate: (updates: Partial<MathToolConfig>) => void;
}

const UNIT_SIZE = 18;
const GAP = 2;

function BlockShape({ type }: { type: '1' | '10' | '100' | '1000' }) {
  if (type === '1') {
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
  if (type === '10') {
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
  if (type === '100') {
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
  // 1000 cube (simplified visual representation as a 3D-ish box or large square for 2D)
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={10 * (UNIT_SIZE + GAP) - GAP}
        height={10 * (UNIT_SIZE + GAP) - GAP}
        rx={2}
        fill="#f87171"
        stroke="#dc2626"
        strokeWidth={1.5}
      />
      <text
        x={(10 * (UNIT_SIZE + GAP) - GAP) / 2}
        y={(10 * (UNIT_SIZE + GAP) - GAP) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize="24"
        fontWeight="bold"
      >
        1000
      </text>
    </g>
  );
}

function blockW(type: '1' | '10' | '100' | '1000'): number {
  if (type === '1') return UNIT_SIZE;
  if (type === '10') return UNIT_SIZE;
  return 10 * (UNIT_SIZE + GAP) - GAP;
}

function blockH(type: '1' | '10' | '100' | '1000'): number {
  if (type === '1') return UNIT_SIZE;
  if (type === '10') return 10 * (UNIT_SIZE + GAP) - GAP;
  return 10 * (UNIT_SIZE + GAP) - GAP;
}

export const PlaceValueTool: React.FC<PlaceValueToolProps> = ({
  config,
  onUpdate,
}) => {
  const columns = config.placeValueColumns ?? [
    'Thousands',
    'Hundreds',
    'Tens',
    'Ones',
  ];
  const blocks: PlaceValueBlock[] = React.useMemo(
    () => config.placeValueBlocks ?? [],
    [config.placeValueBlocks]
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);

  // Local state for dragging to make it smooth, synced back to config on drop
  const [localBlocks, setLocalBlocks] = useState(blocks);

  useEffect(() => {
    if (!draggingBlockId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalBlocks(config.placeValueBlocks ?? []);
    }
  }, [config.placeValueBlocks, draggingBlockId]);

  const handlePointerDown = (
    e: React.PointerEvent<SVGGElement>,
    id: string
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingBlockId(id);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingBlockId || !svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const scaleX = 600 / svgRect.width;
    const scaleY = 400 / svgRect.height;

    setLocalBlocks((prev) =>
      prev.map((b) =>
        b.id === draggingBlockId
          ? {
              ...b,
              x: b.x + e.movementX * scaleX,
              y: b.y + e.movementY * scaleY,
            }
          : b
      )
    );
  };

  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingBlockId) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    onUpdate({ placeValueBlocks: localBlocks });
    setDraggingBlockId(null);
  };

  const addBlock = useCallback(
    (type: '1' | '10' | '100' | '1000') => {
      // Determine target column index based on type to place it there initially
      let colIndex = columns.length - 1; // Default to rightmost (Ones)
      if (type === '10') colIndex = Math.max(0, columns.length - 2);
      if (type === '100') colIndex = Math.max(0, columns.length - 3);
      if (type === '1000') colIndex = Math.max(0, columns.length - 4);

      const colWidth = 600 / columns.length;
      const yOffset = 100 + Math.floor(Math.random() * 100);
      const newBlock = {
        id: crypto.randomUUID(),
        type,
        x: colIndex * colWidth + colWidth / 2 - blockW(type) / 2,
        y: yOffset,
      };
      onUpdate({ placeValueBlocks: [...blocks, newBlock] });
    },
    [columns.length, blocks, onUpdate]
  );

  const decomposeBlock = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const blockToDecompose = blocks.find((b) => b.id === id);
    if (!blockToDecompose) return;

    let newTypes: ('1' | '10' | '100' | '1000')[] = [];
    if (blockToDecompose.type === '10') {
      newTypes = Array(10).fill('1') as ('1' | '10' | '100' | '1000')[];
    } else if (blockToDecompose.type === '100') {
      newTypes = Array(10).fill('10') as ('1' | '10' | '100' | '1000')[];
    } else if (blockToDecompose.type === '1000') {
      newTypes = Array(10).fill('100') as ('1' | '10' | '100' | '1000')[];
    } else return; // Can't decompose a '1'

    const newBlocks = newTypes.map((type, i) => ({
      id: crypto.randomUUID(),
      type,
      x: blockToDecompose.x + (i % 5) * 15, // Scatter slightly
      y: blockToDecompose.y + Math.floor(i / 5) * 15,
    }));

    onUpdate({
      placeValueBlocks: [...blocks.filter((b) => b.id !== id), ...newBlocks],
    });
  };

  const removeBlock = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdate({ placeValueBlocks: blocks.filter((b) => b.id !== id) });
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0 pb-2">
        <span className="font-black text-slate-400 uppercase tracking-widest text-xs">
          Add:
        </span>
        {(
          [
            { type: '1000', label: '1000', color: 'bg-red-400' },
            { type: '100', label: '100', color: 'bg-amber-400' },
            { type: '10', label: '10', color: 'bg-emerald-400' },
            { type: '1', label: '1', color: 'bg-blue-400' },
          ] as const
        ).map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => addBlock(type)}
            className={`${color} text-white font-bold rounded shadow-sm hover:opacity-90 px-2 py-1 text-xs`}
          >
            + {label}
          </button>
        ))}
        <button
          onClick={() => onUpdate({ placeValueBlocks: [] })}
          className="ml-auto text-xs font-bold text-red-500 hover:text-red-700 underline"
        >
          Clear All
        </button>
      </div>

      {/* Mat Canvas */}
      <div className="flex-1 bg-white border-2 border-slate-200 rounded-xl overflow-hidden relative touch-none select-none">
        <svg
          ref={svgRef}
          viewBox="0 0 600 400"
          className="w-full h-full block"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Column Backgrounds and Dividers */}
          {columns.map((col, i) => {
            const colWidth = 600 / columns.length;
            const x = i * colWidth;
            return (
              <g key={col}>
                {i > 0 && (
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={400}
                    stroke="#e2e8f0"
                    strokeWidth={2}
                  />
                )}
                <rect x={x} y={0} width={colWidth} height={40} fill="#f8fafc" />
                <text
                  x={x + colWidth / 2}
                  y={25}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="16"
                  fontWeight="bold"
                >
                  {col}
                </text>
                {i > 0 && (
                  <line
                    x1={x}
                    y1={40}
                    x2={x}
                    y2={400}
                    stroke="#cbd5e1"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                )}
                <line
                  x1={0}
                  y1={40}
                  x2={600}
                  y2={40}
                  stroke="#e2e8f0"
                  strokeWidth={2}
                />
              </g>
            );
          })}

          {/* Blocks */}
          {localBlocks.map((b) => (
            <g
              key={b.id}
              transform={`translate(${b.x}, ${b.y})`}
              onPointerDown={(e) => handlePointerDown(e, b.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={(e) => removeBlock(e, b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                decomposeBlock(e, b.id);
              }}
              style={{ cursor: draggingBlockId === b.id ? 'grabbing' : 'grab' }}
            >
              <BlockShape type={b.type} />
              {/* Invisible interaction layer */}
              <rect
                width={blockW(b.type)}
                height={blockH(b.type)}
                fill="transparent"
              />
            </g>
          ))}
        </svg>
        <div className="absolute bottom-2 left-0 w-full text-center pointer-events-none">
          <p className="text-slate-400 text-xs font-bold italic drop-shadow-sm bg-white/70 inline-block px-2 rounded-full">
            Drag to move. Right-click to decompose. Double-click to delete.
          </p>
        </div>
      </div>
    </div>
  );
};

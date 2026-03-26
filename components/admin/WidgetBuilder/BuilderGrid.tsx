import React, { useState } from 'react';
import {
  CustomGridDefinition,
  CustomGridCell,
  CustomBlockDefinition,
} from '@/types';
import {
  BLOCK_ICONS,
  BLOCK_LABELS,
} from '@/components/widgets/CustomWidget/types';

interface BuilderGridProps {
  gridDefinition: CustomGridDefinition;
  onChange: (grid: CustomGridDefinition) => void;
  selectedCellId: string | null;
  onSelectCell: (cellId: string | null) => void;
}

function generateCells(
  columns: number,
  rows: number,
  existing: CustomGridCell[]
): CustomGridCell[] {
  const cells: CustomGridCell[] = [];
  // Build a set of occupied positions from existing non-trivial spans
  const occupied = new Set<string>();
  for (const cell of existing) {
    for (let c = cell.colStart; c < cell.colStart + cell.colSpan; c++) {
      for (let r = cell.rowStart; r < cell.rowStart + cell.rowSpan; r++) {
        if (c !== cell.colStart || r !== cell.rowStart) {
          occupied.add(`${c}-${r}`);
        }
      }
    }
  }

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= columns; col++) {
      if (occupied.has(`${col}-${row}`)) continue;

      // Look for an existing cell at this position
      const found = existing.find(
        (c) => c.colStart === col && c.rowStart === row
      );

      if (found) {
        // Clamp span to new bounds
        const colSpan = Math.min(found.colSpan, columns - col + 1);
        const rowSpan = Math.min(found.rowSpan, rows - row + 1);
        cells.push({ ...found, colSpan, rowSpan });
        // Mark newly spanned cells as occupied
        for (let c = col; c < col + colSpan; c++) {
          for (let r = row; r < row + rowSpan; r++) {
            if (c !== col || r !== row) occupied.add(`${c}-${r}`);
          }
        }
      } else {
        cells.push({
          id: `cell-${col}-${row}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          colStart: col,
          rowStart: row,
          colSpan: 1,
          rowSpan: 1,
          block: null,
        });
      }
    }
  }

  return cells;
}

export const BuilderGrid: React.FC<BuilderGridProps> = ({
  gridDefinition,
  onChange,
  selectedCellId,
  onSelectCell,
}) => {
  const { columns, rows, cells } = gridDefinition;
  const [shiftSelected, setShiftSelected] = useState<string[]>([]);

  const handleColumnChange = (delta: number) => {
    const next = Math.max(1, Math.min(4, columns + delta));
    if (next === columns) return;
    const newCells = generateCells(next, rows, cells);
    onChange({ ...gridDefinition, columns: next, cells: newCells });
    onSelectCell(null);
    setShiftSelected([]);
  };

  const handleRowChange = (delta: number) => {
    const next = Math.max(1, Math.min(8, rows + delta));
    if (next === rows) return;
    const newCells = generateCells(columns, next, cells);
    onChange({ ...gridDefinition, rows: next, cells: newCells });
    onSelectCell(null);
    setShiftSelected([]);
  };

  const handleCellClick = (
    cellId: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (e.shiftKey) {
      setShiftSelected((prev) =>
        prev.includes(cellId)
          ? prev.filter((id) => id !== cellId)
          : [...prev, cellId]
      );
      onSelectCell(null);
    } else {
      setShiftSelected([]);
      onSelectCell(selectedCellId === cellId ? null : cellId);
    }
  };

  const canMerge = (): boolean => {
    if (shiftSelected.length < 2) return false;
    const selected = cells.filter((c) => shiftSelected.includes(c.id));
    if (selected.length < 2) return false;
    // Check adjacency: they must form a rectangle
    const minCol = Math.min(...selected.map((c) => c.colStart));
    const maxCol = Math.max(...selected.map((c) => c.colStart + c.colSpan - 1));
    const minRow = Math.min(...selected.map((c) => c.rowStart));
    const maxRow = Math.max(...selected.map((c) => c.rowStart + c.rowSpan - 1));
    const expectedCount = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    const actualCoverage = selected.reduce(
      (sum, c) => sum + c.colSpan * c.rowSpan,
      0
    );
    return actualCoverage === expectedCount;
  };

  const handleMerge = () => {
    if (!canMerge()) return;
    const selected = cells.filter((c) => shiftSelected.includes(c.id));
    const minCol = Math.min(...selected.map((c) => c.colStart));
    const maxCol = Math.max(...selected.map((c) => c.colStart + c.colSpan - 1));
    const minRow = Math.min(...selected.map((c) => c.rowStart));
    const maxRow = Math.max(...selected.map((c) => c.rowStart + c.rowSpan - 1));

    const firstBlock: CustomBlockDefinition | null =
      selected.find((c) => c.block)?.block ?? null;

    const mergedCell: CustomGridCell = {
      id: `cell-${minCol}-${minRow}-merged-${Date.now()}`,
      colStart: minCol,
      rowStart: minRow,
      colSpan: maxCol - minCol + 1,
      rowSpan: maxRow - minRow + 1,
      block: firstBlock,
    };

    const remaining = cells.filter((c) => !shiftSelected.includes(c.id));
    onChange({ ...gridDefinition, cells: [...remaining, mergedCell] });
    setShiftSelected([]);
    onSelectCell(mergedCell.id);
  };

  const handleSplit = () => {
    if (!selectedCellId) return;
    const cell = cells.find((c) => c.id === selectedCellId);
    if (!cell || (cell.colSpan === 1 && cell.rowSpan === 1)) return;

    const newCells: CustomGridCell[] = [];
    for (let row = cell.rowStart; row < cell.rowStart + cell.rowSpan; row++) {
      for (let col = cell.colStart; col < cell.colStart + cell.colSpan; col++) {
        newCells.push({
          id: `cell-${col}-${row}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          colStart: col,
          rowStart: row,
          colSpan: 1,
          rowSpan: 1,
          block: null,
        });
      }
    }

    const remaining = cells.filter((c) => c.id !== selectedCellId);
    onChange({ ...gridDefinition, cells: [...remaining, ...newCells] });
    onSelectCell(null);
  };

  const selectedCell = cells.find((c) => c.id === selectedCellId);
  const isMergedSelected =
    selectedCell && (selectedCell.colSpan > 1 || selectedCell.rowSpan > 1);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Columns */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Columns</span>
          <button
            type="button"
            onClick={() => handleColumnChange(-1)}
            disabled={columns <= 1}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm transition-colors"
          >
            −
          </button>
          <span className="w-6 text-center text-white font-mono text-sm">
            {columns}
          </span>
          <button
            type="button"
            onClick={() => handleColumnChange(1)}
            disabled={columns >= 4}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm transition-colors"
          >
            +
          </button>
        </div>

        {/* Rows */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Rows</span>
          <button
            type="button"
            onClick={() => handleRowChange(-1)}
            disabled={rows <= 1}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm transition-colors"
          >
            −
          </button>
          <span className="w-6 text-center text-white font-mono text-sm">
            {rows}
          </span>
          <button
            type="button"
            onClick={() => handleRowChange(1)}
            disabled={rows >= 8}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm transition-colors"
          >
            +
          </button>
        </div>

        {/* Merge / Split */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleMerge}
            disabled={!canMerge()}
            className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Merge Selected
          </button>
          <button
            type="button"
            onClick={handleSplit}
            disabled={!isMergedSelected}
            className="px-3 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Split Cell
          </button>
        </div>
      </div>

      {/* Shift-select hint */}
      {shiftSelected.length > 0 && (
        <p className="text-xs text-indigo-400">
          {shiftSelected.length} cells selected (Shift+click to add/remove)
        </p>
      )}

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: '4px',
          height: '300px',
        }}
        className="bg-slate-900 rounded-lg p-1 border border-slate-700"
      >
        {cells.map((cell) => {
          const isSelected = selectedCellId === cell.id;
          const isShiftSel = shiftSelected.includes(cell.id);
          const hasBlock = cell.block !== null;

          return (
            <div
              key={cell.id}
              role="button"
              tabIndex={0}
              aria-label={
                hasBlock && cell.block
                  ? `Cell ${cell.colStart},${cell.rowStart}: ${cell.block.type}`
                  : `Empty cell ${cell.colStart},${cell.rowStart}`
              }
              style={{
                gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
                gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
              }}
              onClick={(e) => handleCellClick(cell.id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCell(selectedCellId === cell.id ? null : cell.id);
                }
              }}
              className={[
                'rounded flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden',
                'text-center select-none',
                isSelected
                  ? 'border-2 border-blue-400 bg-blue-900/40 ring-1 ring-blue-400'
                  : isShiftSel
                    ? 'border-2 border-indigo-400 bg-indigo-900/30'
                    : hasBlock
                      ? 'border border-slate-600 bg-slate-700/60 hover:border-slate-500'
                      : 'border border-dashed border-slate-600 bg-slate-800/40 hover:border-slate-400 hover:bg-slate-800/60',
              ].join(' ')}
            >
              {hasBlock && cell.block ? (
                <>
                  <span className="text-lg leading-none">
                    {BLOCK_ICONS[cell.block.type]}
                  </span>
                  <span className="text-xs text-slate-300 mt-1 px-1 truncate max-w-full">
                    {cell.block.name ?? BLOCK_LABELS[cell.block.type]}
                  </span>
                </>
              ) : (
                <span className="text-slate-600 text-xl font-light">+</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Click a cell to select it. Shift+click multiple cells, then &quot;Merge
        Selected&quot;.
      </p>
    </div>
  );
};

import React, { useCallback } from 'react';
import {
  CustomGridCell,
  CustomBlockDefinition,
  CustomBlockType,
} from '@/types';
import {
  BLOCK_ICONS,
  BLOCK_LABELS,
} from '@/components/widgets/CustomWidget/types';
import { Trash2, X } from 'lucide-react';
import { buildDefaultConfig } from './blockDefaults';

interface CellEditorProps {
  cell: CustomGridCell | null;
  onUpdateBlock: (cellId: string, block: CustomBlockDefinition | null) => void;
  onDropBlock: (cellId: string, blockType: CustomBlockType) => void;
  onClose: () => void;
}

export const CellEditor: React.FC<CellEditorProps> = ({
  cell,
  onUpdateBlock,
  onDropBlock,
  onClose,
}) => {
  const handleRemoveBlock = useCallback(() => {
    if (!cell) return;
    onUpdateBlock(cell.id, null);
  }, [cell, onUpdateBlock]);

  const handleAddBlock = useCallback(
    (type: CustomBlockType) => {
      if (!cell) return;
      const newBlock: CustomBlockDefinition = {
        id: crypto.randomUUID(),
        type,
        config: buildDefaultConfig(type),
        style: {},
      };
      onDropBlock(cell.id, type);
      onUpdateBlock(cell.id, newBlock);
    },
    [cell, onDropBlock, onUpdateBlock]
  );

  if (!cell) {
    return (
      <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 items-center justify-center text-slate-500 text-sm p-4 text-center">
        <p>Select a cell in the grid to edit its block.</p>
      </div>
    );
  }

  const block = cell.block;

  const BlockIcon = block ? BLOCK_ICONS[block.type] : null;

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 border-b border-slate-600">
        <span className="text-xs font-semibold text-slate-200">
          Cell Editor —{' '}
          <span className="font-mono text-slate-400">
            [{cell.colStart},{cell.rowStart}]
          </span>
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
          title="Close editor"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Current block */}
        {block ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Block
              </span>
              <button
                onClick={handleRemoveBlock}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
              >
                <Trash2 size={10} />
                Remove
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 border border-slate-600">
              {BlockIcon && (
                <span className="text-base leading-none flex-shrink-0">
                  {BlockIcon}
                </span>
              )}
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {BLOCK_LABELS[block.type]}
                </p>
                <p className="text-xs text-slate-500 font-mono">{block.type}</p>
              </div>
            </div>

            {/* Simple config fields based on block type */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Config
              </span>
              {Object.entries(block.config as Record<string, unknown>).map(
                ([key, val]) => {
                  if (typeof val === 'string' || typeof val === 'number') {
                    return (
                      <div key={key}>
                        <label className="block text-xs text-slate-400 mb-1 capitalize">
                          {key}
                        </label>
                        <input
                          type={typeof val === 'number' ? 'number' : 'text'}
                          value={String(val)}
                          onChange={(e) => {
                            const updated: CustomBlockDefinition = {
                              ...block,
                              config: {
                                ...(block.config as Record<string, unknown>),
                                [key]:
                                  typeof val === 'number'
                                    ? Number.isFinite(Number(e.target.value))
                                      ? Number(e.target.value)
                                      : val
                                    : e.target.value,
                              },
                            };
                            onUpdateBlock(cell.id, updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    );
                  }
                  if (typeof val === 'boolean') {
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`config-${key}`}
                          checked={val}
                          onChange={(e) => {
                            const updated: CustomBlockDefinition = {
                              ...block,
                              config: {
                                ...(block.config as Record<string, unknown>),
                                [key]: e.target.checked,
                              },
                            };
                            onUpdateBlock(cell.id, updated);
                          }}
                          className="accent-blue-500"
                        />
                        <label
                          htmlFor={`config-${key}`}
                          className="text-xs text-slate-300 capitalize"
                        >
                          {key}
                        </label>
                      </div>
                    );
                  }
                  return null;
                }
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              This cell is empty. Click a block type to add one:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  'text',
                  'heading',
                  'cb-button',
                  'counter',
                  'timer',
                  'toggle',
                  'stars',
                  'progress',
                  'checklist',
                  'poll',
                  'multiple-choice',
                  'reveal',
                ] as CustomBlockType[]
              ).map((type) => (
                <button
                  key={type}
                  onClick={() => handleAddBlock(type)}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-600 hover:border-blue-500 rounded text-xs text-slate-300 hover:text-white transition-colors text-left"
                >
                  <span className="text-sm leading-none flex-shrink-0">
                    {BLOCK_ICONS[type]}
                  </span>
                  <span className="truncate">{BLOCK_LABELS[type]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cell span info */}
        <div className="pt-2 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Span: {cell.colSpan} col × {cell.rowSpan} row
          </p>
        </div>
      </div>
    </div>
  );
};

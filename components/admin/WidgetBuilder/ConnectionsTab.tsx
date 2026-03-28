import React, { useState } from 'react';
import { CustomGridDefinition, BlockConnection, BlockAction } from '@/types';
import {
  BLOCK_EVENTS as BLOCK_EVENTS_MAP,
  BLOCK_ACTIONS as BLOCK_ACTIONS_MAP,
} from '@/components/widgets/CustomWidget/types';
import { Link2, Plus, Trash2, ArrowRight } from 'lucide-react';

interface ConnectionsTabProps {
  gridDefinition: CustomGridDefinition;
  onChange: (grid: CustomGridDefinition) => void;
}

// Derive unique events from the per-block-type map so this list stays in sync
const allEventSet = new Set<string>();
Object.values(BLOCK_EVENTS_MAP).forEach((events) =>
  events.forEach((e) => allEventSet.add(e))
);
const BLOCK_EVENTS = Array.from(allEventSet).sort();

// Derive unique actions from the per-block-type map, plus widget-level actions
const allActionSet = new Set<string>();
Object.values(BLOCK_ACTIONS_MAP).forEach((actions) =>
  actions.forEach((a) => allActionSet.add(a))
);
(['reset-all', 'play-sound', 'show-toast'] as const).forEach((a) =>
  allActionSet.add(a)
);
const BLOCK_ACTIONS = Array.from(allActionSet).sort() as BlockAction[];

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  gridDefinition,
  onChange,
}) => {
  const { cells, connections } = gridDefinition;
  const [isAdding, setIsAdding] = useState(false);
  const [newConn, setNewConn] = useState<Partial<BlockConnection>>({
    event: 'on-click',
    action: 'show',
  });

  // Collect named blocks from cells
  const namedBlocks = cells
    .filter((c) => c.block !== null)
    .map((c) => {
      const b = c.block;
      if (!b) return null;
      return {
        id: b.id,
        label: b.name ?? `${b.type} [${c.colStart},${c.rowStart}]`,
      };
    })
    .filter((b): b is { id: string; label: string } => b !== null);

  const handleAddConnection = () => {
    if (
      !newConn.sourceBlockId ||
      !newConn.targetBlockId ||
      !newConn.event ||
      !newConn.action
    ) {
      return;
    }
    const conn: BlockConnection = {
      id: crypto.randomUUID(),
      sourceBlockId: newConn.sourceBlockId,
      event: newConn.event,
      targetBlockId: newConn.targetBlockId,
      action: newConn.action,
    };
    onChange({
      ...gridDefinition,
      connections: [...connections, conn],
    });
    setIsAdding(false);
    setNewConn({ event: 'on-click', action: 'show' });
  };

  const handleDeleteConnection = (id: string) => {
    onChange({
      ...gridDefinition,
      connections: connections.filter((c) => c.id !== id),
    });
  };

  const getBlockLabel = (blockId: string) => {
    return namedBlocks.find((b) => b.id === blockId)?.label ?? blockId;
  };

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">
            Connections
          </span>
          <span className="bg-slate-600 text-slate-300 text-xs rounded-full px-1.5 py-0.5">
            {connections.length}
          </span>
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          <Plus size={10} />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {namedBlocks.length < 2 && (
          <p className="text-xs text-slate-500 italic">
            Add at least two blocks to the grid to create connections.
          </p>
        )}

        {/* Add connection form */}
        {isAdding && namedBlocks.length >= 2 && (
          <div className="bg-slate-900 border border-blue-700 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-400">
              New Connection
            </p>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                Source Block
              </label>
              <select
                value={newConn.sourceBlockId ?? ''}
                onChange={(e) =>
                  setNewConn((p) => ({ ...p, sourceBlockId: e.target.value }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select block...</option>
                {namedBlocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Event</label>
              <select
                value={newConn.event ?? 'on-click'}
                onChange={(e) =>
                  setNewConn((p) => ({
                    ...p,
                    event: e.target.value,
                  }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {BLOCK_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                Target Block
              </label>
              <select
                value={newConn.targetBlockId ?? ''}
                onChange={(e) =>
                  setNewConn((p) => ({ ...p, targetBlockId: e.target.value }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select block...</option>
                {namedBlocks
                  .filter((b) => b.id !== newConn.sourceBlockId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Action</label>
              <select
                value={newConn.action ?? 'show'}
                onChange={(e) =>
                  setNewConn((p) => ({
                    ...p,
                    action: e.target.value as BlockAction,
                  }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {BLOCK_ACTIONS.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddConnection}
                disabled={!newConn.sourceBlockId || !newConn.targetBlockId}
                className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                Add Connection
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing connections */}
        {connections.length === 0 && !isAdding && (
          <p className="text-xs text-slate-500 italic">
            No connections yet. Use the Add button to create IFTTT-style block
            logic.
          </p>
        )}

        {connections.map((conn) => (
          <div
            key={conn.id}
            className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-blue-300 truncate">
                  {getBlockLabel(conn.sourceBlockId)}
                </span>
                <ArrowRight
                  size={10}
                  className="text-slate-500 flex-shrink-0"
                />
                <span className="text-emerald-300 truncate">
                  {getBlockLabel(conn.targetBlockId)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                on{' '}
                <span className="text-amber-400 font-mono">{conn.event}</span> →{' '}
                <span className="text-purple-400 font-mono">{conn.action}</span>
              </p>
            </div>
            <button
              onClick={() => handleDeleteConnection(conn.id)}
              className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
              title="Delete connection"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

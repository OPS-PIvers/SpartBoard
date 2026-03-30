import React, { useState } from 'react';
import { CustomGridDefinition, BlockConnection, BlockAction } from '@/types';
import {
  BLOCK_EVENTS as BLOCK_EVENTS_MAP,
  BLOCK_ACTIONS as BLOCK_ACTIONS_MAP,
  BlockEventDefinition,
} from '@/components/widgets/CustomWidget/types';
import { Link2, Plus, Trash2, Sparkles } from 'lucide-react';

interface ConnectionsTabProps {
  gridDefinition: CustomGridDefinition;
  onChange: (grid: CustomGridDefinition) => void;
}

const eventDefMap = new Map<string, BlockEventDefinition>();
Object.values(BLOCK_EVENTS_MAP).forEach((defs) =>
  defs.forEach((d) => {
    if (!eventDefMap.has(d.id)) eventDefMap.set(d.id, d);
  })
);
const ALL_EVENT_DEFS = Array.from(eventDefMap.values()).sort((a, b) =>
  a.id.localeCompare(b.id)
);

const allActionSet = new Set<string>();
Object.values(BLOCK_ACTIONS_MAP).forEach((actions) =>
  actions.forEach((a) => allActionSet.add(a))
);
(['reset-all', 'play-sound', 'show-toast'] as const).forEach((a) =>
  allActionSet.add(a)
);
const BLOCK_ACTIONS = Array.from(allActionSet).sort() as BlockAction[];

const PAYLOAD_ACTIONS: BlockAction[] = [
  'set-text',
  'set-image',
  'show-toast',
  'set-traffic',
];
const VALUE_ACTIONS: BlockAction[] = [
  'set-value',
  'increment',
  'decrement',
  'add-score',
  'check-item',
];

interface NewConnForm {
  sourceBlockId: string;
  eventBase: string;
  eventN: number;
  targetBlockId: string;
  action: BlockAction;
  actionPayload: string;
  actionValue: number;
  hasCondition: boolean;
  conditionWatchBlockId: string;
  conditionOperator: 'gte' | 'lte' | 'eq' | 'neq';
  conditionValue: number;
}

const BLANK_FORM: NewConnForm = {
  sourceBlockId: '',
  eventBase: 'on-click',
  eventN: 1,
  targetBlockId: '',
  action: 'show',
  actionPayload: '',
  actionValue: 1,
  hasCondition: false,
  conditionWatchBlockId: '',
  conditionOperator: 'gte',
  conditionValue: 0,
};

const selectCls =
  'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500';
const inputCls =
  'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500';

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  gridDefinition,
  onChange,
}) => {
  const { cells, connections } = gridDefinition;
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<NewConnForm>(BLANK_FORM);

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

  const selectedEventDef = eventDefMap.get(form.eventBase);
  const eventRequiresN = selectedEventDef?.requiresNumber ?? false;
  const concreteEvent = eventRequiresN
    ? `${form.eventBase}-${form.eventN}`
    : form.eventBase;

  const handleAdd = () => {
    if (!form.sourceBlockId || !form.targetBlockId || !form.action) return;

    const conn: BlockConnection = {
      id: crypto.randomUUID(),
      sourceBlockId: form.sourceBlockId,
      event: concreteEvent,
      targetBlockId: form.targetBlockId,
      action: form.action,
      ...(PAYLOAD_ACTIONS.includes(form.action) && form.actionPayload
        ? { actionPayload: form.actionPayload }
        : {}),
      ...(VALUE_ACTIONS.includes(form.action) && form.actionValue !== 0
        ? { actionValue: form.actionValue }
        : {}),
      ...(form.hasCondition && form.conditionWatchBlockId
        ? {
            condition: {
              watchBlockId: form.conditionWatchBlockId,
              operator: form.conditionOperator,
              value: form.conditionValue,
            },
          }
        : {}),
    };

    onChange({ ...gridDefinition, connections: [...connections, conn] });
    setIsAdding(false);
    setForm(BLANK_FORM);
  };

  const handleDelete = (id: string) => {
    onChange({
      ...gridDefinition,
      connections: connections.filter((c) => c.id !== id),
    });
  };

  const getBlockLabel = (blockId: string) =>
    namedBlocks.find((b) => b.id === blockId)?.label ?? blockId;

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">
            Interactive Rules
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
          New Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2.5">
          <p className="text-[11px] text-slate-400">
            Think of this as: “
            <span className="text-slate-200">When this happens</span>,{' '}
            <span className="text-slate-200">do this</span>.”
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Example: “When Button A is clicked, increase Counter B by 1.”
          </p>
        </div>

        {namedBlocks.length < 2 && (
          <p className="text-xs text-slate-500 italic">
            Add at least two blocks to the grid to create rules.
          </p>
        )}

        {isAdding && namedBlocks.length >= 2 && (
          <div className="bg-slate-900 border border-blue-700 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-400">Rule Builder</p>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                1) When this block...
              </label>
              <select
                value={form.sourceBlockId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sourceBlockId: e.target.value }))
                }
                className={selectCls}
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
              <label className="block text-xs text-slate-400">
                2) ...triggers this event
              </label>
              <div className="flex gap-2">
                <select
                  value={form.eventBase}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, eventBase: e.target.value }))
                  }
                  className={selectCls}
                >
                  {ALL_EVENT_DEFS.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.requiresNumber ? `${def.id}-N` : def.id}
                    </option>
                  ))}
                </select>
                {eventRequiresN && (
                  <input
                    type="number"
                    min={1}
                    value={form.eventN}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        eventN: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    title="Threshold value (N)"
                  />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                3) Affect this block
              </label>
              <select
                value={form.targetBlockId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, targetBlockId: e.target.value }))
                }
                className={selectCls}
              >
                <option value="">Select block...</option>
                {namedBlocks
                  .filter((b) => b.id !== form.sourceBlockId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                4) Then do this action
              </label>
              <select
                value={form.action}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    action: e.target.value as BlockAction,
                  }))
                }
                className={selectCls}
              >
                {BLOCK_ACTIONS.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            {PAYLOAD_ACTIONS.includes(form.action) && (
              <div className="space-y-1">
                <label className="block text-xs text-slate-400">
                  {form.action === 'set-traffic'
                    ? 'Traffic color'
                    : form.action === 'show-toast'
                      ? 'Toast message'
                      : 'Text value'}
                </label>
                <input
                  type="text"
                  value={form.actionPayload}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, actionPayload: e.target.value }))
                  }
                  placeholder={
                    form.action === 'set-traffic'
                      ? 'red | yellow | green'
                      : form.action === 'set-image'
                        ? 'https://example.com/image.png'
                        : form.action === 'show-toast'
                          ? 'Message to display'
                          : 'Text value'
                  }
                  aria-label={`Action payload for ${form.action}`}
                  className={inputCls}
                />
              </div>
            )}

            {VALUE_ACTIONS.includes(form.action) && (
              <div className="space-y-1">
                <label
                  htmlFor="action-value-input"
                  className="block text-xs text-slate-400"
                >
                  {form.action === 'increment' || form.action === 'decrement'
                    ? 'Step value'
                    : form.action === 'check-item'
                      ? 'Item index'
                      : 'Numeric value'}
                </label>
                <input
                  id="action-value-input"
                  type="number"
                  value={form.actionValue}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      actionValue: Number(e.target.value),
                    }))
                  }
                  aria-label={`Action value for ${form.action}`}
                  className={inputCls}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasCondition}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hasCondition: e.target.checked }))
                }
              />
              Add optional condition
            </label>

            {form.hasCondition && (
              <div className="mt-1 bg-slate-800 border border-slate-600 rounded p-2 space-y-1">
                <select
                  value={form.conditionWatchBlockId}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      conditionWatchBlockId: e.target.value,
                    }))
                  }
                  className={selectCls}
                >
                  <option value="">Watch block...</option>
                  {namedBlocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <select
                    value={form.conditionOperator}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        conditionOperator: e.target.value as
                          | 'gte'
                          | 'lte'
                          | 'eq'
                          | 'neq',
                      }))
                    }
                    className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="gte">≥ (gte)</option>
                    <option value="lte">≤ (lte)</option>
                    <option value="eq">= (eq)</option>
                    <option value="neq">≠ (neq)</option>
                  </select>
                  <input
                    type="number"
                    value={form.conditionValue}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        conditionValue: Number(e.target.value),
                      }))
                    }
                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={!form.sourceBlockId || !form.targetBlockId}
                className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                Save Rule
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setForm(BLANK_FORM);
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {connections.length === 0 && !isAdding && (
          <p className="text-xs text-slate-500 italic">
            No rules yet. Start with “New Rule” to create interactions.
          </p>
        )}

        {connections.map((conn) => (
          <div
            key={conn.id}
            className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-slate-200">
                <Sparkles size={12} className="text-amber-400" />
                <span className="truncate">
                  When <b>{getBlockLabel(conn.sourceBlockId)}</b> triggers{' '}
                  <b>{conn.event}</b>, then{' '}
                  <b>{getBlockLabel(conn.targetBlockId)}</b> does{' '}
                  <b>{conn.action}</b>
                </span>
              </div>
              {(conn.actionPayload != null || conn.actionValue != null) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Details: {conn.actionPayload ?? conn.actionValue}
                </p>
              )}
              {conn.condition && (
                <p className="text-xs text-slate-600 mt-0.5">
                  Only if {getBlockLabel(conn.condition.watchBlockId)}{' '}
                  {conn.condition.operator} {String(conn.condition.value)}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDelete(conn.id)}
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

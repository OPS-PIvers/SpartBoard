import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { PlcActionItem, PlcMember } from '@/types';
import {
  SortableList,
  type SortableListDragHandleProps,
} from '@/components/common/SortableList';
import { MAX_ACTION_ITEMS, newActionItem } from '@/utils/plcActionItems';
import {
  applyVisibleReorder,
  DEFAULT_ACTION_ITEM_VIEW,
  isActionItemOverdue,
  visibleActionItems,
  type ActionItemView,
} from '@/utils/plcActionItemView';
import { NoteActionItemsToolbar } from './NoteActionItemsToolbar';

interface NoteActionItemsProps {
  items: PlcActionItem[];
  members: PlcMember[];
  canEdit: boolean;
  onChange: (next: PlcActionItem[]) => void;
  currentUid: string;
}

/** Parse a `<input type="date">` value into ms at local midnight, or null. */
function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

/** Format ms as a `<input type="date">` value (local date), or ''. */
function msToDateInput(ms: number | null | undefined): string {
  if (ms == null) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Per-note action item list — checkbox, inline text, assignee, due date, and
 * remove per row, plus an "add" input. Shared by every note kind (§7.4).
 *
 * Rows drag to reorder, and the stored array order is that manual order. Sort
 * and filter are a view over it, local to whoever set them: dragging is
 * therefore offered only under "Manual order", where what the user drags is
 * what gets written. A drag while filtered still works — the moved row lands
 * among its visible neighbours and the hidden rows keep their slots.
 */
export const NoteActionItems: React.FC<NoteActionItemsProps> = ({
  items,
  members,
  canEdit,
  onChange,
  currentUid,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<ActionItemView>(DEFAULT_ACTION_ITEM_VIEW);
  // Lazy-init so `Date.now()` isn't called impurely during render (repo
  // pattern — see `YourActionItemsCard`); overdue rows don't need
  // second-precision freshness.
  const [now] = useState(() => Date.now());

  const nameFor = useCallback(
    (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? '',
    [members]
  );

  const visible = visibleActionItems(items, view, now, nameFor);
  const canDrag = canEdit && view.sort === 'manual';

  const updateItem = (id: string, patch: Partial<PlcActionItem>) => {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  const addItem = () => {
    const text = draft.trim();
    if (!text || items.length >= MAX_ACTION_ITEMS) return;
    onChange([...items, newActionItem(text, currentUid, Date.now())]);
    setDraft('');
  };

  const renderRow = (
    item: PlcActionItem,
    handle: SortableListDragHandleProps
  ) => {
    const overdue = isActionItemOverdue(item, now);
    return (
      <div className="flex items-center gap-2 py-0.5">
        {canEdit && (
          <button
            type="button"
            {...(canDrag ? handle.attributes : {})}
            {...(canDrag ? handle.listeners : {})}
            disabled={!canDrag}
            aria-label={t('plcDashboard.notes.actionItems.view.reorder', {
              defaultValue: 'Reorder action item',
            })}
            title={
              canDrag
                ? undefined
                : t('plcDashboard.notes.actionItems.view.dragHint', {
                    defaultValue: 'Switch to manual order to drag',
                  })
            }
            className={`shrink-0 p-0.5 rounded text-slate-300 transition-colors ${
              canDrag
                ? 'cursor-grab hover:text-slate-500'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          type="checkbox"
          checked={item.done}
          disabled={!canEdit}
          onChange={(e) =>
            updateItem(item.id, {
              done: e.target.checked,
              doneAt: e.target.checked ? Date.now() : null,
            })
          }
          aria-label={
            item.done
              ? t('plcDashboard.notes.actionItems.markOpen', {
                  defaultValue: 'Mark open',
                })
              : t('plcDashboard.notes.actionItems.markDone', {
                  defaultValue: 'Mark done',
                })
          }
          className="shrink-0 h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
        />
        <input
          type="text"
          value={item.text}
          readOnly={!canEdit}
          onChange={(e) => updateItem(item.id, { text: e.target.value })}
          className={`flex-1 min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm ${
            item.done ? 'line-through text-slate-400' : 'text-slate-700'
          }`}
        />
        {canEdit ? (
          <select
            value={item.assigneeUid ?? ''}
            onChange={(e) =>
              updateItem(item.id, {
                assigneeUid: e.target.value || null,
              })
            }
            aria-label={t('plcDashboard.notes.actionItems.assignee', {
              defaultValue: 'Assignee',
            })}
            className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xxs text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          >
            <option value="">
              {t('plcDashboard.notes.actionItems.unassigned', {
                defaultValue: 'Unassigned',
              })}
            </option>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.displayName}
              </option>
            ))}
          </select>
        ) : (
          item.assigneeUid && (
            <span className="shrink-0 text-xxs text-slate-400">
              {nameFor(item.assigneeUid)}
            </span>
          )
        )}
        <input
          type="date"
          value={msToDateInput(item.dueAt)}
          disabled={!canEdit}
          onChange={(e) =>
            updateItem(item.id, {
              dueAt: dateInputToMs(e.target.value),
            })
          }
          aria-label={t('plcDashboard.notes.actionItems.dueDate', {
            defaultValue: 'Due date',
          })}
          className={`shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xxs focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 ${
            overdue ? 'text-amber-600 font-semibold' : 'text-slate-600'
          }`}
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            aria-label={t('plcDashboard.notes.actionItems.remove', {
              defaultValue: 'Remove action item',
            })}
            className="shrink-0 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-0 px-4 py-3 border-t border-slate-100">
      <h4 className="shrink-0 text-xxs font-bold uppercase tracking-widest text-slate-500 mb-2">
        {t('plcDashboard.notes.actionItems.title', {
          defaultValue: 'Action items',
        })}
      </h4>
      {items.length > 0 && (
        <NoteActionItemsToolbar
          view={view}
          onChange={setView}
          members={members}
          visibleCount={visible.length}
          totalCount={items.length}
        />
      )}
      {/* Scrolls once the list outgrows the editor pane so the add row stays reachable. */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mx-1 px-1">
        <SortableList
          items={visible}
          getId={(item) => item.id}
          onReorder={(next) => onChange(applyVisibleReorder(items, next))}
          renderItem={renderRow}
          className="space-y-1"
        />
        {items.length > 0 && visible.length === 0 && (
          <p className="text-xxs text-slate-400 py-1">
            {t('plcDashboard.notes.actionItems.view.noMatches', {
              defaultValue: 'No action items match these filters',
            })}
          </p>
        )}
      </div>
      {canEdit &&
        (items.length < MAX_ACTION_ITEMS ? (
          <div className="shrink-0 flex items-center gap-2 mt-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder={t('plcDashboard.notes.actionItems.addPlaceholder', {
                defaultValue: 'What needs to happen?',
              })}
              className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            />
            <button
              type="button"
              onClick={addItem}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
            >
              <Plus className="w-3 h-3" />
              {t('plcDashboard.notes.actionItems.add', {
                defaultValue: 'Add action item',
              })}
            </button>
          </div>
        ) : (
          <p className="shrink-0 text-xxs text-slate-400 mt-2">
            {t('plcDashboard.notes.actionItems.limitReached', {
              defaultValue: 'Action item limit reached',
            })}
          </p>
        ))}
    </div>
  );
};

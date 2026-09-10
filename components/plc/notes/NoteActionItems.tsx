import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { PlcActionItem, PlcMember } from '@/types';
import { MAX_ACTION_ITEMS, newActionItem } from '@/utils/plcActionItems';

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
  // Lazy-init so `Date.now()` isn't called impurely during render (repo
  // pattern — see `YourActionItemsCard`); overdue rows don't need
  // second-precision freshness.
  const [now] = useState(() => Date.now());

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

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500 mb-2">
        {t('plcDashboard.notes.actionItems.title', {
          defaultValue: 'Action items',
        })}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const overdue = !item.done && item.dueAt != null && item.dueAt < now;
          return (
            <li key={item.id} className="flex items-center gap-2">
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
                    {members.find((m) => m.uid === item.assigneeUid)
                      ?.displayName ?? ''}
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
            </li>
          );
        })}
      </ul>
      {canEdit &&
        (items.length < MAX_ACTION_ITEMS ? (
          <div className="flex items-center gap-2 mt-2">
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
          <p className="text-xxs text-slate-400 mt-2">
            {t('plcDashboard.notes.actionItems.limitReached', {
              defaultValue: 'Action item limit reached',
            })}
          </p>
        ))}
    </div>
  );
};

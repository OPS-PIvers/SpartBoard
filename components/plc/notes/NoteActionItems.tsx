import React, { useCallback, useRef, useState } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  GripVertical,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
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
  /** Side panel: no heading, and assignee and due date sit under the text. */
  panel?: boolean;
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

const formatDue = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

/** Due date shown as plain text; clicking it opens the browser's date picker. */
const DueDateText: React.FC<{
  dueAt: number | null;
  overdue: boolean;
  canEdit: boolean;
  onChange: (dueAt: number | null) => void;
}> = ({ dueAt, overdue, canEdit, onChange }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const label = t('plcDashboard.notes.actionItems.dueDate', {
    defaultValue: 'Due date',
  });
  const text =
    dueAt == null
      ? label
      : overdue
        ? `${t('plcDashboard.notes.actionItems.view.dueOverdue', {
            defaultValue: 'Overdue',
          })} ${formatDue(dueAt)}`
        : formatDue(dueAt);
  const tone =
    dueAt == null
      ? 'text-slate-400'
      : overdue
        ? 'text-amber-700 font-semibold'
        : 'text-slate-600';
  return (
    <span className="relative inline-flex shrink-0 items-center gap-1 text-xs">
      <CalendarDays className="w-3.5 h-3.5 text-slate-400" aria-hidden />
      {canEdit ? (
        <>
          <button
            type="button"
            onClick={() => {
              try {
                inputRef.current?.showPicker();
              } catch {
                inputRef.current?.focus();
              }
            }}
            aria-label={label}
            className={`rounded hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${tone}`}
          >
            {text}
          </button>
          <input
            ref={inputRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={msToDateInput(dueAt)}
            onChange={(e) => onChange(dateInputToMs(e.target.value))}
            className="absolute left-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
          />
        </>
      ) : (
        <span className={tone}>{text}</span>
      )}
    </span>
  );
};

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
  panel = false,
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

    const leadControls = (
      <>
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
        {panel ? (
          <textarea
            rows={1}
            value={item.text}
            readOnly={!canEdit}
            onChange={(e) =>
              updateItem(item.id, { text: e.target.value.replace(/\n/g, ' ') })
            }
            className={`flex-1 min-w-0 p-0 bg-transparent border-0 resize-none [field-sizing:content] focus:ring-0 focus:outline-none text-sm leading-snug ${
              item.done ? 'line-through text-slate-400' : 'text-slate-700'
            }`}
          />
        ) : (
          <input
            type="text"
            value={item.text}
            readOnly={!canEdit}
            onChange={(e) => updateItem(item.id, { text: e.target.value })}
            className={`flex-1 min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm ${
              item.done ? 'line-through text-slate-400' : 'text-slate-700'
            }`}
          />
        )}
      </>
    );
    const metaControls = (
      <>
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
      </>
    );
    const panelMeta = (
      <>
        <span className="relative inline-flex min-w-0 items-center gap-1 text-xs text-slate-500">
          <UserRound
            className="w-3.5 h-3.5 shrink-0 text-slate-400"
            aria-hidden
          />
          {canEdit ? (
            <select
              value={item.assigneeUid ?? ''}
              onChange={(e) =>
                updateItem(item.id, { assigneeUid: e.target.value || null })
              }
              aria-label={t('plcDashboard.notes.actionItems.assignee', {
                defaultValue: 'Assignee',
              })}
              className={`w-32 truncate appearance-none bg-none bg-transparent border-0 p-0 text-xs cursor-pointer rounded hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
                item.assigneeUid ? 'text-slate-600' : 'text-slate-400'
              }`}
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
            <span
              className={item.assigneeUid ? 'text-slate-600' : 'text-slate-400'}
            >
              {item.assigneeUid
                ? nameFor(item.assigneeUid)
                : t('plcDashboard.notes.actionItems.unassigned', {
                    defaultValue: 'Unassigned',
                  })}
            </span>
          )}
        </span>
        <DueDateText
          dueAt={item.dueAt ?? null}
          overdue={overdue}
          canEdit={canEdit}
          onChange={(dueAt) => updateItem(item.id, { dueAt })}
        />
      </>
    );
    const removeControl = (
      <>
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
      </>
    );
    if (panel) {
      return (
        <div className="group/row py-2">
          <div className="flex items-start gap-2 [&>button:first-child]:mt-0.5 [&>input[type=checkbox]]:mt-0.5">
            {leadControls}
            <span className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
              {removeControl}
            </span>
          </div>
          <div
            className={`flex items-center gap-4 mt-1 ${canEdit ? 'pl-11' : 'pl-6'}`}
          >
            {panelMeta}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 py-0.5">
        {leadControls}
        {metaControls}
        {removeControl}
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col min-h-0 px-4 py-3 ${
        panel ? 'flex-1' : 'border-t border-slate-100'
      }`}
    >
      {!panel && (
        <h4 className="shrink-0 text-xxs font-bold uppercase tracking-widest text-slate-500 mb-2">
          {t('plcDashboard.notes.actionItems.title', {
            defaultValue: 'Action items',
          })}
        </h4>
      )}
      {items.length > 0 && (
        <NoteActionItemsToolbar
          view={view}
          onChange={setView}
          members={members}
          visibleCount={visible.length}
          totalCount={items.length}
          quiet={panel}
        />
      )}
      {/* Scrolls once the list outgrows the editor pane so the add row stays reachable. */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mx-1 px-1">
        <SortableList
          items={visible}
          getId={(item) => item.id}
          onReorder={(next) => onChange(applyVisibleReorder(items, next))}
          renderItem={renderRow}
          className={panel ? 'divide-y divide-slate-100' : 'space-y-1'}
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
              {...tourAttr('plc-notes.action-text')}
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
              {...tourAttr('plc-notes.add-action')}
              type="button"
              onClick={addItem}
              aria-label={
                panel
                  ? t('plcDashboard.notes.actionItems.add', {
                      defaultValue: 'Add action item',
                    })
                  : undefined
              }
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
            >
              <Plus className={panel ? 'w-4 h-4' : 'w-3 h-3'} />
              {!panel &&
                t('plcDashboard.notes.actionItems.add', {
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

// Note action items as hairline rows: complete circle, text, then assignee and due date (TEAMS_REDESIGN T14).

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import type { PlcActionItem, PlcMember } from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { META } from '@/components/plc/redesignMockup/ui';
import { MAX_ACTION_ITEMS, newActionItem } from '@/utils/plcActionItems';
import { formatShortDate, fromDateInput, toDateInput } from './noteFormat';

const DueControl: React.FC<{
  dueAt: number | null;
  canEdit: boolean;
  onChange: (dueAt: number | null) => void;
}> = ({ dueAt, canEdit, onChange }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const text =
    dueAt == null
      ? t('plcDashboard.notes.actionItems.dueDate', {
          defaultValue: 'Due date',
        })
      : t('teams.notes.actionItems.due', {
          defaultValue: 'due {{date}}',
          date: formatShortDate(dueAt),
        });
  if (!canEdit) return dueAt == null ? null : <span>{text}</span>;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          try {
            ref.current?.showPicker();
          } catch {
            ref.current?.focus();
          }
        }}
        className={`rounded hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${dueAt == null ? 'text-slate-400' : ''}`}
      >
        {text}
      </button>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={toDateInput(dueAt)}
        onChange={(e) => onChange(fromDateInput(e.target.value))}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
    </span>
  );
};

export const TeamActionItemList: React.FC<{
  items: PlcActionItem[];
  members: Pick<PlcMember, 'uid' | 'displayName'>[];
  canEdit: boolean;
  currentUid: string;
  onChange?: (next: PlcActionItem[]) => void;
}> = ({ items, members, canEdit, currentUid, onChange }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const editable = canEdit && !!onChange;
  const nameFor = (uid: string | null | undefined) =>
    (uid ? members.find((m) => m.uid === uid)?.displayName : undefined) ?? null;
  const update = (id: string, patch: Partial<PlcActionItem>) =>
    onChange?.(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = () => {
    const text = draft.trim();
    if (!text || !onChange || items.length >= MAX_ACTION_ITEMS) return;
    onChange([...items, newActionItem(text, currentUid, Date.now())]);
    setDraft('');
  };
  const unassigned = t('plcDashboard.notes.actionItems.unassigned', {
    defaultValue: 'Unassigned',
  });

  return (
    <div>
      <ul
        aria-label={t('plcDashboard.notes.actionItems.title', {
          defaultValue: 'Action items',
        })}
        className="divide-y divide-slate-100"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="group/row flex items-center gap-3 py-2.5"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.text}
              disabled={!editable}
              onClick={() =>
                update(item.id, {
                  done: !item.done,
                  doneAt: item.done ? null : Date.now(),
                })
              }
              className={`shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-default ${
                item.done
                  ? 'text-emerald-500'
                  : 'text-slate-300 enabled:hover:text-emerald-500'
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              {editable ? (
                <input
                  type="text"
                  value={item.text}
                  aria-label={t('plcDashboard.notes.actionItems.title', {
                    defaultValue: 'Action items',
                  })}
                  onChange={(e) => update(item.id, { text: e.target.value })}
                  className={`block w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0 ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                />
              ) : (
                <p
                  className={`break-words text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                >
                  {item.text}
                </p>
              )}
              <p
                className={`${META} mt-0.5 flex flex-wrap items-center gap-x-1`}
              >
                {editable ? (
                  <select
                    value={item.assigneeUid ?? ''}
                    onChange={(e) =>
                      update(item.id, { assigneeUid: e.target.value || null })
                    }
                    aria-label={t('plcDashboard.notes.actionItems.assignee', {
                      defaultValue: 'Assignee',
                    })}
                    className={`appearance-none border-0 bg-transparent bg-none p-0 text-xs [field-sizing:content] hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${item.assigneeUid ? '' : 'text-slate-400'}`}
                  >
                    <option value="">{unassigned}</option>
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{nameFor(item.assigneeUid) ?? unassigned}</span>
                )}
                {(editable || item.dueAt != null) && (
                  <span aria-hidden="true">·</span>
                )}
                <DueControl
                  dueAt={item.dueAt ?? null}
                  canEdit={editable}
                  onChange={(dueAt) => update(item.id, { dueAt })}
                />
              </p>
            </div>
            {editable && (
              <span className="opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label={t('plcDashboard.notes.actionItems.remove', {
                    defaultValue: 'Remove action item',
                  })}
                  size="sm"
                  onClick={() =>
                    onChange?.(items.filter((i) => i.id !== item.id))
                  }
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {editable && items.length < MAX_ACTION_ITEMS && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={t('plcDashboard.notes.actionItems.addPlaceholder', {
            defaultValue: 'What needs to happen?',
          })}
          aria-label={t('plcDashboard.notes.actionItems.add', {
            defaultValue: 'Add action item',
          })}
          className="mt-1 block w-full border-0 border-t border-slate-100 bg-transparent px-7 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      )}
    </div>
  );
};

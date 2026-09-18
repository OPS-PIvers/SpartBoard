import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { PlcMember } from '@/types';
import {
  DEFAULT_ACTION_ITEM_VIEW,
  isDefaultActionItemView,
  type ActionItemDueFilter,
  type ActionItemSort,
  type ActionItemStatusFilter,
  type ActionItemView,
} from '@/utils/plcActionItemView';

interface NoteActionItemsToolbarProps {
  view: ActionItemView;
  onChange: (next: ActionItemView) => void;
  members: PlcMember[];
  visibleCount: number;
  totalCount: number;
}

const SELECT_CLASS =
  'shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xxs text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

/**
 * Sort + filter controls above a note's action-item list. The view is local to
 * the open editor — nothing here is persisted, so one member's filter never
 * changes what a teammate sees.
 */
export const NoteActionItemsToolbar: React.FC<NoteActionItemsToolbarProps> = ({
  view,
  onChange,
  members,
  visibleCount,
  totalCount,
}) => {
  const { t } = useTranslation();

  const sortOptions: Array<{ value: ActionItemSort; label: string }> = [
    {
      value: 'manual',
      label: t('plcDashboard.notes.actionItems.view.sortManual', {
        defaultValue: 'Manual order',
      }),
    },
    {
      value: 'status',
      label: t('plcDashboard.notes.actionItems.view.sortStatus', {
        defaultValue: 'Open first',
      }),
    },
    {
      value: 'due',
      label: t('plcDashboard.notes.actionItems.view.sortDue', {
        defaultValue: 'Due date',
      }),
    },
    {
      value: 'assignee',
      label: t('plcDashboard.notes.actionItems.view.sortAssignee', {
        defaultValue: 'Assignee',
      }),
    },
    {
      value: 'created',
      label: t('plcDashboard.notes.actionItems.view.sortCreated', {
        defaultValue: 'Newest first',
      }),
    },
    {
      value: 'text',
      label: t('plcDashboard.notes.actionItems.view.sortText', {
        defaultValue: 'A–Z',
      }),
    },
  ];

  const statusOptions: Array<{ value: ActionItemStatusFilter; label: string }> =
    [
      {
        value: 'all',
        label: t('plcDashboard.notes.actionItems.view.statusAll', {
          defaultValue: 'Any status',
        }),
      },
      {
        value: 'open',
        label: t('plcDashboard.notes.actionItems.view.statusOpen', {
          defaultValue: 'Open',
        }),
      },
      {
        value: 'done',
        label: t('plcDashboard.notes.actionItems.view.statusDone', {
          defaultValue: 'Done',
        }),
      },
    ];

  const dueOptions: Array<{ value: ActionItemDueFilter; label: string }> = [
    {
      value: 'all',
      label: t('plcDashboard.notes.actionItems.view.dueAll', {
        defaultValue: 'Any due date',
      }),
    },
    {
      value: 'overdue',
      label: t('plcDashboard.notes.actionItems.view.dueOverdue', {
        defaultValue: 'Overdue',
      }),
    },
    {
      value: 'today',
      label: t('plcDashboard.notes.actionItems.view.dueToday', {
        defaultValue: 'Due today',
      }),
    },
    {
      value: 'week',
      label: t('plcDashboard.notes.actionItems.view.dueWeek', {
        defaultValue: 'Next 7 days',
      }),
    },
    {
      value: 'none',
      label: t('plcDashboard.notes.actionItems.view.dueNone', {
        defaultValue: 'No due date',
      }),
    },
  ];

  const filtered = visibleCount !== totalCount;

  return (
    <div className="shrink-0 flex items-center flex-wrap gap-1.5 mb-2">
      <select
        value={view.sort}
        onChange={(e) =>
          onChange({ ...view, sort: e.target.value as ActionItemSort })
        }
        aria-label={t('plcDashboard.notes.actionItems.view.sortLabel', {
          defaultValue: 'Sort action items',
        })}
        className={SELECT_CLASS}
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={view.status}
        onChange={(e) =>
          onChange({
            ...view,
            status: e.target.value as ActionItemStatusFilter,
          })
        }
        aria-label={t('plcDashboard.notes.actionItems.view.statusLabel', {
          defaultValue: 'Filter by status',
        })}
        className={SELECT_CLASS}
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={view.due}
        onChange={(e) =>
          onChange({ ...view, due: e.target.value as ActionItemDueFilter })
        }
        aria-label={t('plcDashboard.notes.actionItems.view.dueLabel', {
          defaultValue: 'Filter by due date',
        })}
        className={SELECT_CLASS}
      >
        {dueOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={view.assignee}
        onChange={(e) => onChange({ ...view, assignee: e.target.value })}
        aria-label={t('plcDashboard.notes.actionItems.view.assigneeLabel', {
          defaultValue: 'Filter by assignee',
        })}
        className={SELECT_CLASS}
      >
        <option value="all">
          {t('plcDashboard.notes.actionItems.view.assigneeAll', {
            defaultValue: 'Anyone',
          })}
        </option>
        <option value="unassigned">
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
      {filtered && (
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.notes.actionItems.view.showing', {
            defaultValue: 'Showing {{visible}} of {{total}}',
            visible: visibleCount,
            total: totalCount,
          })}
        </span>
      )}
      {!isDefaultActionItemView(view) && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_ACTION_ITEM_VIEW)}
          className="inline-flex items-center gap-0.5 px-1.5 py-1 text-xxs font-semibold text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
        >
          <X className="w-3 h-3" />
          {t('plcDashboard.notes.actionItems.view.clear', {
            defaultValue: 'Reset',
          })}
        </button>
      )}
    </div>
  );
};

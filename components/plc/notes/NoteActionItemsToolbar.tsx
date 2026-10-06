import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Check, ChevronDown, ListFilter, X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
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
  /** Side panel: one Sort menu and one Filter menu on a single line. */
  quiet?: boolean;
}

const BOXED_SELECT_CLASS =
  'shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xxs text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';
const MENU_BUTTON_CLASS =
  'inline-flex items-center gap-1 px-1.5 py-1 rounded-md whitespace-nowrap text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40';

interface MenuSection {
  heading?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
}

/** A button that opens a checklist menu; picking a row keeps the menu open. */
const ToolbarMenu: React.FC<{
  icon: typeof ArrowUpDown;
  label: string;
  ariaLabel: string;
  sections: MenuSection[];
}> = ({ icon: Icon, label, ariaLabel, sections }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={MENU_BUTTON_CLASS}
      >
        <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        {label}
        <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-20 max-h-80 overflow-y-auto custom-scrollbar py-1 pb-2 bg-white border border-slate-200 rounded-xl shadow-lg"
        >
          {sections.map((section, i) => (
            <div
              key={section.heading ?? i}
              className={i > 0 ? 'mt-1 pt-1 border-t border-slate-100' : ''}
            >
              {section.heading && (
                <div className="px-3 pt-1.5 pb-1 text-xxs font-bold uppercase tracking-widest text-slate-400">
                  {section.heading}
                </div>
              )}
              {section.options.map((o) => {
                const checked = o.value === section.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    onClick={() => section.onSelect(o.value)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Check
                      className={`w-3.5 h-3.5 shrink-0 text-brand-blue-primary ${checked ? '' : 'invisible'}`}
                      aria-hidden
                    />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  quiet = false,
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

  const resetButton = !isDefaultActionItemView(view) && (
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
  );

  if (quiet) {
    const assigneeOptions = [
      {
        value: 'all',
        label: t('plcDashboard.notes.actionItems.view.assigneeAll', {
          defaultValue: 'Anyone',
        }),
      },
      {
        value: 'unassigned',
        label: t('plcDashboard.notes.actionItems.unassigned', {
          defaultValue: 'Unassigned',
        }),
      },
      ...members.map((m) => ({ value: m.uid, label: m.displayName })),
    ];
    const activeFilters =
      (view.status !== 'all' ? 1 : 0) +
      (view.due !== 'all' ? 1 : 0) +
      (view.assignee !== 'all' ? 1 : 0);
    const filterWord = t('plcDashboard.notes.actionItems.view.filter', {
      defaultValue: 'Filter',
    });
    return (
      <div className="relative shrink-0 flex items-center gap-1 -mx-1.5 mb-1 pb-2 border-b border-slate-100">
        <ToolbarMenu
          icon={ArrowUpDown}
          label={sortOptions.find((o) => o.value === view.sort)?.label ?? ''}
          ariaLabel={t('plcDashboard.notes.actionItems.view.sortLabel', {
            defaultValue: 'Sort action items',
          })}
          sections={[
            {
              options: sortOptions,
              value: view.sort,
              onSelect: (v) => onChange({ ...view, sort: v as ActionItemSort }),
            },
          ]}
        />
        <ToolbarMenu
          icon={ListFilter}
          label={activeFilters ? `${filterWord} ${activeFilters}` : filterWord}
          ariaLabel={filterWord}
          sections={[
            {
              heading: t('plcDashboard.notes.actionItems.view.statusHeading', {
                defaultValue: 'Status',
              }),
              options: statusOptions,
              value: view.status,
              onSelect: (v) =>
                onChange({ ...view, status: v as ActionItemStatusFilter }),
            },
            {
              heading: t('plcDashboard.notes.actionItems.dueDate', {
                defaultValue: 'Due date',
              }),
              options: dueOptions,
              value: view.due,
              onSelect: (v) =>
                onChange({ ...view, due: v as ActionItemDueFilter }),
            },
            {
              heading: t('plcDashboard.notes.actionItems.assignee', {
                defaultValue: 'Assignee',
              }),
              options: assigneeOptions,
              value: view.assignee,
              onSelect: (v) => onChange({ ...view, assignee: v }),
            },
          ]}
        />
        <div className="ml-auto">{resetButton}</div>
      </div>
    );
  }

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
        className={BOXED_SELECT_CLASS}
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
        className={BOXED_SELECT_CLASS}
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
        className={BOXED_SELECT_CLASS}
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
        className={BOXED_SELECT_CLASS}
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
      {resetButton}
    </div>
  );
};

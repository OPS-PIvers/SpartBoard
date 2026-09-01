// AssignmentsHubModal — central Assignments hub (spec §5 D1, Decision 13); LIST (left, filterable) + DETAIL (right, placeholder — filled in by D2).

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  FileQuestion,
  Film,
  Compass,
  Blocks,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { AssignmentDetailPane } from './AssignmentDetailPane';
import {
  AssignmentFilterSelect,
  type AssignmentFilterOption,
} from './AssignmentFilterSelect';
import {
  useUnifiedAssignments,
  type AssignmentKind,
  type UnifiedAssignmentRow,
  type UnifiedAssignmentStatus,
} from './useUnifiedAssignments';

interface AssignmentsHubModalProps {
  onClose: () => void;
}

const KIND_META: Record<
  AssignmentKind,
  { icon: typeof FileQuestion; labelKey: string; fallback: string }
> = {
  quiz: {
    icon: FileQuestion,
    labelKey: 'assignmentsHub.kind.quiz',
    fallback: 'Quiz',
  },
  'video-activity': {
    icon: Film,
    labelKey: 'assignmentsHub.kind.videoActivity',
    fallback: 'Video Activity',
  },
  'guided-learning': {
    icon: Compass,
    labelKey: 'assignmentsHub.kind.guidedLearning',
    fallback: 'Guided Learning',
  },
  'mini-app': {
    icon: Blocks,
    labelKey: 'assignmentsHub.kind.miniApp',
    fallback: 'Mini App',
  },
};

const KIND_ORDER: AssignmentKind[] = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
];

function formatWindowSummary(
  openAt: number | null | undefined,
  closeAt: number | null | undefined,
  t: (key: string, opts: Record<string, unknown>) => string
): string | null {
  if (openAt == null && closeAt == null) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  if (openAt != null && closeAt != null) {
    return t('assignmentsHub.windowBoth', {
      defaultValue: 'Opens {{open}} – Closes {{close}}',
      open: fmt(openAt),
      close: fmt(closeAt),
    });
  }
  if (openAt != null) {
    return t('assignmentsHub.windowOpenOnly', {
      defaultValue: 'Opens {{open}}',
      open: fmt(openAt),
    });
  }
  return t('assignmentsHub.windowCloseOnly', {
    defaultValue: 'Closes {{close}}',
    close: fmt(closeAt as number),
  });
}

const AssignmentRow: React.FC<{
  row: UnifiedAssignmentRow;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ row, isSelected, onSelect }) => {
  const { t } = useTranslation();
  const meta = KIND_META[row.kind];
  const Icon = meta.icon;
  const windowSummary = formatWindowSummary(row.openAt, row.closeAt, t);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
        isSelected
          ? 'border-brand-blue-primary bg-brand-blue-lighter/40'
          : 'border-transparent hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-800 truncate">
          {row.title}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-xs text-slate-500">
        <span>{t(meta.labelKey, { defaultValue: meta.fallback })}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{row.className}</span>
        {row.targetMode === 'students' && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {t('assignmentsHub.individualTag', {
                defaultValue: 'Individual',
              })}
            </span>
          </>
        )}
        {row.targetSkippedCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-brand-red-primary">
              {t('assignmentsHub.skippedCount', {
                defaultValue: '{{count}} skipped',
                count: row.targetSkippedCount,
              })}
            </span>
          </>
        )}
        {windowSummary && (
          <>
            <span aria-hidden="true">·</span>
            <span>{windowSummary}</span>
          </>
        )}
      </div>
    </button>
  );
};

const EmptyState: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
        <ClipboardList className="h-6 w-6 text-slate-400" aria-hidden="true" />
      </div>
      <p className="max-w-xs text-sm text-slate-600">
        {t('assignmentsHub.emptyBody', {
          defaultValue:
            'No assignments yet. Assign a quiz or activity from its editor to see it here.',
        })}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark transition-colors"
      >
        {t('assignmentsHub.emptyAction', { defaultValue: 'Go create one' })}
      </button>
    </div>
  );
};

export const AssignmentsHubModal: React.FC<AssignmentsHubModalProps> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { rosters } = useDashboard();
  const { rows, loading } = useUnifiedAssignments(user?.uid, rosters);

  const [search, setSearch] = useState('');
  // Empty arrays mean "no filter" for the two multi-selects.
  const [kindFilter, setKindFilter] = useState<AssignmentKind[]>([]);
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnifiedAssignmentStatus[]>(
    []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(event)) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const classNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.className))).sort(),
    [rows]
  );

  const hasPausableKind = useMemo(
    () => rows.some((r) => r.kind === 'quiz' || r.kind === 'video-activity'),
    [rows]
  );

  // Drop selections whose option has disappeared (roster renamed, last quiz
  // deleted) so a stale filter can't silently empty the list.
  const activeClassFilter = useMemo(
    () => classFilter.filter((name) => classNames.includes(name)),
    [classFilter, classNames]
  );
  const activeStatusFilter = useMemo(
    () => statusFilter.filter((s) => s !== 'paused' || hasPausableKind),
    [statusFilter, hasPausableKind]
  );

  const searchTerm = search.trim().toLowerCase();

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (kindFilter.length === 0 || kindFilter.includes(row.kind)) &&
          (activeClassFilter.length === 0 ||
            activeClassFilter.includes(row.className)) &&
          (activeStatusFilter.length === 0 ||
            activeStatusFilter.includes(row.status)) &&
          (searchTerm === '' ||
            row.title.toLowerCase().includes(searchTerm) ||
            row.className.toLowerCase().includes(searchTerm))
      ),
    [rows, kindFilter, activeClassFilter, activeStatusFilter, searchTerm]
  );

  const kindOptions: AssignmentFilterOption[] = KIND_ORDER.map((kind) => ({
    value: kind,
    label: t(KIND_META[kind].labelKey, {
      defaultValue: KIND_META[kind].fallback,
    }),
  }));

  const classOptions: AssignmentFilterOption[] = classNames.map((name) => ({
    value: name,
    label: name,
  }));

  const statusOptions: AssignmentFilterOption[] = (
    [
      ['active', 'assignmentsHub.statusActive', 'Active'],
      ['paused', 'assignmentsHub.statusPaused', 'Paused'],
      ['inactive', 'assignmentsHub.statusInactive', 'Inactive'],
    ] as const
  )
    .filter(([value]) => value !== 'paused' || hasPausableKind)
    .map(([value, key, fallback]) => ({
      value,
      label: t(key, { defaultValue: fallback }),
    }));

  /** Trigger text: the sole selection's label, or an "N selected" roll-up. */
  const summarize = (
    selected: string[],
    options: AssignmentFilterOption[],
    prefixKey: string,
    prefixFallback: string,
    allLabel: string
  ): string => {
    if (selected.length === 0) return allLabel;
    const value =
      selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : t('assignmentsHub.filterSelectedCount', {
            defaultValue: '{{count}} selected',
            count: selected.length,
          });
    return t(prefixKey, { defaultValue: prefixFallback, value });
  };

  const allTypesLabel = t('assignmentsHub.filterAllTypes', {
    defaultValue: 'All types',
  });
  const allClassesLabel = t('assignmentsHub.filterAllClasses', {
    defaultValue: 'All classes',
  });
  const anyStatusLabel = t('assignmentsHub.filterAllStatuses', {
    defaultValue: 'Any status',
  });

  const hasActiveFilter =
    searchTerm !== '' ||
    kindFilter.length > 0 ||
    activeClassFilter.length > 0 ||
    activeStatusFilter.length > 0;

  const clearFilters = () => {
    setSearch('');
    setKindFilter([]);
    setClassFilter([]);
    setStatusFilter([]);
  };

  const selectedRow =
    filteredRows.find((r) => r.id === selectedId) ??
    rows.find((r) => r.id === selectedId) ??
    null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignments-hub-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full h-full md:h-[85vh] md:max-h-[720px] md:max-w-5xl bg-white md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList
              className="w-4 h-4 text-slate-400 shrink-0"
              aria-hidden="true"
            />
            <h2
              id="assignments-hub-title"
              className="text-lg font-bold text-slate-800 truncate"
            >
              {t('assignmentsHub.title', { defaultValue: 'Assignments' })}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 md:p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0 text-slate-500"
            aria-label={t('assignmentsHub.close', {
              defaultValue: 'Close assignments',
            })}
          >
            <X className="w-6 h-6 md:w-5 md:h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: filters + list */}
          {/* No overflow-hidden here — the filter dropdowns overlay the list. */}
          <div className="w-full md:w-[380px] shrink-0 border-r border-slate-200 flex flex-col min-h-0">
            <div className="relative z-10 p-3 border-b border-slate-100 flex flex-col gap-2">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  // Escape clears the box instead of bubbling to the hub's
                  // document handler and closing the whole modal.
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape' || search === '') return;
                    e.preventDefault();
                    e.stopPropagation();
                    setSearch('');
                  }}
                  aria-label={t('assignmentsHub.searchLabel', {
                    defaultValue: 'Search assignments',
                  })}
                  placeholder={t('assignmentsHub.searchPlaceholder', {
                    defaultValue: 'Search assignments…',
                  })}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-brand-blue-primary/40 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AssignmentFilterSelect
                  label={t('assignmentsHub.filterByType', {
                    defaultValue: 'Filter by type',
                  })}
                  summary={summarize(
                    kindFilter,
                    kindOptions,
                    'assignmentsHub.filterTypeSummary',
                    'Type: {{value}}',
                    allTypesLabel
                  )}
                  options={kindOptions}
                  selected={kindFilter}
                  onChange={(next) => setKindFilter(next as AssignmentKind[])}
                  allLabel={allTypesLabel}
                  multiple
                />
                <AssignmentFilterSelect
                  label={t('assignmentsHub.filterByStatus', {
                    defaultValue: 'Filter by status',
                  })}
                  summary={summarize(
                    activeStatusFilter,
                    statusOptions,
                    'assignmentsHub.filterStatusSummary',
                    'Status: {{value}}',
                    anyStatusLabel
                  )}
                  options={statusOptions}
                  selected={activeStatusFilter}
                  onChange={(next) =>
                    setStatusFilter(next as UnifiedAssignmentStatus[])
                  }
                  allLabel={anyStatusLabel}
                />
                {classNames.length > 1 && (
                  <div className="col-span-2">
                    <AssignmentFilterSelect
                      label={t('assignmentsHub.filterByClass', {
                        defaultValue: 'Filter by class',
                      })}
                      summary={summarize(
                        activeClassFilter,
                        classOptions,
                        'assignmentsHub.filterClassSummary',
                        'Class: {{value}}',
                        allClassesLabel
                      )}
                      options={classOptions}
                      selected={activeClassFilter}
                      onChange={setClassFilter}
                      allLabel={allClassesLabel}
                      multiple
                    />
                  </div>
                )}
              </div>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="self-start text-xs font-semibold text-slate-500 hover:text-brand-blue-primary transition-colors"
                >
                  {t('assignmentsHub.filterClear', {
                    defaultValue: 'Clear filters',
                  })}
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {loading ? (
                <div
                  className="space-y-2 p-1"
                  aria-label={t('assignmentsHub.loading', {
                    defaultValue: 'Loading assignments',
                  })}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-14 rounded-xl bg-slate-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState onClose={onClose} />
              ) : filteredRows.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  {t('assignmentsHub.noFilterMatches', {
                    defaultValue: 'No assignments match these filters.',
                  })}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredRows.map((row) => (
                    <AssignmentRow
                      key={`${row.kind}:${row.id}`}
                      row={row}
                      isSelected={selectedRow?.id === row.id}
                      onSelect={() => setSelectedId(row.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail pane — per-student status roster (M17 §5 D2). */}
          <div className="hidden md:flex flex-1 min-w-0 bg-slate-50/60">
            {selectedRow ? (
              <AssignmentDetailPane row={selectedRow} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <p className="text-sm text-slate-400">
                  {t('assignmentsHub.selectPrompt', {
                    defaultValue: 'Select an assignment to view details.',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * AssignmentsHubModal — the central Assignments hub (spec §5 D1, Decision 13).
 * Sidebar entry → full-screen modal, cloned from
 * `components/settingsModal/SettingsModal.tsx` (header chrome, backdrop,
 * escape-to-close, animate-in). Unlike Settings' left-rail-of-sections
 * pattern, this modal's two panes are LIST (left, filterable) + DETAIL
 * (right, placeholder — filled in by D2).
 *
 * Deliberately carries no badge/count on its Sidebar entry point (Decision-8-
 * consistent zero-ambient-signal tradeoff, stated in the PR description).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  FileQuestion,
  Film,
  Compass,
  Blocks,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { AssignmentStatusChip } from './AssignmentStatusChip';
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

/** Chip-style filter toggle shared by the type/class/status filter rows. */
const FilterChip: React.FC<{
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isActive, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={isActive}
    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
      isActive
        ? 'bg-brand-blue-primary text-white'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
  >
    {children}
  </button>
);

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
        {row.targetMode === 'students' && (
          <span className="shrink-0 rounded-full bg-brand-blue-lighter px-2 py-0.5 text-xxs font-bold text-brand-blue-primary">
            {t('assignmentsHub.individualTag', {
              defaultValue: 'Individual',
            })}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-xs text-slate-500">
        <span>{t(meta.labelKey, { defaultValue: meta.fallback })}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{row.className}</span>
        {row.targetSkippedCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-amber-600">
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

  const [kindFilter, setKindFilter] = useState<AssignmentKind | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    UnifiedAssignmentStatus | 'all'
  >('all');
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

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (kindFilter === 'all' || row.kind === kindFilter) &&
          (classFilter === 'all' || row.className === classFilter) &&
          (statusFilter === 'all' || row.status === statusFilter)
      ),
    [rows, kindFilter, classFilter, statusFilter]
  );

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
          <div className="w-full md:w-[380px] shrink-0 border-r border-slate-200 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  isActive={kindFilter === 'all'}
                  onClick={() => setKindFilter('all')}
                >
                  {t('assignmentsHub.filterAll', { defaultValue: 'All' })}
                </FilterChip>
                {KIND_ORDER.map((kind) => (
                  <FilterChip
                    key={kind}
                    isActive={kindFilter === kind}
                    onClick={() => setKindFilter(kind)}
                  >
                    {t(KIND_META[kind].labelKey, {
                      defaultValue: KIND_META[kind].fallback,
                    })}
                  </FilterChip>
                ))}
              </div>
              {classNames.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip
                    isActive={classFilter === 'all'}
                    onClick={() => setClassFilter('all')}
                  >
                    {t('assignmentsHub.filterAllClasses', {
                      defaultValue: 'All classes',
                    })}
                  </FilterChip>
                  {classNames.map((name) => (
                    <FilterChip
                      key={name}
                      isActive={classFilter === name}
                      onClick={() => setClassFilter(name)}
                    >
                      {name}
                    </FilterChip>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  isActive={statusFilter === 'all'}
                  onClick={() => setStatusFilter('all')}
                >
                  {t('assignmentsHub.filterAllStatuses', {
                    defaultValue: 'Any status',
                  })}
                </FilterChip>
                <FilterChip
                  isActive={statusFilter === 'active'}
                  onClick={() => setStatusFilter('active')}
                >
                  {t('assignmentsHub.statusActive', {
                    defaultValue: 'Active',
                  })}
                </FilterChip>
                <FilterChip
                  isActive={statusFilter === 'inactive'}
                  onClick={() => setStatusFilter('inactive')}
                >
                  {t('assignmentsHub.statusInactive', {
                    defaultValue: 'Inactive',
                  })}
                </FilterChip>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
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

          {/* Right: detail pane placeholder — D2 fills this with the
              per-student status roster (AssignmentStatusChip consumer). */}
          <div className="hidden md:flex flex-1 min-w-0 items-center justify-center bg-slate-50/60 p-8">
            {selectedRow ? (
              <div className="text-center max-w-sm">
                <p className="text-sm font-semibold text-slate-700">
                  {selectedRow.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('assignmentsHub.detailComingSoon', {
                    defaultValue: 'Per-student status is coming soon.',
                  })}
                </p>
                <div className="mt-3 flex justify-center gap-1.5">
                  <AssignmentStatusChip status="not-started" />
                  <AssignmentStatusChip status="in-progress" />
                  <AssignmentStatusChip status="submitted" />
                  <AssignmentStatusChip status="graded" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {t('assignmentsHub.selectPrompt', {
                  defaultValue: 'Select an assignment to view details.',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

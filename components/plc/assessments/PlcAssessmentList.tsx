/**
 * PlcAssessmentList — the merged Assessments list (plan D5/D13): one row per
 * quiz assessment with a status badge, a filter chip, search, and the
 * assign / rename / archive actions. The shared-quiz library stays reachable
 * through an inline disclosure so sharing and version management still work.
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Library,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  useCanEditPlcContent,
  usePlcActions,
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import { useQuiz } from '@/hooks/useQuiz';
import { useClickOutside } from '@/hooks/useClickOutside';
import { logError } from '@/utils/logError';
import { buildPlcAssessmentPath, spaNavigate } from '@/utils/plcPath';
import { PlcQuizLibraryBody } from '@/components/plc/bodies/PlcQuizLibraryBody';
import { PlcNewQuizAssignmentModal } from '@/components/plc/PlcNewQuizAssignmentModal';
import {
  buildAssessmentRows,
  filterAssessmentRows,
  formatShortDate,
  type AssessmentListFilter,
  type AssessmentListRow,
  type AssessmentRowStatus,
} from './assessmentListSelectors';

interface PlcAssessmentListProps {
  plc: Plc;
  /** Forwarded to the shared-quiz library for its post-assign hand-off. */
  onCloseDashboard: () => void;
}

const FILTERS: readonly {
  id: AssessmentListFilter;
  labelKey: string;
  labelDefault: string;
}[] = [
  {
    id: 'all',
    labelKey: 'plcDashboard.assessmentList.filters.all',
    labelDefault: 'All',
  },
  {
    id: 'inProgress',
    labelKey: 'plcDashboard.assessmentList.filters.inProgress',
    labelDefault: 'In progress',
  },
  {
    id: 'scored',
    labelKey: 'plcDashboard.assessmentList.filters.scored',
    labelDefault: 'Scored',
  },
  {
    id: 'libraryOnly',
    labelKey: 'plcDashboard.assessmentList.filters.libraryOnly',
    labelDefault: 'Library only',
  },
];

/** Shared status badge — slate for idle states, amber running, emerald done. */
export const AssessmentStatusBadge: React.FC<{
  status: AssessmentRowStatus;
}> = ({ status }) => {
  const { t } = useTranslation();
  const tone =
    status === 'scored'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'inProgress'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  const label =
    status === 'scored'
      ? t('plcDashboard.assessmentList.status.scored', {
          defaultValue: 'Scored',
        })
      : status === 'inProgress'
        ? t('plcDashboard.assessmentList.status.inProgress', {
            defaultValue: 'In progress',
          })
        : status === 'libraryOnly'
          ? t('plcDashboard.assessmentList.status.libraryOnly', {
              defaultValue: 'Library only',
            })
          : t('plcDashboard.assessmentList.status.notStarted', {
              defaultValue: 'Not started',
            });
  return (
    <span
      data-testid="assessment-status"
      data-status={status}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xxs font-bold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface RowProps {
  row: AssessmentListRow;
  canEdit: boolean;
  onOpen: (assessmentId: string) => void;
  onAssign: () => void;
  onRename: (row: AssessmentListRow) => void;
  onArchive: (row: AssessmentListRow) => void;
}

const AssessmentRow: React.FC<RowProps> = ({
  row,
  canEdit,
  onOpen,
  onAssign,
  onRename,
  onArchive,
}) => {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const title =
    row.title ||
    t('plcDashboard.assessmentList.untitled', {
      defaultValue: 'Untitled assessment',
    });
  const isLibraryOnly = row.status === 'libraryOnly';
  const meta: string[] = [];
  if (!isLibraryOnly) {
    meta.push(
      t('plcDashboard.assessmentList.teachersOf', {
        defaultValue: '{{count}} of {{total}} teachers',
        count: row.teacherCount,
        total: row.memberCount,
      })
    );
    meta.push(
      t('plcDashboard.assessmentList.students', {
        defaultValue: '{{count}} students',
        count: row.studentCount,
      })
    );
    if (row.ranAt) {
      meta.push(
        t('plcDashboard.assessmentList.updatedAt', {
          defaultValue: 'Updated {{date}}',
          date: formatShortDate(row.ranAt, i18n.language),
        })
      );
    }
  } else {
    if (row.questionCount != null) {
      meta.push(
        t('plcDashboard.assessmentList.questionCount', {
          defaultValue: '{{count}} questions',
          count: row.questionCount,
        })
      );
    }
    if (row.sharedByName) {
      meta.push(
        t('plcDashboard.assessmentList.sharedBy', {
          defaultValue: 'Shared by {{name}}',
          name: row.sharedByName,
        })
      );
    }
  }

  const body = (
    <>
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-blue-primary/10 shrink-0">
        <BookOpen
          className="w-4 h-4 text-brand-blue-primary"
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-800 truncate">
            {title}
          </span>
          <AssessmentStatusBadge status={row.status} />
          {row.archived && (
            <span className="text-xxs font-semibold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.assessmentList.archived', {
                defaultValue: 'Archived',
              })}
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 mt-0.5 truncate">
          {isLibraryOnly
            ? [
                t('plcDashboard.assessmentList.noResultsYet', {
                  defaultValue: 'No results yet',
                }),
                ...meta,
              ].join(' · ')
            : meta.join(' · ')}
        </span>
      </span>
    </>
  );

  return (
    <li
      data-testid="assessment-row"
      className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3"
    >
      {row.assessmentId ? (
        <button
          type="button"
          onClick={() => onOpen(row.assessmentId as string)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          {body}
          <ChevronRight
            className="w-4 h-4 text-slate-400 shrink-0"
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">{body}</div>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={onAssign}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-blue-primary hover:bg-brand-blue-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          {t('plcDashboard.assessmentList.assign', {
            defaultValue: 'Assign to my classes',
          })}
        </button>
      )}

      {canEdit && row.assessmentId && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('plcDashboard.assessmentList.moreActions', {
              defaultValue: 'More actions for {{title}}',
              title,
            })}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-10 min-w-[10rem] bg-white border border-slate-200 rounded-xl shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRename(row);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.assessmentList.rename', {
                  defaultValue: 'Rename',
                })}
              </button>
              {!row.archived && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive(row);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('plcDashboard.assessmentList.archive', {
                    defaultValue: 'Archive',
                  })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const PlcAssessmentList: React.FC<PlcAssessmentListProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const { user, getAssignmentMode } = useAuth();
  const { addToast } = useDashboard();
  const { showPrompt } = useDialog();
  const { updateAssessment } = usePlcActions();
  const canEdit = useCanEditPlcContent();
  const {
    data: assessments,
    loading: assessmentsLoading,
    error: assessmentsError,
  } = usePlcAssessmentsData();
  const {
    data: aggregates,
    loading: aggregatesLoading,
    error: aggregatesError,
  } = usePlcAggregatesData();
  const members = usePlcMembers();
  const {
    quizzes: libraryEntries,
    loading: libraryLoading,
    error: libraryError,
  } = usePlcQuizzes(plc.id);
  const { quizzes: personalQuizzes, isDriveConnected } = useQuiz(user?.uid);

  const [filter, setFilter] = useState<AssessmentListFilter>('all');
  const [search, setSearch] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const ctaReasonId = useId();
  const libraryPanelId = useId();

  const rows = useMemo(
    () =>
      buildAssessmentRows({
        assessments,
        aggregates,
        libraryEntries,
        memberCount: members.length,
      }),
    [assessments, aggregates, libraryEntries, members.length]
  );
  const visibleRows = useMemo(
    () => filterAssessmentRows(rows, filter, search),
    [rows, filter, search]
  );

  const loading =
    (assessmentsLoading || aggregatesLoading || libraryLoading) &&
    rows.length === 0;
  const error = assessmentsError ?? aggregatesError ?? libraryError;

  const ctaDisabledReason: string | undefined = !isDriveConnected
    ? t('plcDashboard.newAssignment.quiz.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a quiz.',
      })
    : personalQuizzes.length === 0
      ? t('plcDashboard.newAssignment.quiz.ctaDisabledEmpty', {
          defaultValue:
            'You have no quizzes in your personal library yet. Create one in the Quiz widget first.',
        })
      : undefined;

  const openAssign = useCallback(() => {
    if (ctaDisabledReason !== undefined) {
      addToast(ctaDisabledReason, 'error');
      return;
    }
    setAssignOpen(true);
  }, [ctaDisabledReason, addToast]);

  const handleOpen = useCallback(
    (assessmentId: string) => {
      spaNavigate(buildPlcAssessmentPath(plc.id, assessmentId));
    },
    [plc.id]
  );

  const handleRename = useCallback(
    async (row: AssessmentListRow) => {
      if (!row.assessmentId) return;
      const next = await showPrompt(
        t('plcDashboard.assessmentList.renamePrompt', {
          defaultValue: 'New name for this assessment',
        }),
        {
          title: t('plcDashboard.assessmentList.rename', {
            defaultValue: 'Rename',
          }),
          defaultValue: row.title,
          confirmLabel: t('plcDashboard.assessmentList.rename', {
            defaultValue: 'Rename',
          }),
        }
      );
      const trimmed = next?.trim() ?? '';
      if (!trimmed || trimmed === row.title) return;
      try {
        await updateAssessment(row.assessmentId, { title: trimmed });
      } catch (err) {
        logError('PlcAssessmentList.rename', err, {
          plcId: plc.id,
          assessmentId: row.assessmentId,
        });
        addToast(
          t('plcDashboard.assessmentList.renameFailed', {
            defaultValue: 'Couldn’t rename that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [showPrompt, updateAssessment, addToast, plc.id, t]
  );

  const handleArchive = useCallback(
    async (row: AssessmentListRow) => {
      if (!row.assessmentId) return;
      try {
        await updateAssessment(row.assessmentId, { status: 'closed' });
        addToast(
          t('plcDashboard.assessmentList.archivedToast', {
            defaultValue: '“{{title}}” archived.',
            title: row.title,
          }),
          'success'
        );
      } catch (err) {
        logError('PlcAssessmentList.archive', err, {
          plcId: plc.id,
          assessmentId: row.assessmentId,
        });
        addToast(
          t('plcDashboard.assessmentList.archiveFailed', {
            defaultValue: 'Couldn’t archive that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [updateAssessment, addToast, plc.id, t]
  );

  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div
            role="group"
            aria-label={t('plcDashboard.assessmentList.filters.label', {
              defaultValue: 'Filter assessments',
            })}
            className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl"
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                    active
                      ? 'bg-white text-brand-blue-dark shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t(f.labelKey, { defaultValue: f.labelDefault })}
                </button>
              );
            })}
          </div>
          <label className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('plcDashboard.assessmentList.searchLabel', {
                defaultValue: 'Search assessments',
              })}
              placeholder={t('plcDashboard.assessmentList.searchPlaceholder', {
                defaultValue: 'Search…',
              })}
              className="pl-8 pr-3 py-1.5 w-44 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLibraryOpen((v) => !v)}
            aria-expanded={libraryOpen}
            aria-controls={libraryPanelId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Library className="w-3.5 h-3.5" aria-hidden="true" />
            {t('plcDashboard.assessmentList.manageLibrary', {
              defaultValue: 'Manage shared quizzes',
            })}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${libraryOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={
                  ctaDisabledReason !== undefined ? undefined : openAssign
                }
                aria-disabled={ctaDisabledReason !== undefined}
                aria-describedby={
                  ctaDisabledReason !== undefined ? ctaReasonId : undefined
                }
                title={
                  ctaDisabledReason ??
                  t('plcDashboard.newAssignment.quiz.ctaTooltip', {
                    defaultValue:
                      'Create a PLC quiz assignment from your personal library.',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-brand-blue-primary"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                  defaultValue: 'Assign Quiz',
                })}
              </button>
              {ctaDisabledReason !== undefined && (
                <span id={ctaReasonId} className="sr-only">
                  {ctaDisabledReason}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Shared-quiz library disclosure */}
      {libraryOpen && (
        <div
          id={libraryPanelId}
          className="border border-slate-200 rounded-2xl bg-slate-50/60 p-4"
        >
          <PlcQuizLibraryBody plc={plc} onCloseDashboard={onCloseDashboard} />
        </div>
      )}

      {/* Rows */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">
              {t('plcDashboard.assessmentList.loading', {
                defaultValue: 'Loading assessments…',
              })}
            </span>
          </div>
        ) : error ? (
          <div role="alert" className="text-center py-12">
            <p className="text-sm font-semibold text-slate-700">
              {t('plcDashboard.assessmentList.loadError', {
                defaultValue: 'Couldn’t load assessments.',
              })}
            </p>
          </div>
        ) : isEmpty ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <ClipboardList
              className="w-10 h-10 text-slate-300 mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-base font-bold text-slate-700">
              {t('plcDashboard.assessmentList.emptyTitle', {
                defaultValue: 'No assessments yet',
              })}
            </p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {t('plcDashboard.assessmentList.emptySubtitle', {
                defaultValue:
                  'Assign a quiz and share its results with this PLC to pool the team’s data here.',
              })}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={openAssign}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                  defaultValue: 'Assign Quiz',
                })}
              </button>
            )}
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {t('plcDashboard.assessmentList.noMatches', {
              defaultValue: 'No assessments match this filter.',
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleRows.map((row) => (
              <AssessmentRow
                key={row.id}
                row={row}
                canEdit={canEdit}
                onOpen={handleOpen}
                onAssign={openAssign}
                onRename={(r) => void handleRename(r)}
                onArchive={(r) => void handleArchive(r)}
              />
            ))}
          </ul>
        )}
      </div>

      {assignOpen && (
        <PlcNewQuizAssignmentModal
          plc={plc}
          assignmentMode={getAssignmentMode('quiz')}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
};

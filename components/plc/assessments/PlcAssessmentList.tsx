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
  FolderInput,
  GripVertical,
  Library,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
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
import { usePlcFolders } from '@/hooks/usePlcFolders';
import { logError } from '@/utils/logError';
import { buildPlcAssessmentPath, spaNavigate } from '@/utils/plcPath';
import { PlcQuizLibraryBody } from '@/components/plc/bodies/PlcQuizLibraryBody';
import { PlcNewQuizAssignmentModal } from '@/components/plc/PlcNewQuizAssignmentModal';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import {
  buildAssessmentRows,
  countRowsByFolder,
  filterAssessmentRows,
  filterRowsByFolder,
  formatShortDate,
  suggestedFolderNames,
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

interface RowFolder {
  id: string;
  name: string;
}

interface RowProps {
  row: AssessmentListRow;
  canEdit: boolean;
  folders: RowFolder[];
  onOpen: (assessmentId: string) => void;
  onAssign: () => void;
  onRename: (row: AssessmentListRow) => void;
  onArchive: (row: AssessmentListRow) => void;
  onMoveToFolder: (row: AssessmentListRow, folderId: string | null) => void;
}

const AssessmentRow: React.FC<RowProps> = ({
  row,
  canEdit,
  folders,
  onOpen,
  onAssign,
  onRename,
  onArchive,
  onMoveToFolder,
}) => {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => {
    setMenuOpen(false);
    setMoveSubmenuOpen(false);
  });
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    disabled: !canEdit,
  });

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
      ref={setNodeRef}
      data-testid="assessment-row"
      className={`bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 ${isDragging ? 'opacity-40' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('plcDashboard.assessmentList.folders.dragHandle', {
            defaultValue: 'Drag to move',
          })}
          className="shrink-0 p-1 -ml-1 rounded text-slate-300 hover:text-slate-500 cursor-grab touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          <GripVertical className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
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
              <div className="relative">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={moveSubmenuOpen}
                  onClick={() => setMoveSubmenuOpen((v) => !v)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FolderInput className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('plcDashboard.assessmentList.folders.moveToFolder', {
                    defaultValue: 'Move to folder…',
                  })}
                </button>
                {moveSubmenuOpen && (
                  <div
                    role="menu"
                    className="absolute left-full top-0 ml-1 z-20 min-w-[10rem] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setMoveSubmenuOpen(false);
                        onMoveToFolder(row, null);
                      }}
                      className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {t('plcDashboard.assessmentList.folders.noFolder', {
                        defaultValue: 'No folder',
                      })}
                      {row.folderId === null && (
                        <span aria-hidden="true">✓</span>
                      )}
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setMoveSubmenuOpen(false);
                          onMoveToFolder(row, folder.id);
                        }}
                        className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <span className="truncate">{folder.name}</span>
                        {row.folderId === folder.id && (
                          <span aria-hidden="true">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
  const folderState = usePlcFolders(plc.id);

  const [filter, setFilter] = useState<AssessmentListFilter>('all');
  const [search, setSearch] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
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
  const folderFilteredRows = useMemo(
    () => filterRowsByFolder(rows, selectedFolderId),
    [rows, selectedFolderId]
  );
  const visibleRows = useMemo(
    () => filterAssessmentRows(folderFilteredRows, filter, search),
    [folderFilteredRows, filter, search]
  );
  const folderItemCounts = useMemo(() => countRowsByFolder(rows), [rows]);
  const rowIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const suggestions = useMemo(
    () => suggestedFolderNames(assessments),
    [assessments]
  );
  const showSuggestions =
    canEdit &&
    !folderState.loading &&
    folderState.folders.length === 0 &&
    suggestions.length > 0;

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

  const { moveEntry } = folderState;
  const moveRow = useCallback(
    async (row: AssessmentListRow, folderId: string | null) => {
      try {
        await moveEntry(
          { plcQuizId: row.plcQuizId, assessmentId: row.assessmentId },
          folderId
        );
        const folder =
          folderId !== null
            ? folderState.folders.find((f) => f.id === folderId)
            : undefined;
        addToast(
          folder
            ? t('plcDashboard.assessmentList.folders.movedToast', {
                defaultValue: 'Moved to “{{folder}}”',
                folder: folder.name,
              })
            : t('plcDashboard.assessmentList.folders.movedToRootToast', {
                defaultValue: 'Moved out of folders',
              }),
          'success'
        );
      } catch (err) {
        logError('PlcAssessmentList.moveToFolder', err, {
          plcId: plc.id,
          rowId: row.id,
          folderId,
        });
        addToast(
          t('plcDashboard.assessmentList.folders.moveFailed', {
            defaultValue: 'Couldn’t move that item. Try again.',
          }),
          'error'
        );
      }
    },
    [moveEntry, folderState.folders, addToast, plc.id, t]
  );

  const handleDropOnFolder = useCallback(
    (rowId: string, folderId: string | null) => {
      const row = visibleRows.find((r) => r.id === rowId);
      if (!row) return;
      void moveRow(row, folderId);
    },
    [visibleRows, moveRow]
  );

  const handleCreateSuggestedFolder = useCallback(
    async (name: string) => {
      try {
        const folderId = await folderState.createFolder(name, null);
        const targets = rows.filter((r) => {
          const assessment = assessments.find((a) => a.id === r.assessmentId);
          return assessment?.unitLabel?.trim() === name;
        });
        await Promise.all(
          targets.map((row) =>
            moveEntry(
              { plcQuizId: row.plcQuizId, assessmentId: row.assessmentId },
              folderId
            )
          )
        );
        addToast(
          t('plcDashboard.assessmentList.folders.suggestedCreated', {
            defaultValue: 'Created “{{folder}}” from your unit labels.',
            folder: name,
          }),
          'success'
        );
      } catch (err) {
        logError('PlcAssessmentList.createSuggestedFolder', err, {
          plcId: plc.id,
          name,
        });
        addToast(
          t('plcDashboard.assessmentList.folders.moveFailed', {
            defaultValue: 'Couldn’t move that item. Try again.',
          }),
          'error'
        );
      }
    },
    [folderState, rows, assessments, moveEntry, addToast, plc.id, t]
  );

  const renderDragOverlay = useCallback(
    (activeId: string): React.ReactNode => {
      const row = visibleRows.find((r) => r.id === activeId);
      if (!row) return null;
      return (
        <div className="bg-white border border-brand-blue-primary/40 rounded-xl px-3 py-2 shadow-lg text-sm font-bold text-slate-800 max-w-xs truncate">
          {row.title ||
            t('plcDashboard.assessmentList.untitled', {
              defaultValue: 'Untitled assessment',
            })}
        </div>
      );
    },
    [visibleRows, t]
  );

  const isEmpty = !loading && !error && rows.length === 0;
  const isFolderEmpty =
    !isEmpty && selectedFolderId !== null && folderFilteredRows.length === 0;

  const mainContent = (
    <div className="flex flex-col gap-4 h-full min-w-0 flex-1">
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
          <PlcQuizLibraryBody
            plc={plc}
            onCloseDashboard={onCloseDashboard}
            folderId={selectedFolderId}
          />
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
            {isFolderEmpty
              ? t('plcDashboard.assessmentList.folders.emptyFolder', {
                  defaultValue: 'Nothing in this folder yet.',
                })
              : t('plcDashboard.assessmentList.noMatches', {
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
                folders={folderState.folders}
                onOpen={handleOpen}
                onAssign={openAssign}
                onRename={(r) => void handleRename(r)}
                onArchive={(r) => void handleArchive(r)}
                onMoveToFolder={(r, folderId) => void moveRow(r, folderId)}
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

  const sidebar = (
    <div className="w-full md:w-56 md:shrink-0 flex flex-col gap-3">
      <FolderSidebar
        widget="quiz"
        folders={folderState.folders}
        loading={folderState.loading}
        error={folderState.error}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        itemCounts={folderItemCounts}
        onCreateFolder={canEdit ? folderState.createFolder : undefined}
        onRenameFolder={canEdit ? folderState.renameFolder : undefined}
        onMoveFolder={canEdit ? folderState.moveFolder : undefined}
        onDeleteFolder={canEdit ? folderState.deleteFolder : undefined}
        enableDrop={canEdit}
      />
      {showSuggestions && (
        <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-3">
          <p className="text-xxs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {t('plcDashboard.assessmentList.folders.suggestedTitle', {
              defaultValue: 'Suggested from your unit labels',
            })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => void handleCreateSuggestedFolder(name)}
                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-blue-light hover:text-brand-blue-primary transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      <div
        role="group"
        aria-label={t('plcDashboard.assessmentList.folders.sidebarLabel', {
          defaultValue: 'Folders',
        })}
        className="flex flex-col md:flex-row gap-4 h-full min-h-0"
      >
        <LibraryDndContext
          itemIds={rowIds}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={renderDragOverlay}
        >
          {sidebar}
          {mainContent}
        </LibraryDndContext>
      </div>
    </div>
  );
};

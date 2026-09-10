// One row per quiz shared with this PLC: status badge, row actions, folders and search.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Cloud,
  Download,
  FolderInput,
  GripVertical,
  History,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Plc } from '@/types';
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
import { useClickOutside } from '@/hooks/useClickOutside';
import { usePlcFolders } from '@/hooks/usePlcFolders';
import {
  usePlcQuizActions,
  type PlcQuizActionTarget,
} from '@/hooks/usePlcQuizActions';
import { logError } from '@/utils/logError';
import { buildPlcAssessmentPath, spaNavigate } from '@/utils/plcPath';
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
  /** Forwarded to the quiz actions for their post-assign hand-off. */
  onCloseDashboard: () => void;
  /** Rendered above the folder tree in the left rail (the section type nav). */
  rail?: React.ReactNode;
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
    id: 'notStarted',
    labelKey: 'plcDashboard.assessmentList.filters.notStarted',
    labelDefault: 'Not started',
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
    id: 'archived',
    labelKey: 'plcDashboard.assessmentList.filters.archived',
    labelDefault: 'Archived',
  },
];

/** Shared status badge — slate for idle states, amber running, emerald done. */
export const AssessmentStatusBadge: React.FC<{
  status: AssessmentRowStatus;
  archived?: boolean;
}> = ({ status, archived = false }) => {
  const { t } = useTranslation();
  const tone = archived
    ? 'bg-slate-100 text-slate-600 border-slate-200'
    : status === 'scored'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'inProgress'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  const label = archived
    ? t('plcDashboard.assessmentList.archived', { defaultValue: 'Archived' })
    : status === 'scored'
      ? t('plcDashboard.assessmentList.status.scored', {
          defaultValue: 'Scored',
        })
      : status === 'inProgress'
        ? t('plcDashboard.assessmentList.status.inProgress', {
            defaultValue: 'In progress',
          })
        : t('plcDashboard.assessmentList.status.notStarted', {
            defaultValue: 'Not started',
          });
  return (
    <span
      data-testid="assessment-status"
      data-status={archived ? 'archived' : status}
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
  inLibrary: boolean;
  busy: boolean;
  onOpen: (assessmentId: string) => void;
  onAssign: (row: AssessmentListRow) => void;
  onImport: (row: AssessmentListRow) => void;
  onEdit: (row: AssessmentListRow) => void;
  onVersionHistory: (row: AssessmentListRow) => void;
  onRename: (row: AssessmentListRow) => void;
  onArchive: (row: AssessmentListRow) => void;
  onRestore: (row: AssessmentListRow) => void;
  onMoveToFolder: (row: AssessmentListRow, folderId: string | null) => void;
}

const menuItemClass =
  'flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';

const AssessmentRow: React.FC<RowProps> = ({
  row,
  canEdit,
  folders,
  inLibrary,
  busy,
  onOpen,
  onAssign,
  onImport,
  onEdit,
  onVersionHistory,
  onRename,
  onArchive,
  onRestore,
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
    disabled: !canEdit || row.archived,
  });

  const title =
    row.title ||
    t('plcDashboard.assessmentList.untitled', {
      defaultValue: 'Untitled assessment',
    });
  const hasResults = row.assessmentId !== null;
  const meta: string[] = [];
  if (hasResults) {
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
    meta.push(
      t('plcDashboard.assessmentList.noResultsYet', {
        defaultValue: 'No results yet',
      })
    );
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
          <AssessmentStatusBadge status={row.status} archived={row.archived} />
          {inLibrary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-emerald-700">
              <Cloud className="w-3 h-3" aria-hidden="true" />
              {t('plcDashboard.quizLibrary.inLibrary', {
                defaultValue: 'In your library',
              })}
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 mt-0.5 truncate">
          {meta.join(' · ')}
        </span>
      </span>
    </>
  );

  const canUseLibraryActions = canEdit && row.plcQuizId !== null;

  return (
    <li
      ref={setNodeRef}
      data-testid="assessment-row"
      className={`bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 ${isDragging ? 'opacity-40' : ''}`}
    >
      {canEdit && !row.archived && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('plcDashboard.assessmentList.folders.dragHandle', {
            defaultValue: 'Drag to move',
          })}
          className="shrink-0 p-1 -ml-1 rounded text-slate-400 hover:text-slate-600 cursor-grab touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
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

      {canEdit && !row.archived && row.plcQuizId && (
        <button
          type="button"
          onClick={() => onAssign(row)}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-blue-primary hover:bg-brand-blue-primary/5 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          {t('plcDashboard.assessmentList.assign', {
            defaultValue: 'Assign to my classes',
          })}
        </button>
      )}

      {canEdit && (
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
              {row.archived ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRestore(row);
                  }}
                  className={menuItemClass}
                >
                  <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('plcDashboard.assessmentList.restore', {
                    defaultValue: 'Restore',
                  })}
                </button>
              ) : (
                <>
                  {canUseLibraryActions && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onImport(row);
                        }}
                        className={menuItemClass}
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        {inLibrary
                          ? t('plcDashboard.quizLibrary.reimport', {
                              defaultValue: 'Re-import',
                            })
                          : t('plcDashboard.quizLibrary.addToMyLibrary', {
                              defaultValue: 'Add to my library',
                            })}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit(row);
                        }}
                        className={menuItemClass}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('plcDashboard.quizLibrary.editAction', {
                          defaultValue: 'Edit',
                        })}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onVersionHistory(row);
                        }}
                        className={menuItemClass}
                      >
                        <History className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('plcDashboard.versions.open', {
                          defaultValue: 'Version history',
                        })}
                      </button>
                    </>
                  )}
                  {row.assessmentId && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onRename(row);
                      }}
                      className={menuItemClass}
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('plcDashboard.assessmentList.rename', {
                        defaultValue: 'Rename',
                      })}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={moveSubmenuOpen}
                      onClick={() => setMoveSubmenuOpen((v) => !v)}
                      className={menuItemClass}
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onArchive(row);
                    }}
                    className={menuItemClass}
                  >
                    <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('plcDashboard.assessmentList.archive', {
                      defaultValue: 'Archive',
                    })}
                  </button>
                </>
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

function toActionTarget(row: AssessmentListRow): PlcQuizActionTarget | null {
  if (!row.plcQuizId) return null;
  return {
    plcQuizId: row.plcQuizId,
    syncGroupId: row.syncGroupId,
    title: row.title,
    sharedByName: row.sharedByName,
  };
}

export const PlcAssessmentList: React.FC<PlcAssessmentListProps> = ({
  plc,
  onCloseDashboard,
  rail,
}) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { showPrompt } = useDialog();
  const { updateAssessment, archiveQuiz, restoreQuiz } = usePlcActions();
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
  const folderState = usePlcFolders(plc.id);
  const quizActions = usePlcQuizActions(plc, onCloseDashboard);

  const [filter, setFilter] = useState<AssessmentListFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

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

  const { isDriveConnected, assignQuiz, importQuiz, editQuiz } = quizActions;

  const handleAssign = useCallback(
    (row: AssessmentListRow) => {
      const target = toActionTarget(row);
      if (!target) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.newAssignment.quiz.ctaDisabledDrive', {
            defaultValue: 'Connect Google Drive to assign a quiz.',
          }),
          'error'
        );
        return;
      }
      assignQuiz(target);
    },
    [assignQuiz, isDriveConnected, addToast, t]
  );

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
      try {
        await archiveQuiz({
          plcQuizId: row.plcQuizId,
          assessmentId: row.assessmentId,
        });
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
          rowId: row.id,
        });
        addToast(
          t('plcDashboard.assessmentList.archiveFailed', {
            defaultValue: 'Couldn’t archive that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [archiveQuiz, addToast, plc.id, t]
  );

  const handleRestore = useCallback(
    async (row: AssessmentListRow) => {
      try {
        await restoreQuiz({
          plcQuizId: row.plcQuizId,
          assessmentId: row.assessmentId,
        });
        addToast(
          t('plcDashboard.assessmentList.restoredToast', {
            defaultValue: '“{{title}}” restored.',
            title: row.title,
          }),
          'success'
        );
      } catch (err) {
        logError('PlcAssessmentList.restore', err, {
          plcId: plc.id,
          rowId: row.id,
        });
        addToast(
          t('plcDashboard.assessmentList.restoreFailed', {
            defaultValue: 'Couldn’t restore that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [restoreQuiz, addToast, plc.id, t]
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

  const shareButton = canEdit ? (
    <button
      type="button"
      onClick={quizActions.openSharePicker}
      disabled={!isDriveConnected}
      title={
        !isDriveConnected
          ? t('plcDashboard.quizLibrary.shareCta.driveDisconnected', {
              defaultValue: 'Connect Google Drive to share a quiz.',
            })
          : t('plcDashboard.quizLibrary.shareCta.tooltip', {
              defaultValue:
                'Pick a quiz from your personal library to share with this PLC.',
            })
      }
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      {t('plcDashboard.assessmentList.shareQuiz', {
        defaultValue: 'Share a quiz',
      })}
    </button>
  ) : null;

  const mainContent = (
    <div className="flex flex-col gap-4 h-full min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
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
        {shareButton}
      </div>

      <div className="flex-1 min-h-0 mt-4">
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
                  'Share a quiz with this PLC, then assign it to pool the team’s results here.',
              })}
            </p>
            <div className="mt-4 flex justify-center">{shareButton}</div>
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {isFolderEmpty
              ? t('plcDashboard.assessmentList.folders.emptyFolder', {
                  defaultValue: 'Nothing in this folder yet.',
                })
              : filter === 'archived'
                ? t('plcDashboard.assessmentList.noArchived', {
                    defaultValue: 'No archived quizzes.',
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
                inLibrary={quizActions.isInLibrary(row.syncGroupId)}
                busy={quizActions.busy}
                onOpen={handleOpen}
                onAssign={(r) => void handleAssign(r)}
                onImport={(r) => {
                  const target = toActionTarget(r);
                  if (target) importQuiz(target);
                }}
                onEdit={(r) => {
                  const target = toActionTarget(r);
                  if (target) editQuiz(target);
                }}
                onVersionHistory={(r) => {
                  const target = toActionTarget(r);
                  if (target) quizActions.openVersionHistory(target);
                }}
                onRename={(r) => void handleRename(r)}
                onArchive={(r) => void handleArchive(r)}
                onRestore={(r) => void handleRestore(r)}
                onMoveToFolder={(r, folderId) => void moveRow(r, folderId)}
              />
            ))}
          </ul>
        )}
      </div>

      {quizActions.modals}
    </div>
  );

  const sidebar = (
    <div className="w-full md:w-56 md:shrink-0 flex flex-col gap-3">
      {rail}
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
          <p className="text-xxs font-bold uppercase tracking-wider text-slate-500 mb-2">
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
    <div
      role="group"
      aria-label={t('plcDashboard.assessmentList.folders.sidebarLabel', {
        defaultValue: 'Folders',
      })}
      className="flex flex-col md:flex-row gap-6 h-full min-h-0"
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
  );
};

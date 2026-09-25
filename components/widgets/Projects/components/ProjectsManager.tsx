/**
 * ProjectsManager — the widget body: Library / In Progress / Archive.
 *
 * R1 replaces the pick-a-project dropdown on the back face with the same
 * `LibraryShell` chrome Quiz, Video Activity and Guided Learning use, so a
 * freshly-placed Projects widget opens on something to act on rather than an
 * empty board.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Archive as ArchiveIcon,
  ClipboardList,
  LayoutList,
  Plus,
  RotateCcw,
  SquarePen,
  Trash2,
  Users,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import type {
  ProjectDefinition,
  ProjectRun,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRuns } from '@/hooks/useProjectRuns';
import { useRubrics } from '@/hooks/useRubrics';
import { useFolders } from '@/hooks/useFolders';
import {
  BulkActionBar,
  FolderPickerPopover,
  FolderSidebar,
  LibraryDndContext,
  LibraryGrid,
  LibraryItemCard,
  LibraryShell,
  LibraryToolbar,
  buildDuplicateAction,
  buildMoveToFolderAction,
  countItemsByFolder,
  filterByFolder,
  useLibrarySelection,
  useLibraryView,
  useSortableReorder,
} from '@/components/common/library';
import type {
  LibraryMenuAction,
  LibrarySortOption,
  LibraryTab,
} from '@/components/common/library/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ProjectEditorModal } from './ProjectEditorModal';
import { projectClassIdFor } from '../projectSteps';
import { db } from '@/config/firebase';
import {
  setRunAcceptingUpdates,
  syncRunFromProject,
} from '@/utils/projectRunWrites';

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'updatedAt', label: 'Last updated', defaultDir: 'desc' },
  { key: 'createdAt', label: 'Date created', defaultDir: 'desc' },
];

/* Module-scope so `useLibraryView` keeps stable option identities across
   renders (same reason as the other managers). */
const LIBRARY_SEARCH_FIELDS = (p: ProjectDefinition): string[] => [
  p.title,
  p.description ?? '',
  ...p.steps.map((s) => s.title),
];

const LIBRARY_INITIAL_SORT = { key: 'manual', dir: 'asc' as const };

const LIBRARY_SORT_COMPARATORS = {
  manual: (a: ProjectDefinition, b: ProjectDefinition, dir: 'asc' | 'desc') => {
    const av = a.order ?? Number.POSITIVE_INFINITY;
    const bv = b.order ?? Number.POSITIVE_INFINITY;
    const diff = av - bv;
    return dir === 'asc' ? diff : -diff;
  },
  title: (a: ProjectDefinition, b: ProjectDefinition, dir: 'asc' | 'desc') => {
    const diff = a.title.localeCompare(b.title);
    return dir === 'asc' ? diff : -diff;
  },
  updatedAt: (
    a: ProjectDefinition,
    b: ProjectDefinition,
    dir: 'asc' | 'desc'
  ) => {
    const diff = a.updatedAt - b.updatedAt;
    return dir === 'asc' ? diff : -diff;
  },
  createdAt: (
    a: ProjectDefinition,
    b: ProjectDefinition,
    dir: 'asc' | 'desc'
  ) => {
    const diff = a.createdAt - b.createdAt;
    return dir === 'asc' ? diff : -diff;
  },
};

const GET_ID = (p: ProjectDefinition): string => p.id;

/** A run plus its library project; either side can be absent in the archive. */
interface RunEntry {
  run: ProjectRun | undefined;
  project: ProjectDefinition | undefined;
}

interface ProjectsManagerProps {
  widget: WidgetData;
  /** Switches the widget to the board view for this project. */
  onOpenBoard: (projectId: string) => void;
  onSetupGroups: (projectId: string) => void;
  onGrade: (projectId: string) => void;
}

export const ProjectsManager: React.FC<ProjectsManagerProps> = ({
  widget,
  onOpenBoard,
  onSetupGroups,
  onGrade,
}) => {
  const config = widget.config as ProjectsConfig;
  const { updateWidget, addToast, rosters } = useDashboard();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const userId = user?.uid;

  const {
    projects,
    loading,
    error,
    saveProject,
    deleteProject,
    setArchived,
    duplicateProject,
    reorderProjects,
  } = useProjectLibrary(userId);
  const { runs, loading: runsLoading } = useProjectRuns(userId);
  const { rubrics } = useRubrics(userId);
  const folderState = useFolders(userId, 'projects');

  const tab: LibraryTab = config.managerTab ?? 'library';
  const update = useCallback(
    (updates: Partial<ProjectsConfig>) =>
      updateWidget(widget.id, { config: { ...config, ...updates } }),
    [config, updateWidget, widget.id]
  );
  const setTab = (next: LibraryTab): void =>
    update({ managerTab: next as ProjectsConfig['managerTab'] });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderPickerTarget, setFolderPickerTarget] =
    useState<ProjectDefinition | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useLibrarySelection();

  // Selection is a Library-tab affordance; leaving the tab drops it.
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) {
    setPrevTab(tab);
    if (tab !== 'library' && selectionMode) {
      setSelectionMode(false);
      selection.clear();
    }
  }

  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setSelectedFolderId(null);
  }
  if (
    !folderState.loading &&
    selectedFolderId !== null &&
    !folderState.folders.some((f) => f.id === selectedFolderId)
  ) {
    setSelectedFolderId(null);
  }

  const runByProjectId = useMemo(() => {
    const map = new Map<string, ProjectRun>();
    for (const run of runs) map.set(run.projectId, run);
    return map;
  }, [runs]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectDefinition>();
    for (const project of projects) map.set(project.id, project);
    return map;
  }, [projects]);

  const libraryProjects = useMemo(
    () => projects.filter((p) => !p.archivedAt),
    [projects]
  );

  const activeRuns = useMemo<RunEntry[]>(
    () =>
      runs
        .filter((run) => run.acceptingUpdates)
        .map((run) => ({ run, project: projectById.get(run.projectId) })),
    [projectById, runs]
  );

  /** One card per project that is closed, archived, or both — never two. */
  const archiveEntries = useMemo<RunEntry[]>(() => {
    const seen = new Set<string>();
    const entries: RunEntry[] = [];
    for (const project of projects) {
      if (!project.archivedAt) continue;
      seen.add(project.id);
      entries.push({ run: runByProjectId.get(project.id), project });
    }
    for (const run of runs) {
      if (run.acceptingUpdates || seen.has(run.projectId)) continue;
      entries.push({ run, project: projectById.get(run.projectId) });
    }
    return entries;
  }, [projectById, projects, runByProjectId, runs]);

  const folderItemCounts = useMemo(
    () => countItemsByFolder(libraryProjects),
    [libraryProjects]
  );

  const foldered = useMemo(
    () => filterByFolder(libraryProjects, selectedFolderId),
    [libraryProjects, selectedFolderId]
  );

  const view = useLibraryView<ProjectDefinition>({
    items: foldered,
    initialSort: LIBRARY_INITIAL_SORT,
    initialViewMode: config.libraryViewMode ?? 'list',
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
    onViewModeChange: (libraryViewMode) => update({ libraryViewMode }),
  });

  const reorder = useSortableReorder<ProjectDefinition>({
    items: view.visibleItems,
    getId: GET_ID,
    onCommit: reorderProjects,
  });

  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      try {
        await moveItem(itemId, folderId);
      } catch {
        addToast('That project could not be moved.', 'error');
      }
    },
    [addToast, moveItem, userId]
  );

  const reorderDragActive =
    !view.reorderLocked && view.visibleItems.length >= 2;
  const handleReorderDrop = useCallback(
    (orderedIds: string[]) => {
      if (!reorderDragActive) return;
      void reorder.handleReorder(orderedIds);
    },
    [reorder, reorderDragActive]
  );

  /* ─── Writes ──────────────────────────────────────────────────────────── */

  const handleCreate = async (): Promise<void> => {
    const now = Date.now();
    const next: ProjectDefinition = {
      id: crypto.randomUUID(),
      title: 'New project',
      steps: [],
      folderId: selectedFolderId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveProject(next);
      setEditingId(next.id);
    } catch {
      addToast('That project could not be created.', 'error');
    }
  };

  // D12/D13 — the run carries a snapshot so students never read the library,
  // which makes pushing an edit onto a launched run part of saving it.
  const handleSaveProject = useCallback(
    async (next: ProjectDefinition): Promise<void> => {
      try {
        await saveProject(next);
        const run = runByProjectId.get(next.id);
        if (run) await syncRunFromProject(db, run, next);
      } catch {
        addToast('That project could not be saved.', 'error');
        throw new Error('save failed');
      }
    },
    [addToast, runByProjectId, saveProject]
  );

  const handleDelete = async (project: ProjectDefinition): Promise<void> => {
    const run = runByProjectId.get(project.id);
    const ok = await showConfirm(
      run
        ? `Delete "${project.title}"? Its groups keep their progress but you lose the library copy. This cannot be undone.`
        : `Delete "${project.title}"? This cannot be undone.`,
      { title: 'Delete project', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    try {
      await deleteProject(project.id);
      if (config.projectId === project.id) update({ projectId: undefined });
      addToast('Project deleted.', 'success');
    } catch {
      addToast('That project could not be deleted.', 'error');
    }
  };

  const handleArchive = async (
    project: ProjectDefinition,
    archived: boolean
  ): Promise<void> => {
    try {
      await setArchived(project.id, archived);
      addToast(
        archived ? 'Moved to the archive.' : 'Back in your library.',
        'success'
      );
    } catch {
      addToast('That project could not be archived.', 'error');
    }
  };

  const handleBulkMove = async (folderId: string | null): Promise<void> => {
    if (!userId || selection.count === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selection.selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => moveItem(id, folderId))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        addToast(
          `${failed} project${failed === 1 ? '' : 's'} failed to move.`,
          'error'
        );
      }
      selection.clear();
      setSelectionMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selection.count === 0) return;
    const ids = Array.from(selection.selectedIds);
    const ok = await showConfirm(
      `Delete ${ids.length} project${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      { title: 'Delete projects', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => deleteProject(id))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = ids.length - failed;
      if (succeeded > 0) {
        addToast(
          `Deleted ${succeeded} project${succeeded === 1 ? '' : 's'}.`,
          'success'
        );
      }
      if (failed > 0) {
        addToast(
          `${failed} project${failed === 1 ? '' : 's'} failed to delete.`,
          'error'
        );
      }
      selection.clear();
      setSelectionMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  /* ─── Cards ───────────────────────────────────────────────────────────── */

  const classNamesFor = useCallback(
    (run: ProjectRun): string => {
      const names = run.classIds.map((classId) => {
        const roster = rosters.find((r) => projectClassIdFor(r) === classId);
        return roster?.name ?? 'a class no longer on this account';
      });
      if (names.length === 0) return 'no classes yet';
      if (names.length <= 2) return names.join(' and ');
      return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    },
    [rosters]
  );

  const renderProjectCard = (
    project: ProjectDefinition
  ): React.ReactElement => {
    const run = runByProjectId.get(project.id);
    const stepLabel = `${project.steps.length} step${project.steps.length === 1 ? '' : 's'}`;
    const secondary: LibraryMenuAction[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: SquarePen,
        onClick: () => setEditingId(project.id),
      },
      buildDuplicateAction(project, async () => {
        try {
          const copy = await duplicateProject(project);
          addToast(`Duplicated as "${copy.title}".`, 'success');
        } catch {
          addToast('That project could not be duplicated.', 'error');
        }
      }),
      buildMoveToFolderAction({
        onOpenPicker: () => setFolderPickerTarget(project),
        disabled: !userId,
      }),
      {
        id: 'archive',
        label: 'Move to archive',
        icon: ArchiveIcon,
        onClick: () => void handleArchive(project, true),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => void handleDelete(project),
      },
    ];
    if (run) {
      secondary.splice(1, 0, {
        id: 'manage-groups',
        label: 'Manage groups',
        icon: Users,
        onClick: () => onSetupGroups(project.id),
      });
    }

    return (
      <LibraryItemCard<ProjectDefinition>
        key={project.id}
        id={project.id}
        title={project.title}
        subtitle={
          <span>
            {stepLabel}
            {run ? ` · ${classNamesFor(run)}` : ''}
            {' · Updated '}
            {formatDate(project.updatedAt)}
          </span>
        }
        badges={
          run
            ? [
                {
                  label: run.acceptingUpdates ? 'Running' : 'Closed',
                  tone: run.acceptingUpdates ? 'success' : 'neutral',
                  dot: run.acceptingUpdates,
                },
              ]
            : undefined
        }
        primaryAction={
          run
            ? {
                label: 'Open board',
                icon: LayoutList,
                onClick: () => onOpenBoard(project.id),
              }
            : {
                label: 'Set up groups',
                icon: Users,
                onClick: () => onSetupGroups(project.id),
                disabled: project.steps.length === 0,
                disabledReason: 'Add at least one step first.',
              }
        }
        secondaryActions={secondary}
        viewMode={view.state.viewMode}
        meta={project}
        selectionMode={selectionMode}
        selected={selection.isSelected(project.id)}
        onSelectionToggle={() => selection.toggle(project.id)}
        onClick={() => setEditingId(project.id)}
      />
    );
  };

  const closeRun = async (
    run: ProjectRun,
    acceptingUpdates: boolean
  ): Promise<void> => {
    try {
      await setRunAcceptingUpdates(db, run.id, acceptingUpdates);
      addToast(
        acceptingUpdates
          ? 'Groups can update this project again.'
          : 'Closed. Groups can no longer change their progress.',
        'success'
      );
    } catch {
      addToast('That project could not be updated.', 'error');
    }
  };

  const renderRunCard = (
    entry: RunEntry,
    mode: 'active' | 'archive'
  ): React.ReactElement => {
    const { run, project } = entry;
    const secondary: LibraryMenuAction[] = [];
    if (project) {
      secondary.push({
        id: 'edit',
        label: 'Edit project',
        icon: SquarePen,
        onClick: () => setEditingId(project.id),
      });
      secondary.push({
        id: 'manage-groups',
        label: 'Manage groups',
        icon: Users,
        onClick: () => onSetupGroups(project.id),
      });
    }
    if (run && mode === 'active') {
      secondary.push({
        id: 'close',
        label: 'Close to updates',
        icon: ArchiveIcon,
        onClick: () => void closeRun(run, false),
      });
    } else {
      if (run) {
        secondary.push({
          id: 'reopen',
          label: 'Reopen for updates',
          icon: RotateCcw,
          onClick: () => void closeRun(run, true),
        });
      }
      if (project?.archivedAt) {
        secondary.push({
          id: 'restore',
          label: 'Back to library',
          icon: RotateCcw,
          onClick: () => void handleArchive(project, false),
        });
      }
    }

    return (
      <LibraryItemCard<ProjectRun>
        key={run?.id ?? project?.id}
        id={run?.id ?? project?.id ?? ''}
        title={run?.title ?? project?.title ?? 'Untitled project'}
        subtitle={
          <span>
            {run
              ? `${run.steps.length} step${run.steps.length === 1 ? '' : 's'} · ${classNamesFor(run)} · Updated ${formatDate(run.updatedAt)}`
              : `Archived ${project ? formatDate(project.updatedAt) : ''}`}
          </span>
        }
        badges={[
          run
            ? run.acceptingUpdates
              ? { label: 'Accepting updates', tone: 'success', dot: true }
              : { label: 'Closed', tone: 'neutral' }
            : { label: 'Archived', tone: 'neutral' },
        ]}
        primaryAction={
          project
            ? {
                label: 'Open board',
                icon: LayoutList,
                onClick: () => onOpenBoard(project.id),
              }
            : undefined
        }
        secondaryPrimaryAction={
          run && project
            ? {
                label: 'Grade',
                icon: SquarePen,
                onClick: () => onGrade(project.id),
              }
            : undefined
        }
        secondaryActions={secondary}
        sortable={false}
        viewMode="list"
      />
    );
  };

  /* ─── Shell ───────────────────────────────────────────────────────────── */

  const editingProject = editingId ? projectById.get(editingId) : undefined;

  const folderSidebarSlot =
    tab === 'library' && userId ? (
      <FolderSidebar
        widget="projects"
        folders={folderState.folders}
        loading={folderState.loading}
        error={folderState.error}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        itemCounts={folderItemCounts}
        onCreateFolder={folderState.createFolder}
        onRenameFolder={folderState.renameFolder}
        onMoveFolder={folderState.moveFolder}
        onDeleteFolder={folderState.deleteFolder}
        enableDrop
      />
    ) : undefined;

  const shell = (
    <LibraryShell
      widgetLabel="Projects"
      widgetType="projects"
      tab={tab}
      onTabChange={setTab}
      counts={{
        library: libraryProjects.length,
        active: activeRuns.length,
        archive: archiveEntries.length,
      }}
      visibleTabs={['library', 'active', 'archive']}
      primaryAction={
        tab === 'library'
          ? {
              label: 'New project',
              icon: Plus,
              onClick: () => void handleCreate(),
            }
          : undefined
      }
      folderPanelMode={config.folderPanelMode}
      onFolderPanelModeChange={(folderPanelMode) => update({ folderPanelMode })}
      filterSidebarSlot={folderSidebarSlot}
      toolbarSlot={
        tab === 'library' ? (
          <LibraryToolbar
            {...view.toolbarProps}
            sortOptions={SORT_OPTIONS}
            searchPlaceholder="Search projects…"
            rightSlot={
              userId ? (
                <button
                  type="button"
                  onClick={() => {
                    if (selectionMode) {
                      selection.clear();
                      setSelectionMode(false);
                    } else {
                      setSelectionMode(true);
                    }
                  }}
                  className={`inline-flex items-center rounded-lg font-bold uppercase tracking-wider transition-colors ${
                    selectionMode
                      ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
                      : 'bg-white/70 text-slate-600 hover:bg-white hover:text-slate-800'
                  }`}
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    paddingInline: 'min(10px, 2.5cqmin)',
                    paddingBlock: 'min(6px, 1.5cqmin)',
                    fontSize: 'min(12px, 4cqmin)',
                  }}
                  aria-pressed={selectionMode}
                  title={
                    selectionMode
                      ? 'Exit selection mode'
                      : 'Enter selection mode'
                  }
                >
                  <CheckSquare
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                  {selectionMode ? 'Cancel' : 'Select'}
                </button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      {tab === 'library' &&
        (loading ? (
          <LoadingRow label="Loading projects…" />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {error && (
              <p
                role="status"
                className="mb-3 rounded-xl bg-red-50 px-3 py-2 font-semibold text-brand-red-primary"
                style={{ fontSize: 'min(12px, 4.5cqmin)' }}
              >
                {error}
              </p>
            )}
            {config.pendingImport && (
              <div
                className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-blue-lighter bg-brand-blue-lighter/25 px-3 py-2"
                role="status"
              >
                <span
                  className="font-semibold text-slate-700"
                  style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                >
                  {config.pendingImport.groups.length} group
                  {config.pendingImport.groups.length === 1 ? '' : 's'} from the
                  Group Maker are waiting — pick the project they belong to.
                </span>
                <button
                  type="button"
                  onClick={() => update({ pendingImport: null })}
                  className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-white/70"
                  style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                >
                  Discard
                </button>
              </div>
            )}
            {selectionMode && selection.count > 0 && (
              <div style={{ marginBottom: 'min(12px, 3cqmin)' }}>
                <BulkActionBar
                  count={selection.count}
                  onClear={() => {
                    selection.clear();
                    setSelectionMode(false);
                  }}
                  folders={folderState.folders}
                  onMove={handleBulkMove}
                  onDelete={handleBulkDelete}
                  busy={bulkBusy}
                />
              </div>
            )}
            <LibraryGrid<ProjectDefinition>
              items={reorder.orderedItems}
              getId={GET_ID}
              renderCard={renderProjectCard}
              onReorder={handleReorderDrop}
              dragDisabled={!userId || selectionMode}
              reorderLocked={reorderDragActive ? view.reorderLocked : false}
              reorderLockedReason={
                reorderDragActive ? view.reorderLockedReason : undefined
              }
              layout={view.state.viewMode}
              useExternalDndContext={Boolean(userId)}
              emptyState={
                <ScaledEmptyState
                  icon={ClipboardList}
                  title={
                    libraryProjects.length === 0
                      ? 'No projects yet'
                      : 'Nothing matches'
                  }
                  subtitle={
                    libraryProjects.length === 0
                      ? 'Click "New project" to start one.'
                      : 'Try a different search, folder, or filter.'
                  }
                />
              }
            />
          </div>
        ))}

      {tab === 'active' &&
        (runsLoading ? (
          <LoadingRow label="Loading projects…" />
        ) : activeRuns.length === 0 ? (
          <ScaledEmptyState
            icon={LayoutList}
            title="No projects running"
            subtitle='Open a project in the Library tab and choose "Set up groups" to start one.'
          />
        ) : (
          <div className="flex flex-col">
            {activeRuns.map((entry) => renderRunCard(entry, 'active'))}
          </div>
        ))}

      {tab === 'archive' &&
        (runsLoading ? (
          <LoadingRow label="Loading projects…" />
        ) : archiveEntries.length === 0 ? (
          <ScaledEmptyState
            icon={ArchiveIcon}
            title="Nothing archived"
            subtitle="Closed projects and anything you archive from the library land here."
          />
        ) : (
          <div className="flex flex-col">
            {archiveEntries.map((entry) => renderRunCard(entry, 'archive'))}
          </div>
        ))}
    </LibraryShell>
  );

  return (
    <>
      {userId && tab === 'library' ? (
        <LibraryDndContext
          itemIds={reorder.orderedItems.map(GET_ID)}
          onReorder={handleReorderDrop}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={(activeId) => {
            const project = reorder.orderedItems.find((p) => p.id === activeId);
            return project ? renderProjectCard(project) : null;
          }}
        >
          {shell}
        </LibraryDndContext>
      ) : (
        shell
      )}

      {folderPickerTarget && (
        <FolderPickerPopover
          variant="dialog"
          folders={folderState.folders}
          selectedFolderId={folderPickerTarget.folderId ?? null}
          onSelect={(folderId) => {
            void handleDropOnFolder(folderPickerTarget.id, folderId);
          }}
          onClose={() => setFolderPickerTarget(null)}
          title={`Move "${folderPickerTarget.title}" to…`}
        />
      )}

      {editingProject && (
        <ProjectEditorModal
          isOpen
          project={editingProject}
          rubrics={rubrics}
          folders={folderState.folders}
          teacherUid={userId ?? ''}
          onSave={handleSaveProject}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
};

const LoadingRow: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="flex items-center justify-center text-brand-blue-primary"
    style={{ gap: 'min(12px, 3cqmin)', height: 'min(160px, 40cqmin)' }}
  >
    <Loader2
      className="animate-spin"
      style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
    />
    <span className="font-medium" style={{ fontSize: 'min(14px, 5cqmin)' }}>
      {label}
    </span>
  </div>
);

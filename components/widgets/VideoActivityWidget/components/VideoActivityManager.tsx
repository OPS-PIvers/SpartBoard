/**
 * VideoActivityManager — teacher's video activity library built on the shared
 * Wave-1 library primitives (`LibraryShell`, `LibraryGrid`, `LibraryToolbar`,
 * `useLibraryView`, `useSortableReorder`, `AssignModal`).
 *
 * Three tabs (Library / In Progress / Archive) mirror QuizManager's proven
 * pattern. The In Progress + Archive tabs render the persisted assignments
 * surfaced by `useVideoActivityAssignments()`; the assignment runtime itself
 * (the live monitor / student join-URL flow) isn't shipped here — it will
 * follow in a later wave. This component only surfaces the list states so
 * teachers can copy URLs, pause/resume, and delete archived rows.
 *
 * Per-assignment session options preserved from the legacy Manager:
 *   - `autoPlay`, `requireCorrectAnswer` (a.k.a "Require Correct Answers"),
 *     `allowSkipping`, and a free-text "Assignment Name" — rendered through
 *     `AssignModal.extraSlot`. The adapter contract is locked; widget-
 *     specific toggles flow through that slot, not by forking the primitive.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Ban,
  Copy,
  Edit2,
  FileUp,
  Link2,
  Loader2,
  PlayCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { AssignModal } from '@/components/common/library/AssignModal';
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';
import {
  countItemsByFolder,
  filterByFolder,
} from '@/components/common/library/folderFilters';
import { useFolders } from '@/hooks/useFolders';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Toggle } from '@/components/common/Toggle';
import type {
  AssignmentStatusBadge,
  LibraryBadge,
  LibraryMenuAction,
  LibrarySortDir,
  LibraryTab,
} from '@/components/common/library/types';
import type {
  VideoActivityAssignment,
  VideoActivityAssignmentStatus,
  VideoActivityMetadata,
  VideoActivitySession,
  VideoActivitySessionSettings,
} from '@/types';

/* ─── Props ───────────────────────────────────────────────────────────────── */

export interface VideoActivityManagerProps {
  /** Teacher's Firebase UID — scopes the folders subcollection. */
  userId?: string;
  // Library (activity templates)
  activities: VideoActivityMetadata[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onImport: () => void;
  onEdit: (activity: VideoActivityMetadata) => void;
  onDelete: (activity: VideoActivityMetadata) => void;
  /**
   * Optional per-activity results view. New work prefers the assignment-
   * archive tab; kept for backwards-compatibility while the legacy Widget
   * still wires a per-activity session history modal.
   */
  onResults?: (activity: VideoActivityMetadata) => void;
  onAssign: (
    activity: VideoActivityMetadata,
    settings: VideoActivitySessionSettings,
    assignmentName: string
  ) => Promise<string>;
  /**
   * Optional persistence hook for manual drag-reorder of the library. Drag
   * reordering is only enabled when this callback is provided; otherwise the
   * library order remains fixed for the current session.
   */
  onReorderActivities?: (orderedIds: string[]) => Promise<void> | void;
  defaultSessionSettings: VideoActivitySessionSettings;

  // Assignments (persisted archive)
  assignments: VideoActivityAssignment[];
  assignmentsLoading: boolean;
  onArchiveCopyUrl?: (assignment: VideoActivityAssignment) => void;
  onArchivePauseResume?: (assignment: VideoActivityAssignment) => Promise<void>;
  onArchiveDeactivate?: (assignment: VideoActivityAssignment) => Promise<void>;
  onArchiveDelete?: (assignment: VideoActivityAssignment) => Promise<void>;
  onArchiveResults?: (assignment: VideoActivityAssignment) => void;

  // Legacy per-activity session view (one-off session history). Kept for
  // backwards compatibility with existing Widget.tsx wiring; new work should
  // prefer the assignment archive instead.
  onSessionResults?: (session: VideoActivitySession) => void;
}

/* ─── Library hook option constants (module-level for referential stability) ─

 * Passing these as inline literals inside the component causes `useLibraryView`
 * to re-derive `visibleItems` on every render, which in turn triggers a
 * re-render loop through `useSortableReorder`. Keeping them at module scope
 * makes the references stable. */

const LIBRARY_SEARCH_FIELDS = (a: VideoActivityMetadata): string[] => [
  a.title,
  a.youtubeUrl,
];

const LIBRARY_SORT_COMPARATORS = {
  manual: (a: VideoActivityMetadata, b: VideoActivityMetadata) =>
    (a.order ?? 0) - (b.order ?? 0),
  updated: (
    a: VideoActivityMetadata,
    b: VideoActivityMetadata,
    dir: 'asc' | 'desc'
  ) => {
    const av = a.updatedAt || a.createdAt;
    const bv = b.updatedAt || b.createdAt;
    return dir === 'asc' ? av - bv : bv - av;
  },
  created: (
    a: VideoActivityMetadata,
    b: VideoActivityMetadata,
    dir: 'asc' | 'desc'
  ) => (dir === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt),
  title: (
    a: VideoActivityMetadata,
    b: VideoActivityMetadata,
    dir: 'asc' | 'desc'
  ) => {
    const cmp = a.title.localeCompare(b.title);
    return dir === 'asc' ? cmp : -cmp;
  },
  questionCount: (
    a: VideoActivityMetadata,
    b: VideoActivityMetadata,
    dir: 'asc' | 'desc'
  ) => {
    const cmp = a.questionCount - b.questionCount;
    return dir === 'asc' ? cmp : -cmp;
  },
};

const LIBRARY_INITIAL_SORT = { key: 'updated', dir: 'desc' as LibrarySortDir };

const ACTIVITY_GET_ID = (a: VideoActivityMetadata): string => a.id;

/* ─── Assignment status → badge mapping ───────────────────────────────────── */

function statusToBadge(
  status: VideoActivityAssignmentStatus
): AssignmentStatusBadge {
  switch (status) {
    case 'active':
      return { label: 'Live', tone: 'success', dot: true };
    case 'paused':
      return { label: 'Paused', tone: 'warn', dot: true };
    case 'inactive':
    default:
      return { label: 'Ended', tone: 'neutral' };
  }
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export const VideoActivityManager: React.FC<VideoActivityManagerProps> = ({
  userId,
  activities,
  loading,
  error,
  onNew,
  onImport,
  onEdit,
  onDelete,
  onResults,
  onAssign,
  onReorderActivities,
  defaultSessionSettings,
  assignments,
  assignmentsLoading,
  onArchiveCopyUrl,
  onArchivePauseResume,
  onArchiveDeactivate,
  onArchiveDelete,
  onArchiveResults,
}) => {
  const [tab, setTab] = useState<LibraryTab>('library');

  // Assign modal state
  const [assignTarget, setAssignTarget] =
    useState<VideoActivityMetadata | null>(null);
  const [assignOptions, setAssignOptions] =
    useState<VideoActivitySessionSettings>(defaultSessionSettings);
  const [assignmentName, setAssignmentName] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);

  // Adjust state during render when the assign target changes — avoids the
  // set-state-in-effect anti-pattern while keeping form fields reset per open.
  const [prevAssignTargetId, setPrevAssignTargetId] = useState<string | null>(
    null
  );
  if (assignTarget && assignTarget.id !== prevAssignTargetId) {
    setPrevAssignTargetId(assignTarget.id);
    setAssignOptions(defaultSessionSettings);
    setAssignmentName(buildDefaultAssignmentName(assignTarget.title));
    setAssignError(null);
  } else if (!assignTarget && prevAssignTargetId !== null) {
    setPrevAssignTargetId(null);
  }

  // Delete confirmation state
  const [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<
    string | null
  >(null);
  const [confirmDeleteAssignmentId, setConfirmDeleteAssignmentId] = useState<
    string | null
  >(null);

  /* ─── Folder navigation (Wave 3-B-3) ──────────────────────────────────── */
  const folderState = useFolders(userId, 'video_activity');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Reset folder selection when the signed-in user changes or the selected
  // folder no longer exists (adjust-state-during-render pattern).
  const [prevFolderUserId, setPrevFolderUserId] = useState(userId);
  if (prevFolderUserId !== userId) {
    setPrevFolderUserId(userId);
    setSelectedFolderId(null);
  }
  if (
    !folderState.loading &&
    selectedFolderId !== null &&
    !folderState.folders.some((f) => f.id === selectedFolderId)
  ) {
    setSelectedFolderId(null);
  }

  const folderItemCounts = useMemo(
    () => countItemsByFolder(activities),
    [activities]
  );

  const folderFilteredActivities = useMemo(
    () => filterByFolder(activities, selectedFolderId),
    [activities, selectedFolderId]
  );

  /* ─── Library (activities) view state ─────────────────────────────────── */

  const libraryView = useLibraryView<VideoActivityMetadata>({
    items: folderFilteredActivities,
    initialSort: LIBRARY_INITIAL_SORT,
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
  });

  const onReorderCommit = useCallback(
    async (orderedIds: string[]) => {
      if (onReorderActivities) {
        await Promise.resolve(onReorderActivities(orderedIds));
      }
    },
    [onReorderActivities]
  );

  const reorder = useSortableReorder<VideoActivityMetadata>({
    items: libraryView.visibleItems,
    getId: ACTIVITY_GET_ID,
    onCommit: onReorderCommit,
  });

  /* ─── Drop-to-folder handler ──────────────────────────────────────────── */
  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      try {
        await moveItem(itemId, folderId);
      } catch (err) {
        console.error('[VideoActivityManager] moveItem failed:', err);
      }
    },
    [userId, moveItem]
  );

  const handleReorderDrop = useCallback(
    async (nextOrderedIds: string[]): Promise<void> => {
      if (!onReorderActivities) return;
      if (libraryView.reorderLocked) return;
      await Promise.resolve(onReorderActivities(nextOrderedIds));
    },
    [libraryView.reorderLocked, onReorderActivities]
  );

  /* ─── Assignment splits ───────────────────────────────────────────────── */

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'inactive'),
    [assignments]
  );
  const inactiveAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'inactive'),
    [assignments]
  );

  /* ─── Tab counts ──────────────────────────────────────────────────────── */

  const tabCounts = {
    library: activities.length,
    active: activeAssignments.length,
    archive: inactiveAssignments.length,
  };

  /* ─── Handlers ────────────────────────────────────────────────────────── */

  const handleAssignConfirm = async (): Promise<void> => {
    if (!assignTarget) return;
    if (assignmentName.trim().length === 0) {
      setAssignError('Assignment name is required.');
      return;
    }
    setAssignError(null);
    try {
      await onAssign(assignTarget, assignOptions, assignmentName.trim());
      setAssignTarget(null);
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Failed to create assignment'
      );
      throw err; // let the modal re-enable its button
    }
  };

  /* ─── Loading state ───────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-brand-blue-primary gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading activities…</span>
      </div>
    );
  }

  /* ─── Library tab content ─────────────────────────────────────────────── */

  const activityBadges = (a: VideoActivityMetadata): LibraryBadge[] => [
    { label: `${a.questionCount} Qs`, tone: 'info' },
  ];

  const libraryEmptyState = (
    <ScaledEmptyState
      icon={PlayCircle}
      title="No Activities"
      subtitle="Create your first interactive video activity to get started."
      action={
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary text-white font-bold shadow-sm hover:bg-brand-blue-dark transition-colors px-4 py-2 text-sm"
        >
          Create Activity
        </button>
      }
    />
  );

  const useExternalDnd = Boolean(userId);
  const cardDragEnabled = useExternalDnd || Boolean(onReorderActivities);

  const renderLibraryTab = (): React.ReactElement => (
    <>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <LibraryGrid<VideoActivityMetadata>
        items={reorder.orderedItems}
        getId={(a) => a.id}
        onReorder={reorder.handleReorder}
        dragDisabled={!cardDragEnabled}
        reorderLocked={useExternalDnd ? false : libraryView.reorderLocked}
        reorderLockedReason={
          useExternalDnd ? undefined : libraryView.reorderLockedReason
        }
        layout={libraryView.state.viewMode}
        emptyState={libraryEmptyState}
        useExternalDndContext={useExternalDnd}
        renderCard={(activity) => {
          const secondaryActions: LibraryMenuAction[] = [
            {
              id: 'edit',
              label: 'Edit',
              icon: Edit2,
              onClick: () => onEdit(activity),
            },
            ...(onResults
              ? [
                  {
                    id: 'results',
                    label: 'Results',
                    icon: BarChart3,
                    onClick: () => onResults(activity),
                  } satisfies LibraryMenuAction,
                ]
              : []),
            {
              id: 'delete',
              label:
                confirmDeleteActivityId === activity.id
                  ? 'Confirm delete'
                  : 'Delete',
              icon: Trash2,
              destructive: true,
              onClick: () => {
                if (confirmDeleteActivityId === activity.id) {
                  setConfirmDeleteActivityId(null);
                  onDelete(activity);
                } else {
                  setConfirmDeleteActivityId(activity.id);
                }
              },
            },
          ];
          return (
            <LibraryItemCard<VideoActivityMetadata>
              key={activity.id}
              id={activity.id}
              title={activity.title}
              subtitle={
                <span className="truncate">
                  Updated{' '}
                  {new Date(
                    activity.updatedAt || activity.createdAt
                  ).toLocaleDateString()}
                </span>
              }
              badges={activityBadges(activity)}
              primaryAction={{
                label: 'Assign',
                icon: Link2,
                onClick: () => setAssignTarget(activity),
              }}
              secondaryActions={secondaryActions}
              onClick={() => onEdit(activity)}
              viewMode={libraryView.state.viewMode}
              meta={activity}
            />
          );
        }}
      />
    </>
  );

  /* ─── In Progress / Archive tab content ──────────────────────────────── */

  const renderAssignmentList = (
    list: VideoActivityAssignment[],
    mode: 'active' | 'archive'
  ): React.ReactElement => {
    if (assignmentsLoading) {
      return (
        <div className="flex items-center justify-center py-10 text-brand-blue-primary gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Loading assignments…</span>
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <ScaledEmptyState
          icon={mode === 'active' ? Activity : PlayCircle}
          title={
            mode === 'active'
              ? 'No active assignments yet'
              : 'No archived assignments'
          }
          subtitle={
            mode === 'active'
              ? 'Assign an activity from the Library tab to see it here.'
              : 'Ended assignments will show up here for review.'
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {list.map((assignment) => {
          const status = statusToBadge(assignment.status);
          const secondaryActions = buildAssignmentSecondaryActions(
            assignment,
            mode
          );

          // Primary action: for active assignments, the headline CTA copies
          // the join link (the label matches the handler — previously "Open"
          // which was misleading since no new view was opened). For archived
          // assignments, the primary action opens Results.
          const primaryAction =
            mode === 'active'
              ? { label: 'Copy link', icon: Copy }
              : { label: 'Results', icon: BarChart3 };

          return (
            <AssignmentArchiveCard<VideoActivityAssignment>
              key={assignment.id}
              assignment={assignment}
              mode={mode}
              status={status}
              title={assignment.className ?? assignment.activityTitle}
              subtitle={
                assignment.className ? assignment.activityTitle : undefined
              }
              meta={
                <span>
                  {new Date(assignment.updatedAt).toLocaleDateString()}
                </span>
              }
              primaryAction={{
                label: primaryAction.label,
                icon: primaryAction.icon,
                onClick: () => {
                  if (mode === 'active' && onArchiveCopyUrl) {
                    onArchiveCopyUrl(assignment);
                  } else if (onArchiveResults) {
                    onArchiveResults(assignment);
                  }
                },
              }}
              secondaryActions={secondaryActions}
            />
          );
        })}
      </div>
    );
  };

  /**
   * Build the per-assignment overflow-menu action list. Extracted from the
   * render loop so the pause/resume/deactivate/results/delete wiring lives
   * in one place and the list-render stays declarative.
   */
  function buildAssignmentSecondaryActions(
    assignment: VideoActivityAssignment,
    mode: 'active' | 'archive'
  ): LibraryMenuAction[] {
    const actions: LibraryMenuAction[] = [];
    const isPaused = assignment.status === 'paused';

    if (mode === 'active') {
      if (onArchiveCopyUrl) {
        actions.push({
          id: 'copy-url',
          label: 'Copy link',
          icon: Copy,
          onClick: () => onArchiveCopyUrl(assignment),
        });
      }
      if (onArchivePauseResume) {
        actions.push({
          id: 'pause-resume',
          label: isPaused ? 'Resume' : 'Pause',
          icon: isPaused ? PlayCircle : Ban,
          onClick: () => {
            void onArchivePauseResume(assignment);
          },
        });
      }
      if (onArchiveDeactivate) {
        actions.push({
          id: 'deactivate',
          label: 'End assignment',
          icon: Ban,
          onClick: () => {
            void onArchiveDeactivate(assignment);
          },
        });
      }
    }

    if (onArchiveResults) {
      actions.push({
        id: 'results',
        label: 'Results',
        icon: BarChart3,
        onClick: () => onArchiveResults(assignment),
      });
    }

    if (onArchiveDelete) {
      actions.push({
        id: 'delete',
        label:
          confirmDeleteAssignmentId === assignment.id
            ? 'Confirm delete'
            : 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => {
          if (confirmDeleteAssignmentId === assignment.id) {
            setConfirmDeleteAssignmentId(null);
            void onArchiveDelete(assignment);
          } else {
            setConfirmDeleteAssignmentId(assignment.id);
          }
        },
      });
    }

    return actions;
  }

  /* ─── Toolbar (library tab only) ─────────────────────────────────────── */

  const toolbar =
    tab === 'library' ? (
      <LibraryToolbar
        {...libraryView.toolbarProps}
        searchPlaceholder="Search activities…"
        sortOptions={[
          {
            key: 'manual',
            label: 'Manual',
            defaultDir: 'asc' as LibrarySortDir,
          },
          { key: 'updated', label: 'Recently updated', defaultDir: 'desc' },
          { key: 'created', label: 'Recently created', defaultDir: 'desc' },
          { key: 'title', label: 'Title', defaultDir: 'asc' },
          { key: 'questionCount', label: 'Question count', defaultDir: 'desc' },
        ]}
      />
    ) : null;

  /* ─── Render ──────────────────────────────────────────────────────────── */

  const folderSidebarSlot =
    tab === 'library' && userId ? (
      <FolderSidebar
        widget="video_activity"
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

  const orderedIds = reorder.orderedItems.map(ACTIVITY_GET_ID);

  const renderDragOverlay = (activeId: string): React.ReactNode => {
    const activity = reorder.orderedItems.find((a) => a.id === activeId);
    if (!activity) return null;
    return (
      <LibraryItemCard<VideoActivityMetadata>
        id={activity.id}
        title={activity.title}
        subtitle={
          <span className="truncate">
            Updated{' '}
            {new Date(
              activity.updatedAt || activity.createdAt
            ).toLocaleDateString()}
          </span>
        }
        badges={activityBadges(activity)}
        primaryAction={{
          label: 'Assign',
          icon: Link2,
          onClick: () => setAssignTarget(activity),
        }}
        viewMode={libraryView.state.viewMode}
        sortable={false}
        isDragOverlay
        meta={activity}
      />
    );
  };

  const shell = (
    <LibraryShell
      widgetLabel="Video Activity"
      tab={tab}
      onTabChange={setTab}
      counts={tabCounts}
      primaryAction={{
        label: 'New',
        icon: Plus,
        onClick: onNew,
      }}
      secondaryActions={[
        {
          label: 'Import',
          icon: FileUp,
          onClick: onImport,
        },
      ]}
      toolbarSlot={toolbar}
      filterSidebarSlot={folderSidebarSlot}
    >
      {tab === 'library' && renderLibraryTab()}
      {tab === 'active' && renderAssignmentList(activeAssignments, 'active')}
      {tab === 'archive' &&
        renderAssignmentList(inactiveAssignments, 'archive')}
    </LibraryShell>
  );

  return (
    <>
      {useExternalDnd && tab === 'library' ? (
        <LibraryDndContext
          itemIds={orderedIds}
          onReorder={handleReorderDrop}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={renderDragOverlay}
        >
          {shell}
        </LibraryDndContext>
      ) : (
        shell
      )}

      {assignTarget && (
        <AssignModal<VideoActivitySessionSettings>
          isOpen={true}
          onClose={() => setAssignTarget(null)}
          itemTitle={assignTarget.title}
          options={assignOptions}
          onOptionsChange={setAssignOptions}
          assignmentName={assignmentName}
          onAssignmentNameChange={setAssignmentName}
          confirmLabel="Create Session Link"
          confirmDisabled={assignmentName.trim().length === 0}
          confirmDisabledReason="Enter an assignment name."
          onAssign={handleAssignConfirm}
          extraSlot={
            <div className="space-y-3">
              {assignError && (
                <div className="flex items-start gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{assignError}</span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
                <ToggleRow
                  label="Auto-Play"
                  hint="Start video automatically after join"
                  checked={assignOptions.autoPlay}
                  onChange={(next) =>
                    setAssignOptions((prev) => ({ ...prev, autoPlay: next }))
                  }
                />
                <ToggleRow
                  label="Require Correct Answers"
                  hint="Incorrect answers rewind to section start"
                  checked={assignOptions.requireCorrectAnswer}
                  onChange={(next) =>
                    setAssignOptions((prev) => ({
                      ...prev,
                      requireCorrectAnswer: next,
                    }))
                  }
                />
                <ToggleRow
                  label="Allow Skipping"
                  hint="Let students scrub ahead"
                  checked={assignOptions.allowSkipping}
                  onChange={(next) =>
                    setAssignOptions((prev) => ({
                      ...prev,
                      allowSkipping: next,
                    }))
                  }
                />
              </div>
            </div>
          }
        />
      )}
    </>
  );
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function buildDefaultAssignmentName(title: string): string {
  const formattedDate = new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${title} - ${formattedDate}`;
}

/* ─── ToggleRow — small presentational helper ─────────────────────────────── */

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  hint,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
    <Toggle
      checked={checked}
      onChange={onChange}
      size="sm"
      showLabels={false}
    />
  </div>
);

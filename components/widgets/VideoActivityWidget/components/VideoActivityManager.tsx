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
  CheckSquare,
  Copy,
  Edit2,
  EyeOff,
  FileUp,
  Link2,
  Loader2,
  Monitor,
  PlayCircle,
  Plus,
  RotateCcw,
  Send,
  Share2,
  Trash2,
  Users2,
  GraduationCap,
} from 'lucide-react';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { AssignModal } from '@/components/common/library/AssignModal';
import { ViewOnlyShareModal } from '@/components/common/library/ViewOnlyShareModal';
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import { ViewCountBadge } from '@/components/common/library/ViewCountBadge';
import { useSessionViewCount } from '@/hooks/useSessionViewCount';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { buildMoveToFolderAction } from '@/components/common/library/folderMenuAction';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import { useLibrarySelection } from '@/components/common/library/useLibrarySelection';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';
import { BulkActionBar } from '@/components/common/library/BulkActionBar';
import { LibraryPreviewPane } from '@/components/common/library/LibraryPreviewPane';
import {
  countItemsByFolder,
  filterByFolder,
} from '@/components/common/library/folderFilters';
import { useFolders } from '@/hooks/useFolders';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import type {
  AssignmentStatusBadge,
  LibraryBadge,
  LibraryMenuAction,
  LibrarySortDir,
  LibraryTab,
} from '@/components/common/library/types';
import { buildDuplicateAction } from '@/components/common/library/libraryDuplicate';
import type {
  AssignmentMode,
  ClassRoster,
  VideoActivityAssignment,
  VideoActivityAssignmentStatus,
  VideoActivityMetadata,
  VideoActivitySession,
  VideoActivitySessionSettings,
} from '@/types';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import { mapLegacyClassIdsToRosterIds } from '@/utils/resolveAssignmentTargets';
import { extractYouTubeId } from '@/utils/youtube';
import {
  getVideoActivityBehavior,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';
import {
  splitDueAtToInputs,
  dueInputsToEpoch,
  DEFAULT_DUE_TIME,
} from '@/utils/localDate';

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
  onDelete: (activity: VideoActivityMetadata) => void | Promise<void>;
  /**
   * Phase 5 — duplicate kebab item. Owns the actual `duplicateActivity`
   * call. When omitted, the entry is hidden (view-only / test
   * harnesses).
   */
  onDuplicate?: (activity: VideoActivityMetadata) => void | Promise<void>;
  /**
   * Phase 4 — "Share with PLC". Invoked when the teacher picks the new
   * kebab item on a library card. The Widget owns the PLC picker modal
   * + the actual share write (creating the synced group + the PLC
   * subcoll doc); this prop is the seam. The kebab entry is hidden when
   * omitted (e.g. test harnesses).
   */
  onShareWithPlc?: (activity: VideoActivityMetadata) => void;
  /**
   * Optional busy-state probe. When provided, the Duplicate kebab item
   * disables itself for any activity id whose duplicate is currently
   * in-flight. Prevents rapid double-click → two identical copies.
   */
  isDuplicating?: (activityId: string) => boolean;
  /**
   * Optional per-activity results view. New work prefers the assignment-
   * archive tab; kept for backwards-compatibility while the legacy Widget
   * still wires a per-activity session history modal.
   */
  onResults?: (activity: VideoActivityMetadata) => void;
  /**
   * Slimmed assign callback (VA Task 9 parity with Quiz Task 9).
   * Behavior settings (sessionOptions, attemptLimit) are now on the activity
   * itself and sourced via `getVideoActivityBehavior(meta)` in Widget.tsx at
   * confirm time. This shape only carries targeting + due-date.
   *
   * Args: activity meta, selected roster IDs, optional due-date (epoch ms) or null.
   */
  onAssign: (
    activity: VideoActivityMetadata,
    /** Selected roster IDs (unified picker output). */
    rosterIds: string[],
    /** Optional due date (epoch ms). null = no due date. */
    dueAt: number | null
  ) => Promise<string>;
  /** Rosters to populate the picker. */
  rosters: ClassRoster[];
  /**
   * Per-activity memory of the last roster selection. Pre-selects the picker
   * on re-launch.
   */
  lastRosterIdsByActivityId?: Record<string, string[]>;
  /**
   * @deprecated Read-only fallback for pre-unification widget configs.
   * Holds ClassLink class `sourcedId`s; mapped to rosterIds via
   * `mapLegacyClassIdsToRosterIds` when `lastRosterIdsByActivityId` is absent.
   */
  lastClassIdsByActivityId?: Record<string, string[]>;
  /** @deprecated See `lastClassIdsByActivityId`. */
  lastClassIdByActivityId?: Record<string, string>;
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
  /**
   * Re-open a previously deactivated view-only share. Required for the
   * archive-tab "Reactivate" action to render; omit if the parent doesn't
   * implement reactivation.
   */
  onArchiveReactivate?: (assignment: VideoActivityAssignment) => Promise<void>;
  onArchiveDelete?: (assignment: VideoActivityAssignment) => Promise<void>;
  onArchiveResults?: (assignment: VideoActivityAssignment) => void;
  /**
   * PR3 PLC sharing — invoked when the teacher picks "Share with PLC" on an
   * assignment's kebab menu. Implementation lives in `Widget.tsx` and calls
   * `useVideoActivityAssignments.shareAssignment` after hydrating the
   * activity from Drive. The handler is responsible for copying the
   * resulting share URL to the clipboard and surfacing toasts.
   */
  onArchiveShare?: (assignment: VideoActivityAssignment) => Promise<void>;
  /**
   * Open the "Assign to Google Classroom" flow for a submission assignment. Only
   * provided (and the kebab action only rendered) when CLASSROOM_ASSIGN_ENABLED
   * is on, so the gating lives entirely in the host widget. View-only shares are
   * excluded (no grade passback).
   */
  onArchiveAssignToClassroom?: (assignment: VideoActivityAssignment) => void;
  /**
   * Open the live teacher monitor for an active assignment. Surfaced as the
   * In Progress tab's primary CTA when wired; mirrors the Quiz manager.
   */
  onArchiveMonitor?: (
    assignment: VideoActivityAssignment
  ) => void | Promise<void>;
  /**
   * PR3c — open the publish-scores modal for this assignment. Set ⇒ the
   * archive kebab gains a "Publish scores" / "Update published scores"
   * entry that calls back through to `Widget.tsx`'s
   * `useVideoActivityAssignments.publishAssignmentScores` hook.
   */
  onArchivePublishScores?: (assignment: VideoActivityAssignment) => void;
  /**
   * Revoke published score visibility in one click (skips the picker
   * modal). Only surfaced when `assignment.scoreVisibility` is published.
   */
  onArchiveUnpublishScores?: (
    assignment: VideoActivityAssignment
  ) => void | Promise<void>;

  /** Persisted library grid/list toggle (from widget config). */
  initialLibraryViewMode?: 'grid' | 'list';
  /** Persist the library grid/list toggle into widget config. */
  onLibraryViewModeChange?: (mode: 'grid' | 'list') => void;

  // Legacy per-activity session view (one-off session history). Kept for
  // backwards compatibility with existing Widget.tsx wiring; new work should
  // prefer the assignment archive instead.
  onSessionResults?: (session: VideoActivitySession) => void;

  /** Org-wide assignment mode. Drives Assign-vs-Share button labels and the
   *  In-Progress-vs-Shared tab label. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
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
  status: VideoActivityAssignmentStatus,
  isViewOnly = false
): AssignmentStatusBadge {
  switch (status) {
    case 'active':
      return {
        label: isViewOnly ? 'Shared' : 'Live',
        tone: 'success',
        dot: true,
      };
    case 'paused':
      // View-only shares don't expose pause/resume — keeping the active
      // badge label consistent ("Shared") prevents a "Paused" chip from
      // implying the link is dead.
      return isViewOnly
        ? { label: 'Shared', tone: 'success', dot: true }
        : { label: 'Paused', tone: 'warn', dot: true };
    case 'inactive':
    default:
      return {
        // Single-word "Closed" reads cleaner and is consistent across
        // widgets; cf. MiniAppManager.statusBadge / QuizManager.resolveStatus.
        label: isViewOnly ? 'Closed' : 'Ended',
        tone: 'neutral',
      };
  }
}

/* ─── Archive row wrapper (per-row hooks for view-count fetch) ────────────── */

interface VideoActivityArchiveRowProps {
  assignment: VideoActivityAssignment;
  mode: 'active' | 'archive';
  secondaryActions: LibraryMenuAction[];
  onArchiveCopyUrl?: (assignment: VideoActivityAssignment) => void;
  onArchiveMonitor?: (
    assignment: VideoActivityAssignment
  ) => void | Promise<void>;
  onArchiveResults?: (assignment: VideoActivityAssignment) => void;
}

/**
 * Per-row hook host for view-count fetch. Owns the primary-action selection
 * and the meta-line layout for both Active and Archive tabs across
 * submissions and view-only modes.
 */
const VideoActivityArchiveRow: React.FC<VideoActivityArchiveRowProps> = ({
  assignment,
  mode,
  secondaryActions,
  onArchiveCopyUrl,
  onArchiveMonitor,
  onArchiveResults,
}) => {
  const assignmentIsViewOnly = assignment.mode === 'view-only';
  const status = statusToBadge(assignment.status, assignmentIsViewOnly);

  // Primary action priority:
  //   - View-only + active: Copy link (the link is the entire UX).
  //   - View-only + archive: omit — link is dead, Reactivate lives in kebab.
  //   - Submissions + active+live: Monitor when wired.
  //   - Submissions + active+paused or no monitor wired: Copy link.
  //   - Submissions + archive: Results.
  const isLiveActive = mode === 'active' && assignment.status === 'active';
  const primaryAction: { label: string; icon: typeof Copy } | null =
    assignmentIsViewOnly
      ? mode === 'active'
        ? { label: 'Copy link', icon: Copy }
        : null
      : mode === 'active'
        ? isLiveActive && onArchiveMonitor
          ? { label: 'Monitor', icon: Monitor }
          : { label: 'Copy link', icon: Copy }
        : { label: 'Results', icon: BarChart3 };

  // Admin-only by default — view-count display fires one Firestore
  // aggregation per visible card per dashboard tab-focus, gated behind the
  // `share-link-tracking` global permission.
  const { canSeeShareTracking } = useAuth();
  const trackingEnabled = canSeeShareTracking();
  const { count } = useSessionViewCount(
    'video_activity_sessions',
    assignment.id,
    assignmentIsViewOnly && trackingEnabled
  );

  return (
    <AssignmentArchiveCard<VideoActivityAssignment>
      assignment={assignment}
      mode={mode}
      status={status}
      title={assignment.className ?? assignment.activityTitle}
      subtitle={assignment.className ? assignment.activityTitle : undefined}
      meta={
        <>
          <span>{new Date(assignment.updatedAt).toLocaleDateString()}</span>
          {assignmentIsViewOnly && trackingEnabled && (
            <ViewCountBadge count={count} />
          )}
        </>
      }
      primaryAction={
        primaryAction
          ? {
              label: primaryAction.label,
              icon: primaryAction.icon,
              onClick: () => {
                if (assignmentIsViewOnly) {
                  if (onArchiveCopyUrl) onArchiveCopyUrl(assignment);
                } else if (mode === 'active') {
                  if (isLiveActive && onArchiveMonitor) {
                    void onArchiveMonitor(assignment);
                  } else if (onArchiveCopyUrl) {
                    onArchiveCopyUrl(assignment);
                  }
                } else if (onArchiveResults) {
                  onArchiveResults(assignment);
                }
              },
            }
          : undefined
      }
      secondaryActions={secondaryActions}
    />
  );
};

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
  onDuplicate,
  onShareWithPlc,
  isDuplicating,
  onResults,
  onAssign,
  onReorderActivities,
  defaultSessionSettings,
  assignments,
  assignmentsLoading,
  onArchiveCopyUrl,
  onArchivePauseResume,
  onArchiveDeactivate,
  onArchiveReactivate,
  onArchiveDelete,
  onArchiveResults,
  onArchiveShare,
  onArchiveAssignToClassroom,
  onArchiveMonitor,
  onArchivePublishScores,
  onArchiveUnpublishScores,
  initialLibraryViewMode,
  onLibraryViewModeChange,
  rosters,
  lastRosterIdsByActivityId,
  lastClassIdsByActivityId,
  lastClassIdByActivityId,
  assignmentMode = 'submissions',
}) => {
  const { showConfirm } = useDialog();
  const isViewOnly = assignmentMode === 'view-only';
  const primaryActionLabel = isViewOnly ? 'Share' : 'Assign';
  const [tab, setTab] = useState<LibraryTab>('library');

  // Assign modal state (submissions mode)
  const [assignTarget, setAssignTarget] =
    useState<VideoActivityMetadata | null>(null);

  // View-only Share modal state — bypasses the AssignModal entirely
  // because class targeting has no functional effect on view-only sessions
  // (rules don't gate views by class; sessions are filtered out of
  // /my-assignments anyway).
  const [viewOnlyShareTarget, setViewOnlyShareTarget] =
    useState<VideoActivityMetadata | null>(null);
  const [viewOnlyShareLink, setViewOnlyShareLink] = useState<string | null>(
    null
  );
  const [viewOnlyShareError, setViewOnlyShareError] = useState<string | null>(
    null
  );
  const [isCreatingViewOnlyShare, setIsCreatingViewOnlyShare] = useState(false);
  const [assignOptions, setAssignOptions] =
    useState<VideoActivitySessionSettings>(defaultSessionSettings);
  const [assignmentName, setAssignmentName] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  // Due date for the current assign modal (epoch ms or null = no due date).
  const [assignDueAt, setAssignDueAt] = useState<number | null>(null);
  // Unified roster picker state. Seeded from the per-activity roster memory
  // on open so repeated assignments don't require re-picking.
  const [pickerValue, setPickerValue] = useState<AssignClassPickerValue>(() =>
    makeEmptyPickerValue()
  );

  // Adjust state during render when the assign target changes — avoids the
  // set-state-in-effect anti-pattern while keeping form fields reset per open.
  const [prevAssignTargetId, setPrevAssignTargetId] = useState<string | null>(
    null
  );
  if (assignTarget && assignTarget.id !== prevAssignTargetId) {
    setPrevAssignTargetId(assignTarget.id);
    setAssignOptions(defaultSessionSettings);
    setAssignmentName(buildDefaultAssignmentName(assignTarget.title));
    setAssignDueAt(null);
    setAssignError(null);
    // Prefer unified roster memory; fall back to legacy ClassLink-sourcedId
    // maps so teachers upgrading from pre-unification configs don't lose
    // their per-activity preselection on first launch.
    let rememberedRosters = lastRosterIdsByActivityId?.[assignTarget.id] ?? [];
    if (rememberedRosters.length === 0) {
      const legacyMulti = lastClassIdsByActivityId?.[assignTarget.id];
      const legacySingle = lastClassIdByActivityId?.[assignTarget.id];
      const legacyClassIds =
        legacyMulti ?? (legacySingle ? [legacySingle] : undefined);
      rememberedRosters = mapLegacyClassIdsToRosterIds(legacyClassIds, rosters);
    }
    setPickerValue({ rosterIds: rememberedRosters });
  } else if (!assignTarget && prevAssignTargetId !== null) {
    setPrevAssignTargetId(null);
  }

  // NOTE: The legacy `classLinkService.getRosters()` fetch was removed when
  // the picker moved to roster-only targeting. Imported ClassLink rosters
  // carry their own metadata (classlinkClassId) so the student SSO gate
  // still works; live ClassLink data is now reached only via the Import
  // dialog.

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
  const [folderPickerTarget, setFolderPickerTarget] =
    useState<VideoActivityMetadata | null>(null);

  /* ─── Bulk selection (Step 8) ─────────────────────────────────────────── */
  const selection = useLibrarySelection();
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Phase 5 follow-up — preview pane state. Stores id only so the pane
  // always reflects the latest snapshot in `activities` (subagent
  // review flag on PR #1588).
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(
    null
  );
  const previewActivity =
    previewActivityId != null
      ? (activities.find((a) => a.id === previewActivityId) ?? null)
      : null;
  const [prevManagerTab, setPrevManagerTab] = useState(tab);
  if (prevManagerTab !== tab) {
    setPrevManagerTab(tab);
    if (tab !== 'library' && selectionMode) {
      setSelectionMode(false);
      selection.clear();
    }
  }

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
    initialViewMode: initialLibraryViewMode ?? 'grid',
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
    onViewModeChange: onLibraryViewModeChange,
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

  /* ─── Bulk handlers (Step 8) ──────────────────────────────────────────── */
  const handleBulkMove = useCallback(
    async (folderId: string | null): Promise<void> => {
      if (!userId || selection.count === 0) return;
      const ids = Array.from(selection.selectedIds);
      setBulkBusy(true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) => moveItem(id, folderId))
        );
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(
              '[VideoActivityManager] bulk move failed for',
              ids[idx],
              result.reason
            );
          }
        });
        selection.clear();
        setSelectionMode(false);
      } finally {
        setBulkBusy(false);
      }
    },
    [userId, selection, moveItem]
  );

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selection.count === 0) return;
    const ok = window.confirm(
      `Delete ${selection.count} activit${selection.count === 1 ? 'y' : 'ies'}? This cannot be undone.`
    );
    if (!ok) return;
    const ids = Array.from(selection.selectedIds);
    const targets = activities.filter((a) => ids.includes(a.id));
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map(async (activity) => onDelete(activity))
      );
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(
            '[VideoActivityManager] bulk delete failed for',
            targets[idx]?.id,
            result.reason
          );
        }
      });
      selection.clear();
      setSelectionMode(false);
    } finally {
      setBulkBusy(false);
    }
  }, [selection, activities, onDelete]);

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
    setAssignError(null);
    // Guard against stale rosterIds — rosters can be deleted or fail to
    // load (`loadError`) after the teacher's last assignment.
    const visibleRosterIds = new Set(
      rosters.filter((r) => !r.loadError).map((r) => r.id)
    );
    const validRosterIds = pickerValue.rosterIds.filter((id) =>
      visibleRosterIds.has(id)
    );
    try {
      // Behavior (sessionOptions, attemptLimit) is now sourced from the
      // activity itself in the Widget handler via getVideoActivityBehavior(meta).
      await onAssign(assignTarget, validRosterIds, assignDueAt);
      setAssignTarget(null);
      setAssignDueAt(null);
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Failed to create assignment'
      );
      throw err; // let the modal re-enable its button
    }
  };

  // View-only share confirm: mints the session via the same `onAssign`
  // callback the parent already wires for submissions, with default settings
  // and an auto-generated share name. The session/assignment docs carry
  // the org-wide view-only mode (the parent reads `assignmentMode` via
  // useAuth), so the rules block submissions and the URL serves as a
  // read-only share link.
  const handleConfirmViewOnlyShare = async (): Promise<void> => {
    if (!viewOnlyShareTarget) return;
    setIsCreatingViewOnlyShare(true);
    setViewOnlyShareError(null);
    try {
      // View-only shares: no class targeting (rosterIds=[]) and no due date.
      // The session/assignment carry the org-wide view-only mode so rules
      // block submissions; class targeting has no functional effect here.
      const sessionId = await onAssign(viewOnlyShareTarget, [], null);
      setViewOnlyShareLink(
        `${window.location.origin}/activity/${encodeURIComponent(sessionId)}`
      );
    } catch (err) {
      setViewOnlyShareError(
        err instanceof Error ? err.message : 'Failed to create share link.'
      );
    } finally {
      setIsCreatingViewOnlyShare(false);
    }
  };

  const closeViewOnlyShareModal = () => {
    setViewOnlyShareTarget(null);
    setViewOnlyShareLink(null);
    setViewOnlyShareError(null);
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

  const useExternalDnd = Boolean(userId) && !selectionMode;
  const cardDragEnabled =
    (useExternalDnd || Boolean(onReorderActivities)) && !selectionMode;

  const renderLibraryTab = (): React.ReactElement => (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex-1 min-w-0 flex flex-col">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {selectionMode && selection.count > 0 && (
          <div className="mb-3">
            <BulkActionBar
              count={selection.count}
              onClear={() => selection.clear()}
              folders={folderState.folders}
              onMove={handleBulkMove}
              onDelete={handleBulkDelete}
              busy={bulkBusy}
            />
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
              // Phase 5 — Duplicate. Stacked below Edit (and Results when
              // wired) so the destructive Delete remains the last entry.
              ...(onDuplicate
                ? [
                    buildDuplicateAction(
                      activity,
                      () => void onDuplicate(activity),
                      {
                        disabled: isDuplicating?.(activity.id),
                        disabledReason: 'Duplicating…',
                      }
                    ),
                  ]
                : []),
              buildMoveToFolderAction({
                onOpenPicker: () => setFolderPickerTarget(activity),
                disabled: !userId,
              }),
              ...(onShareWithPlc
                ? [
                    {
                      id: 'share-with-plc',
                      label: 'Share with PLC',
                      icon: Users2,
                      onClick: () => onShareWithPlc(activity),
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
                    void onDelete(activity);
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
                  label: primaryActionLabel,
                  icon: Link2,
                  onClick: () => {
                    if (isViewOnly) {
                      // View-only: skip the AssignModal/picker flow entirely.
                      setViewOnlyShareTarget(activity);
                      setViewOnlyShareLink(null);
                      setViewOnlyShareError(null);
                    } else {
                      setAssignTarget(activity);
                    }
                  },
                }}
                secondaryActions={secondaryActions}
                // Phase 5 follow-up — single-click opens preview pane,
                // double-click opens editor. See QuizManager for rationale.
                onClick={() => setPreviewActivityId(activity.id)}
                onDoubleClick={() => onEdit(activity)}
                viewMode={libraryView.state.viewMode}
                meta={activity}
                selectionMode={selectionMode}
                selected={selection.isSelected(activity.id)}
                onSelectionToggle={() => selection.toggle(activity.id)}
              />
            );
          }}
        />
      </div>
      {previewActivity && (
        <LibraryPreviewPane
          isOpen={true}
          onClose={() => setPreviewActivityId(null)}
          title={previewActivity.title}
          subtitle={
            <>
              {previewActivity.questionCount}{' '}
              {previewActivity.questionCount === 1 ? 'question' : 'questions'}
              {previewActivity.updatedAt
                ? ` · Updated ${new Date(previewActivity.updatedAt).toLocaleDateString()}`
                : ''}
            </>
          }
          primaryAction={{
            label: 'Open editor',
            icon: Edit2,
            onClick: () => {
              const a = previewActivity;
              setPreviewActivityId(null);
              onEdit(a);
            },
          }}
        >
          <VideoActivityPreviewPaneContent activity={previewActivity} />
        </LibraryPreviewPane>
      )}
    </div>
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
      <div className="flex flex-col">
        {list.map((assignment) => (
          <VideoActivityArchiveRow
            key={assignment.id}
            assignment={assignment}
            mode={mode}
            secondaryActions={buildAssignmentSecondaryActions(assignment, mode)}
            onArchiveCopyUrl={onArchiveCopyUrl}
            onArchiveMonitor={onArchiveMonitor}
            onArchiveResults={onArchiveResults}
          />
        ))}
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
    const assignmentIsViewOnly = assignment.mode === 'view-only';

    if (mode === 'active') {
      // Submissions cards keep "Copy link" in the kebab as a stable
      // secondary surface (the primary may be Monitor/Start/Results
      // depending on state). View-only Shared cards already pin "Copy
      // link" as the primary action — duplicating it in the kebab is just
      // visual noise.
      if (onArchiveCopyUrl && !assignmentIsViewOnly) {
        actions.push({
          id: 'copy-url',
          label: 'Copy link',
          icon: Copy,
          onClick: () => onArchiveCopyUrl(assignment),
        });
      }
      // Pause/Resume is meaningful only for submission assignments — view-only
      // shares are either live or ended, with no "paused while collecting" state.
      if (onArchivePauseResume && !assignmentIsViewOnly) {
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
          label: assignmentIsViewOnly ? 'End share' : 'End assignment',
          icon: Ban,
          onClick: () => {
            void onArchiveDeactivate(assignment);
          },
        });
      }
      // PR3 cross-teacher sharing — works for any submission assignment
      // (PLC linkage is optional in PR3a; the share doc carries the
      // teacher's settings either way and peers can import it). Label
      // says "peers" rather than "PLC" because the button isn't gated
      // on `assignment.plc` — it's a generic peer-handoff affordance.
      if (onArchiveShare && !assignmentIsViewOnly) {
        actions.push({
          id: 'share-with-peers',
          label: 'Share with peers',
          icon: Share2,
          onClick: () => {
            void onArchiveShare(assignment);
          },
        });
      }
      // "Assign to Google Classroom" — only when the host provides the handler
      // (CLASSROOM_ASSIGN_ENABLED) and the assignment collects submissions.
      if (onArchiveAssignToClassroom && !assignmentIsViewOnly) {
        actions.push({
          id: 'assign-to-classroom',
          label: 'Assign to Google Classroom',
          icon: GraduationCap,
          onClick: () => onArchiveAssignToClassroom(assignment),
        });
      }
    }

    // Reactivate is view-only-only, archive-only — flips status back to
    // active so the URL works again. Cf. MiniAppManager.assignmentSecondary.
    if (
      mode === 'archive' &&
      assignmentIsViewOnly &&
      onArchiveReactivate !== undefined
    ) {
      actions.push({
        id: 'reactivate',
        label: 'Reactivate',
        icon: RotateCcw,
        onClick: () => {
          void onArchiveReactivate(assignment);
        },
      });
    }

    // View-only shares have no responses to surface.
    if (onArchiveResults && !assignmentIsViewOnly) {
      actions.push({
        id: 'results',
        label: 'Results',
        icon: BarChart3,
        onClick: () => onArchiveResults(assignment),
      });
    }

    // PR3c — surface "Publish scores" on the archive kebab when the
    // assignment carries submissions. Label flips to "Update published
    // scores" once a level is set so the teacher sees that re-opening
    // the modal will replace, not stack.
    if (onArchivePublishScores && !assignmentIsViewOnly) {
      const isPublished =
        assignment.scoreVisibility !== undefined &&
        assignment.scoreVisibility !== 'none';
      actions.push({
        id: 'publish-scores',
        label: isPublished ? 'Update published scores' : 'Publish scores',
        icon: Send,
        onClick: () => onArchivePublishScores(assignment),
      });
    }
    if (
      onArchiveUnpublishScores &&
      !assignmentIsViewOnly &&
      assignment.scoreVisibility !== undefined &&
      assignment.scoreVisibility !== 'none'
    ) {
      actions.push({
        id: 'unpublish-scores',
        label: 'Unpublish scores',
        icon: EyeOff,
        onClick: async () => {
          const ok = await showConfirm(
            'Students will no longer be able to see their scores or responses. You can republish anytime.',
            {
              title: 'Unpublish scores',
              variant: 'danger',
              confirmLabel: 'Unpublish',
            }
          );
          if (ok) await onArchiveUnpublishScores(assignment);
        },
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
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                selectionMode
                  ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
                  : 'bg-white/70 text-slate-600 hover:bg-white hover:text-slate-800'
              }`}
              aria-pressed={selectionMode}
              title={
                selectionMode ? 'Exit selection mode' : 'Enter selection mode'
              }
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
          ) : undefined
        }
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
          label: primaryActionLabel,
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
      tabLabels={isViewOnly ? { active: 'Shared' } : undefined}
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

      {assignTarget && !isViewOnly && (
        <AssignModal<VideoActivitySessionSettings>
          isOpen={true}
          onClose={() => {
            setAssignTarget(null);
            setAssignDueAt(null);
          }}
          itemTitle={assignTarget.title}
          options={assignOptions}
          onOptionsChange={setAssignOptions}
          assignmentName={assignmentName}
          onAssignmentNameChange={setAssignmentName}
          confirmLabel="Assign"
          onAssign={handleAssignConfirm}
          extraSlot={
            <AssignBehaviorSummaryVA
              meta={assignTarget}
              dueAt={assignDueAt}
              onDueAtChange={setAssignDueAt}
              rosters={rosters}
              pickerValue={pickerValue}
              onPickerChange={setPickerValue}
              assignError={assignError}
              onEditInActivity={() => {
                setAssignTarget(null);
                setAssignDueAt(null);
                onEdit(assignTarget);
              }}
            />
          }
        />
      )}

      {viewOnlyShareTarget && (
        <ViewOnlyShareModal
          itemTitle={viewOnlyShareTarget.title}
          isCreating={isCreatingViewOnlyShare}
          createdLink={viewOnlyShareLink}
          error={viewOnlyShareError}
          onConfirm={() => void handleConfirmViewOnlyShare()}
          onClose={closeViewOnlyShareModal}
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

/**
 * AssignBehaviorSummaryVA — slimmed extraSlot for the standalone VA assign
 * modal (VA Task 9 parity with Quiz Task 9).
 *
 * Renders:
 *   1. The class/period picker (AssignClassPicker).
 *   2. A due-date date input.
 *   3. A read-only behavior summary derived from `getVideoActivityBehavior(meta)`,
 *      plus an "Edit in activity" button. The button calls `onEditInActivity`
 *      so the parent can open the editor's Settings tab.
 *   4. An inline error message if `assignError` is set.
 */
const AssignBehaviorSummaryVA: React.FC<{
  meta: VideoActivityMetadata;
  dueAt: number | null;
  onDueAtChange: (dueAt: number | null) => void;
  rosters: ClassRoster[];
  pickerValue: AssignClassPickerValue;
  onPickerChange: (next: AssignClassPickerValue) => void;
  assignError: string | null;
  onEditInActivity?: () => void;
}> = ({
  meta,
  dueAt,
  onDueAtChange,
  rosters,
  pickerValue,
  onPickerChange,
  assignError,
  onEditInActivity,
}) => {
  const behavior = getVideoActivityBehavior(meta);
  const summary = formatVideoActivityBehaviorSummary(behavior);

  // Use local-time helpers so the picker date matches the school's timezone (not UTC).
  const dateInputValue = splitDueAtToInputs(dueAt, true).date;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onDueAtChange(null);
    } else {
      onDueAtChange(dueInputsToEpoch(val, DEFAULT_DUE_TIME));
    }
  };

  return (
    <>
      <AssignClassPicker
        rosters={rosters}
        value={pickerValue}
        onChange={onPickerChange}
      />

      {assignError && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{assignError}</span>
        </div>
      )}

      {/* Due date */}
      <div>
        <label
          htmlFor="va-assign-due-date-input"
          className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1"
        >
          Due Date <span className="font-normal">(optional)</span>
        </label>
        <input
          id="va-assign-due-date-input"
          type="date"
          data-testid="va-assign-due-date"
          value={dateInputValue}
          onChange={handleDateChange}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>

      {/* Read-only behavior summary */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            Behavior
          </p>
          <button
            type="button"
            onClick={onEditInActivity}
            className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            Edit in activity
          </button>
        </div>
        <p
          data-testid="va-behavior-summary"
          className="text-sm text-slate-600 leading-snug"
        >
          {summary}
        </p>
      </div>
    </>
  );
};

/**
 * Lightweight preview pane content for the VideoActivityManager.
 * Renders metadata + an embedded YouTube thumbnail. Activity authoring
 * uses Google Drive for the full question data, which would require a
 * Drive load to render here — keeping the pane to metadata-only keeps
 * it responsive on click.
 */
const VideoActivityPreviewPaneContent: React.FC<{
  activity: VideoActivityMetadata;
}> = ({ activity }) => {
  const created = activity.createdAt
    ? new Date(activity.createdAt).toLocaleDateString()
    : null;
  const updated = activity.updatedAt
    ? new Date(activity.updatedAt).toLocaleDateString()
    : null;
  // Reuse the canonical YouTube-URL helper so the pane recognises the
  // full URL set the Creator path accepts (watch?v=, youtu.be/, embed/,
  // v/, shorts/, watch?…&v=). Returns null on anything else — pane
  // falls back to a neutral placeholder.
  const youtubeId = activity.youtubeUrl
    ? extractYouTubeId(activity.youtubeUrl)
    : null;
  return (
    <div className="flex flex-col gap-3 text-sm text-slate-700">
      {youtubeId ? (
        <img
          src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
          alt=""
          className="w-full rounded-lg border border-slate-200 bg-slate-100"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
          No video preview
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <VAStat label="Questions" value={String(activity.questionCount)} />
        {created && <VAStat label="Created" value={created} />}
        {updated && <VAStat label="Last updated" value={updated} />}
      </div>
    </div>
  );
};

const VAStat: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <div className="text-xxs font-bold uppercase tracking-wider text-slate-400">
      {label}
    </div>
    <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
  </div>
);

/**
 * QuizManager — teacher's quiz library view.
 *
 * Wave 2-QZ refactor: this component now composes the shared Library
 * primitives (`LibraryShell`, `LibraryToolbar`, `LibraryGrid`,
 * `LibraryItemCard`, `useLibraryView`, `useSortableReorder`) rather than
 * hand-rolling 3-tab chrome + quiz cards. The Assign flow uses
 * `AssignModal` with the PLC section rendered into `plcSlot` and
 * quiz-specific toggles (tab-switch detection, reveal correct, speed/streak
 * bonus, podium, sound) rendered into `extraSlot`. Archive rows delegate
 * to `AssignmentArchiveCard`.
 *
 * Behavior is preserved 1:1 from the previous implementation — all PLC
 * semantics, 2-stage assign flow, status-aware assignment cards, and
 * overflow-menu actions are identical; this refactor changes structure
 * only, not functionality.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Plus,
  FileUp,
  Play,
  Edit2,
  Trash2,
  BarChart3,
  Eye,
  Link2,
  User,
  Zap,
  Clock,
  Share2,
  AlertTriangle,
  Monitor,
  Rocket,
  Settings as SettingsIcon,
  Pause,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Calendar,
  Radio,
  Inbox,
  Loader2,
  AlertCircle,
  CheckSquare,
  Cloud,
  CloudOff,
} from 'lucide-react';
import {
  AssignmentMode,
  QuizMetadata,
  QuizSessionMode,
  QuizConfig,
  ClassRoster,
  QuizAssignment,
  SyncedQuizGroup,
} from '@/types';
import { type QuizSessionOptions } from '@/hooks/useQuizSession';
import { AttemptLimitRow } from './AttemptLimitRow';
import { Toggle } from '@/components/common/Toggle';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import { usePlcs } from '@/hooks/usePlcs';
import {
  mapLegacyClassIdsToRosterIds,
  resolveAssignmentTargets,
} from '@/utils/resolveAssignmentTargets';
import {
  LibraryShell,
  LibraryToolbar,
  LibraryGrid,
  LibraryItemCard,
  AssignModal,
  ViewOnlyShareModal,
  CollapsibleSection,
  AssignmentArchiveCard,
  ViewCountBadge,
  FolderSidebar,
  FolderPickerPopover,
  LibraryDndContext,
  buildMoveToFolderAction,
  useLibraryView,
  useLibrarySelection,
  useSortableReorder,
  BulkActionBar,
  type LibraryMenuAction,
  type LibrarySortOption,
  type AssignModeOption,
  type AssignmentStatusBadge,
  type LibraryBadgeTone,
  type LibrarySelectionApi,
} from '@/components/common/library';
import {
  countItemsByFolder,
  filterByFolder,
} from '@/components/common/library/folderFilters';
import { useFolders } from '@/hooks/useFolders';
import { useSessionViewCount } from '@/hooks/useSessionViewCount';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';

export interface PlcOptions {
  plcMode: boolean;
  teacherName?: string;
  /** @deprecated Use periodNames instead. */
  periodName?: string;
  periodNames?: string[];
  plcSheetUrl?: string;
  /**
   * Selected PLC whose shared sheet should receive this assignment's
   * results. When set and `plcMode === true`, the caller (QuizWidget)
   * resolves `plcSheetUrl` by either reading `plcs/{plcId}.sharedSheetUrl`
   * or auto-creating a new sheet and caching it back onto the PLC doc.
   * `undefined` means the teacher is opting into the legacy
   * manual-paste-URL flow (e.g. they aren't a member of any PLC or
   * auto-create failed).
   */
  plcId?: string;
}

/* ─── Assign-modal options shape (internal) ───────────────────────────────── */

interface QuizAssignOptions {
  tabWarningsEnabled: boolean;
  showResultToStudent: boolean;
  showCorrectAnswerToStudent: boolean;
  showCorrectOnBoard: boolean;
  speedBonusEnabled: boolean;
  streakBonusEnabled: boolean;
  showPodiumBetweenQuestions: boolean;
  soundEffectsEnabled: boolean;
  /** Max completed submissions per student. null = unlimited. Default 1. */
  attemptLimit: number | null;
  plcMode: boolean;
  teacherName: string;
  plcSheetUrl: string;
  /**
   * Selected PLC id when the teacher is a member of one or more PLCs.
   * Empty string = no PLC selected (manual-URL fallback).
   */
  plcId: string;
  /** Unified roster picker state. */
  picker: AssignClassPickerValue;
}

/**
 * Resolve the effective period-name labels from selected rosters. These
 * labels drive the post-PIN period picker on the student app and the PLC
 * Google Sheet export. Delegates to the shared `resolveAssignmentTargets`
 * so roster lookup + period-name dedup live in one place.
 */
function resolveEffectivePeriodNames(
  picker: AssignClassPickerValue,
  rosters: ClassRoster[]
): string[] {
  return resolveAssignmentTargets(picker, rosters).periodNames;
}

function buildDefaultAssignOptions(
  config: QuizConfig,
  quizId: string | undefined,
  rosters: ClassRoster[],
  defaultTeacherName?: string
): QuizAssignOptions {
  // Prefer the unified `lastRosterIdsByQuizId` memory. Fall back to legacy
  // ClassLink-sourcedId maps (`lastClassIdsByQuizId` / `lastClassIdByQuizId`)
  // so teachers who upgraded from pre-unification configs don't lose their
  // per-quiz preselection on first launch.
  let rememberedRosters = quizId
    ? (config.lastRosterIdsByQuizId?.[quizId] ?? [])
    : [];
  if (rememberedRosters.length === 0 && quizId) {
    const legacyMulti = config.lastClassIdsByQuizId?.[quizId];
    const legacySingle = config.lastClassIdByQuizId?.[quizId];
    const legacyClassIds =
      legacyMulti ?? (legacySingle ? [legacySingle] : undefined);
    rememberedRosters = mapLegacyClassIdsToRosterIds(legacyClassIds, rosters);
  }
  return {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: false,
    // Default: one attempt per student. Teachers can switch to 2/3/Unlimited
    // in the assign modal or later in the assignment settings.
    attemptLimit: 1,
    plcMode: config.plcMode ?? false,
    // Auto-fill from the signed-in teacher's display name when neither the
    // widget config nor a prior assignment carried a saved name. Falls back
    // to '' so empty Google profiles still render the placeholder cleanly.
    teacherName: config.teacherName ?? defaultTeacherName ?? '',
    // Intentionally NOT seeded from `config.plcSheetUrl`. Per-assignment
    // auto-create is the new default; pre-populating the field from a prior
    // assignment's URL was the bug teachers reported (every new assignment
    // appearing to be linked to the same sheet). Manual paste still works
    // — the user opens the dialog, toggles "Auto-Generated PLC Sheet" off,
    // and pastes a URL.
    plcSheetUrl: '',
    plcId: '',
    picker:
      rememberedRosters.length > 0
        ? { rosterIds: rememberedRosters }
        : makeEmptyPickerValue(),
  };
}

const ASSIGN_MODES: AssignModeOption[] = [
  {
    id: 'teacher',
    label: 'Teacher-paced',
    description: 'You control when to move to the next question.',
    icon: User,
  },
  {
    id: 'auto',
    label: 'Auto-progress',
    description: 'Moves automatically once everyone has answered.',
    icon: Zap,
  },
  {
    id: 'student',
    label: 'Self-paced',
    description: 'Students move through questions at their own speed.',
    icon: Clock,
  },
];

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface QuizManagerProps {
  /** Teacher's Firebase UID — used to scope the folders subcollection. */
  userId?: string;
  quizzes: QuizMetadata[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onImport: () => void;
  onEdit: (quiz: QuizMetadata) => void;
  onPreview: (quiz: QuizMetadata) => void;
  onAssign: (
    quiz: QuizMetadata,
    mode: QuizSessionMode,
    plcOptions: PlcOptions,
    sessionOptions: QuizSessionOptions,
    /** Selected roster IDs (unified picker output). */
    rosterIds: string[],
    /** Max completed submissions per student; null = unlimited. */
    attemptLimit: number | null
  ) => void;
  /**
   * View-only Share callback — invoked when the org-wide assignment mode
   * for Quiz is `'view-only'` and the teacher clicks the Share button.
   * Bypasses the AssignModal entirely (no mode picker, no PLC, no
   * settings, no class targeting — none of which apply to view-only
   * shares). Should mint a session/assignment with view-only mode and
   * return the student-facing URL for the modal to display. Required
   * when `assignmentMode` is `'view-only'`; otherwise unused.
   */
  onCreateViewOnlyShare?: (quiz: QuizMetadata) => Promise<string>;
  onResults: (quiz: QuizMetadata) => void;
  onDelete: (quiz: QuizMetadata) => void | Promise<void>;
  /**
   * Optional batch delete that bypasses the per-quiz confirmation/toasts
   * fired by `onDelete` (see QuizWidget's `onDelete` wiring, which prompts
   * per-quiz when archived assignments exist). Receives every selected
   * quiz — implementers are responsible for their own aggregated confirms
   * and summary toasts. Resolve to `true` when a delete was attempted
   * (selection will be cleared) or `false` when the handler aborted or
   * the user cancelled (selection will be preserved so they can retry).
   */
  onBulkDelete?: (quizzes: QuizMetadata[]) => Promise<boolean>;
  onShare: (quiz: QuizMetadata) => void;
  rosters: ClassRoster[];
  config: QuizConfig;

  managerTab?: 'library' | 'active' | 'archive';
  onTabChange?: (tab: 'library' | 'active' | 'archive') => void;
  assignments?: QuizAssignment[];
  assignmentsLoading?: boolean;
  onArchiveCopyUrl?: (assignment: QuizAssignment) => void;
  onArchiveMonitor?: (assignment: QuizAssignment) => void | Promise<void>;
  /** Start a paused assignment: resume + navigate to monitor. */
  onArchiveStart?: (assignment: QuizAssignment) => void | Promise<void>;
  onArchiveResults?: (assignment: QuizAssignment) => void | Promise<void>;
  onArchiveEditSettings?: (assignment: QuizAssignment) => void;
  onArchiveShare?: (assignment: QuizAssignment) => void | Promise<void>;
  onArchivePauseResume?: (assignment: QuizAssignment) => void | Promise<void>;
  onArchiveDeactivate?: (assignment: QuizAssignment) => void | Promise<void>;
  /** Reopen an ended assignment back to a paused state. */
  onArchiveReopen?: (assignment: QuizAssignment) => void | Promise<void>;
  onArchiveDelete?: (assignment: QuizAssignment) => void | Promise<void>;
  /** Persist the library grid/list toggle into widget config. */
  onLibraryViewModeChange?: (mode: 'grid' | 'list') => void;
  /**
   * Signed-in teacher's display name. Used as the auto-fill default for the
   * "Your Name" / `teacherName` field in the assign modal when neither the
   * widget config nor a prior assignment carried a saved name. Threaded
   * through from Widget.tsx → useAuth().user.displayName.
   */
  defaultTeacherName?: string;
  /**
   * Live snapshot of `/synced_quizzes/{groupId}` docs the local user
   * participates in. Drives the "Synced" / "Sync available" pills on
   * library cards and the "Sync" button on assignment cards. The
   * absence of an entry for a quiz's `syncGroupId` (e.g. while the
   * subscription is hydrating) renders as "synced but version
   * unknown" — the badges hide, the actions stay disabled.
   */
  syncedGroups?: Map<string, SyncedQuizGroup>;
  /**
   * Pull the canonical content for a synced quiz into the local Drive
   * replica. Wired from Widget.tsx → useQuiz.pullSyncedQuiz.
   */
  onPullSyncedQuiz?: (quiz: QuizMetadata) => void | Promise<void>;
  /**
   * Detach a quiz from its synced group ("Stop syncing"). Wired from
   * Widget.tsx → useQuiz.detachSyncedQuiz.
   */
  onDetachSyncedQuiz?: (quiz: QuizMetadata) => void | Promise<void>;
  /**
   * Rebuild a synced assignment's session questions from the latest
   * canonical content. Wired from Widget.tsx →
   * useQuizAssignments.syncAssignmentToLatest.
   */
  onSyncAssignment?: (a: QuizAssignment) => void | Promise<void>;
  /** Org-wide assignment mode. Drives Assign-vs-Share button labels and the
   *  In-Progress-vs-Shared tab label. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
}

/* ─── Status resolver for archive cards ───────────────────────────────────── */

function resolveStatus(
  status: QuizAssignment['status'],
  isViewOnly: boolean
): AssignmentStatusBadge {
  // View-only shares get share-flavored labels so the active/archive UI
  // doesn't pretend submissions are happening when they aren't. "Closed"
  // is the cross-widget archive label (cf. MiniAppManager.statusBadge).
  if (isViewOnly) {
    if (status === 'inactive') {
      return { label: 'Closed', tone: 'neutral' };
    }
    return { label: 'Shared', tone: 'success', dot: true };
  }
  if (status === 'active') {
    return { label: 'Live', tone: 'success', dot: true };
  }
  if (status === 'paused') {
    return { label: 'Paused', tone: 'warn', dot: true };
  }
  return { label: 'Ended', tone: 'neutral' };
}

/* ─── Helpers for library sort ────────────────────────────────────────────── */

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'updated', label: 'Last updated', defaultDir: 'desc' },
  { key: 'created', label: 'Date created', defaultDir: 'desc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'questions', label: 'Question count', defaultDir: 'desc' },
];

/* Module-level constants passed to useLibraryView / useSortableReorder —
 * keeping these stable across renders prevents `visibleItems` from being
 * re-derived every render (which would drive `useSortableReorder` into a
 * setState-during-render loop). */

const LIBRARY_SEARCH_FIELDS = (q: QuizMetadata): string => q.title;

const LIBRARY_INITIAL_SORT = { key: 'updated', dir: 'desc' as const };

const QUIZ_GET_ID = (q: QuizMetadata): string => q.id;

const REORDER_NOOP = (): void => {
  /* reorder persistence not implemented for Quiz */
};

const SORT_COMPARATORS: Record<
  string,
  (a: QuizMetadata, b: QuizMetadata, dir: 'asc' | 'desc') => number
> = {
  updated: (a, b, dir) => {
    const av = a.updatedAt || a.createdAt;
    const bv = b.updatedAt || b.createdAt;
    return dir === 'asc' ? av - bv : bv - av;
  },
  created: (a, b, dir) => {
    return dir === 'asc'
      ? a.createdAt - b.createdAt
      : b.createdAt - a.createdAt;
  },
  title: (a, b, dir) => {
    const cmp = a.title.localeCompare(b.title);
    return dir === 'asc' ? cmp : -cmp;
  },
  questions: (a, b, dir) => {
    return dir === 'asc'
      ? a.questionCount - b.questionCount
      : b.questionCount - a.questionCount;
  },
};

/* ─── Main component ──────────────────────────────────────────────────────── */

export const QuizManager: React.FC<QuizManagerProps> = ({
  userId,
  quizzes,
  loading,
  error,
  onNew,
  onImport,
  onEdit,
  onPreview,
  onAssign,
  onResults,
  onDelete,
  onBulkDelete,
  onShare,
  rosters,
  config,
  managerTab = 'library',
  onTabChange,
  assignments = [],
  assignmentsLoading = false,
  onArchiveCopyUrl,
  onArchiveMonitor,
  onArchiveStart,
  onArchiveResults,
  onArchiveEditSettings,
  onArchiveShare,
  onArchivePauseResume,
  onArchiveDeactivate,
  onArchiveReopen,
  onArchiveDelete,
  onLibraryViewModeChange,
  defaultTeacherName,
  syncedGroups,
  onPullSyncedQuiz,
  onDetachSyncedQuiz,
  onSyncAssignment,
  assignmentMode = 'submissions',
  onCreateViewOnlyShare,
}) => {
  const isViewOnly = assignmentMode === 'view-only';
  const primaryActionLabel = isViewOnly ? 'Share' : 'Assign';
  const noop = () => {
    /* action not wired */
  };

  const { showConfirm } = useDialog();

  // ─── Assign modal state (2-stage: mode → settings) ────────────────────────
  const [assignTarget, setAssignTarget] = useState<QuizMetadata | null>(null);

  // ─── View-only Share modal state ──────────────────────────────────────────
  // Bypasses the AssignModal entirely — class targeting, PLC, mode picker,
  // and per-assignment settings are all meaningless for view-only shares.
  const [viewOnlyShareTarget, setViewOnlyShareTarget] =
    useState<QuizMetadata | null>(null);
  const [viewOnlyShareLink, setViewOnlyShareLink] = useState<string | null>(
    null
  );
  const [viewOnlyShareError, setViewOnlyShareError] = useState<string | null>(
    null
  );
  const [isCreatingViewOnlyShare, setIsCreatingViewOnlyShare] = useState(false);

  const openShareOrAssign = useCallback(
    (quiz: QuizMetadata) => {
      if (isViewOnly) {
        setViewOnlyShareTarget(quiz);
        setViewOnlyShareLink(null);
        setViewOnlyShareError(null);
      } else {
        setAssignTarget(quiz);
      }
    },
    [isViewOnly]
  );

  const handleConfirmViewOnlyShare = useCallback(async () => {
    if (!viewOnlyShareTarget || !onCreateViewOnlyShare) return;
    setIsCreatingViewOnlyShare(true);
    setViewOnlyShareError(null);
    try {
      const url = await onCreateViewOnlyShare(viewOnlyShareTarget);
      setViewOnlyShareLink(url);
    } catch (err) {
      setViewOnlyShareError(
        err instanceof Error ? err.message : 'Failed to create share link.'
      );
    } finally {
      setIsCreatingViewOnlyShare(false);
    }
  }, [viewOnlyShareTarget, onCreateViewOnlyShare]);

  const closeViewOnlyShareModal = useCallback(() => {
    setViewOnlyShareTarget(null);
    setViewOnlyShareLink(null);
    setViewOnlyShareError(null);
  }, []);
  const [selectedMode, setSelectedMode] = useState<QuizSessionMode | null>(
    null
  );
  const [assignOptions, setAssignOptions] = useState<QuizAssignOptions>(() =>
    buildDefaultAssignOptions(config, undefined, rosters, defaultTeacherName)
  );

  // Subscribed at the parent so both AssignPlcSlot (UI) and
  // handleAssignConfirm (effective-id resolution) read the same source.
  const { plcs } = usePlcs();

  // Reset assign form when modal re-opens (adjust-state-while-rendering)
  const [prevAssignTarget, setPrevAssignTarget] = useState<QuizMetadata | null>(
    null
  );
  if (assignTarget !== prevAssignTarget) {
    setPrevAssignTarget(assignTarget);
    if (assignTarget) {
      setSelectedMode(null);
      setAssignOptions(
        buildDefaultAssignOptions(
          config,
          assignTarget.id,
          rosters,
          defaultTeacherName
        )
      );
    }
  }

  // Live ClassLink fetching is no longer performed at assign time. Imported
  // ClassLink rosters carry their own `classlinkClassId` metadata so the
  // student SSO gate resolves purely from rosters; live ClassLink data is
  // reached only via the Classes sidebar's Import dialog.

  // ─── Folder navigation (Wave 3-B-3) ───────────────────────────────────────
  const folderState = useFolders(userId, 'quiz');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  // Quiz whose "Move to folder…" picker is open (null = picker closed).
  const [folderPickerTarget, setFolderPickerTarget] =
    useState<QuizMetadata | null>(null);

  // ─── Bulk selection (Step 8) ──────────────────────────────────────────────
  const selection = useLibrarySelection();
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Exit selection mode if the user leaves the library tab
  const [prevManagerTab, setPrevManagerTab] = useState(managerTab);
  if (prevManagerTab !== managerTab) {
    setPrevManagerTab(managerTab);
    if (managerTab !== 'library' && selectionMode) {
      setSelectionMode(false);
      selection.clear();
    }
  }

  // Reset folder selection when the signed-in user changes or the selected
  // folder no longer exists (e.g. after delete, sign-out, or account switch).
  // Done in render via React's "adjust state during render" pattern so the
  // stale selection never participates in filtering.
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

  // Count quizzes per folder id (+ `root` for unfoldered items) for sidebar
  // badges.
  const folderItemCounts = useMemo(
    () => countItemsByFolder(quizzes),
    [quizzes]
  );

  // Filter BEFORE useLibraryView so search/sort only operate on the
  // currently-selected folder's quizzes.
  const folderFilteredQuizzes = useMemo(
    () => filterByFolder(quizzes, selectedFolderId),
    [quizzes, selectedFolderId]
  );

  // ─── Library tab toolbar state ────────────────────────────────────────────
  const libraryView = useLibraryView<QuizMetadata>({
    items: folderFilteredQuizzes,
    initialSort: LIBRARY_INITIAL_SORT,
    initialViewMode: config.libraryViewMode ?? 'grid',
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: SORT_COMPARATORS,
    onViewModeChange: onLibraryViewModeChange,
  });

  // useSortableReorder is used in no-op mode: Quiz metadata has no persisted
  // `order` field today, so we disable drag at the grid level. The hook still
  // mirrors items + commits nothing, preserving the primitive API.
  const reorder = useSortableReorder<QuizMetadata>({
    items: libraryView.visibleItems,
    getId: QUIZ_GET_ID,
    onCommit: REORDER_NOOP,
  });

  // ─── Derived counts for tab badges ────────────────────────────────────────
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'inactive'),
    [assignments]
  );
  const inactiveAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'inactive'),
    [assignments]
  );

  // ─── Build per-quiz card actions ──────────────────────────────────────────
  // Sync availability: a quiz is "stale" when its `sync.lastSyncedVersion`
  // trails the canonical `/synced_quizzes/{groupId}.version`. We surface
  // a "Sync available" action only when both sides are populated;
  // hydration races (group hasn't subscribed yet) collapse to "no
  // action shown" rather than an enabled-but-broken button.
  const buildQuizSecondaryActions = (
    quiz: QuizMetadata
  ): LibraryMenuAction[] => {
    const group = quiz.sync ? syncedGroups?.get(quiz.sync.groupId) : undefined;
    const isStale =
      !!group && group.version > (quiz.sync?.lastSyncedVersion ?? 0);
    const actions: LibraryMenuAction[] = [
      {
        id: 'preview',
        label: 'Preview',
        icon: Eye,
        onClick: () => onPreview(quiz),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Edit2,
        onClick: () => onEdit(quiz),
      },
      {
        id: 'stats',
        label: 'Stats',
        icon: BarChart3,
        onClick: () => onResults(quiz),
      },
      {
        id: 'share',
        label: 'Share',
        icon: Link2,
        onClick: () => onShare(quiz),
      },
    ];
    if (isStale && onPullSyncedQuiz) {
      actions.push({
        id: 'sync-now',
        label: 'Sync available',
        icon: RefreshCw,
        onClick: () => void onPullSyncedQuiz(quiz),
      });
    }
    if (quiz.sync && onDetachSyncedQuiz) {
      actions.push({
        id: 'stop-syncing',
        label: 'Stop syncing',
        icon: CloudOff,
        onClick: async () => {
          const ok = await showConfirm(
            `Stop syncing "${quiz.title}"? Your local copy will remain, but you won't see future changes from the synced group.`,
            {
              title: 'Stop Syncing',
              variant: 'warning',
              confirmLabel: 'Stop Syncing',
            }
          );
          if (ok) await onDetachSyncedQuiz(quiz);
        },
      });
    }
    actions.push(
      buildMoveToFolderAction({
        onOpenPicker: () => setFolderPickerTarget(quiz),
        disabled: !userId,
      })
    );
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: async () => {
        const ok = await showConfirm(
          `Delete "${quiz.title}"? This cannot be undone.`,
          {
            title: 'Delete Quiz',
            variant: 'danger',
            confirmLabel: 'Delete',
          }
        );
        if (ok) await onDelete(quiz);
      },
    });
    return actions;
  };

  /**
   * Compute the badge list for a quiz library card. Reflects the synced-
   * group state — "Synced" (info tone) when the quiz participates in a
   * group, upgraded to "Sync available" (warn tone) when canonical
   * `version` exceeds local `lastSyncedVersion`.
   */
  const buildQuizBadges = (quiz: QuizMetadata) => {
    if (!quiz.sync) return [];
    const group = syncedGroups?.get(quiz.sync.groupId);
    if (group && group.version > quiz.sync.lastSyncedVersion) {
      // Actionable badge: click pulls the canonical content into the local
      // Drive replica. The kebab menu still surfaces a redundant "Sync
      // available" item so keyboard / power users have a familiar path.
      return [
        {
          label: 'Sync available',
          tone: 'warn' as const,
          dot: true,
          icon: RefreshCw,
          actionLabel: 'Sync now',
          ...(onPullSyncedQuiz
            ? { onClick: () => void onPullSyncedQuiz(quiz) }
            : {}),
        },
      ];
    }
    return [{ label: 'Synced', tone: 'info' as const }];
  };

  // ─── Build archive-card actions ───────────────────────────────────────────
  const buildArchiveActions = (
    a: QuizAssignment,
    mode: 'active' | 'archive'
  ): {
    primary: {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      onClick: () => void;
    } | null;
    secondaries: LibraryMenuAction[];
  } => {
    const isActive = a.status === 'active';
    const urlLive = a.status !== 'inactive';
    // Per-assignment mode is frozen at creation. View-only shares have no
    // monitor / results to surface — collapse the action list accordingly.
    const assignmentIsViewOnly = a.mode === 'view-only';

    const secondaries: LibraryMenuAction[] = [];

    if (assignmentIsViewOnly) {
      // For archived (urlLive === false) view-only shares we keep the
      // "Reactivate" affordance as a kebab item rather than a primary
      // action — the card otherwise has no headline action, which matches
      // the "no Copy on dead link" rule (cf. F2 in the rollout plan).
      const primary = urlLive
        ? {
            label: 'Copy link',
            icon: Link2,
            onClick: () => (onArchiveCopyUrl ?? noop)(a),
          }
        : null;
      if (urlLive) {
        secondaries.push({
          id: 'deactivate',
          label: 'End share',
          icon: PowerOff,
          destructive: true,
          // Confirm before tearing down the URL — accidental dismissal
          // shouldn't kill a tracked link silently. Copy is view-only
          // flavored (no submissions to preserve, no roster to retire).
          onClick: async () => {
            const ok = await showConfirm(
              `End "${a.quizTitle}"? The link will stop working.`,
              {
                title: 'End share',
                variant: 'danger',
                confirmLabel: 'End',
              }
            );
            if (ok) await (onArchiveDeactivate ?? noop)(a);
          },
        });
      }
      // Archived view-only share: surface "Reactivate" as a kebab item
      // (lifts the URL out of the dead state). Cf. F3 in the rollout plan;
      // mirrors VideoActivityManager.buildAssignmentSecondaryActions.
      if (!urlLive && onArchiveReopen) {
        secondaries.push({
          id: 'reactivate',
          label: 'Reactivate',
          icon: RotateCcw,
          onClick: () => void onArchiveReopen(a),
        });
      }
      secondaries.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: async () => {
          const ok = await showConfirm(
            'Delete this share permanently? The link will stop working.',
            {
              title: 'Delete Share',
              variant: 'danger',
              confirmLabel: 'Delete',
            }
          );
          if (ok) await (onArchiveDelete ?? noop)(a);
        },
      });
      return {
        primary,
        secondaries: primary
          ? secondaries.filter((m) => m.label !== primary.label)
          : secondaries,
      };
    }

    if (mode === 'active') {
      // Primary: Monitor (active) or Start (paused)
      const primary = isActive
        ? {
            label: 'Monitor',
            icon: Monitor,
            onClick: () => void (onArchiveMonitor ?? noop)(a),
          }
        : {
            label: 'Start',
            icon: Rocket,
            onClick: () => void (onArchiveStart ?? noop)(a),
          };

      secondaries.push({
        id: 'copy-url',
        label: 'Copy Student Link',
        icon: Link2,
        onClick: () => (onArchiveCopyUrl ?? noop)(a),
        disabled: !urlLive,
      });
      if (isActive) {
        secondaries.push({
          id: 'monitor',
          label: 'Monitor',
          icon: Monitor,
          onClick: () => void (onArchiveMonitor ?? noop)(a),
        });
      }
      secondaries.push({
        id: 'results',
        label: 'Results',
        icon: BarChart3,
        onClick: () => void (onArchiveResults ?? noop)(a),
      });
      secondaries.push({
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        onClick: () => (onArchiveEditSettings ?? noop)(a),
      });
      secondaries.push({
        id: 'share',
        label: 'Share',
        icon: Share2,
        onClick: () => void (onArchiveShare ?? noop)(a),
      });
      // Sync now: only when this assignment is part of a synced group
      // AND the canonical doc has a newer version than the session
      // currently reflects. Includes a confirm because the rebuild
      // overwrites `session.publicQuestions` mid-stream.
      if (a.sync && onSyncAssignment) {
        const group = syncedGroups?.get(a.sync.groupId);
        const assignmentStale = !!group && group.version > a.sync.syncedVersion;
        if (assignmentStale) {
          secondaries.push({
            id: 'sync-assignment',
            label: 'Sync now',
            icon: Cloud,
            onClick: async () => {
              // Confirmation copy avoids promising "answers stay" because
              // students currently mid-attempt will see the new questions
              // appear on their next interaction (the session's
              // publicQuestions is replaced server-side). Their previously-
              // typed answers persist on the response doc but the question
              // each answer points at may have changed text — surfacing
              // that explicitly is more honest than implying continuity.
              const isLive = a.status === 'active';
              const liveWarning = isLive
                ? ' Students currently taking the quiz will see the new questions on their next interaction.'
                : '';
              const ok = await showConfirm(
                `Update this assignment to the latest version of "${a.quizTitle}"?${liveWarning} Existing responses are kept and any answers submitted before this update will be tagged in results.`,
                {
                  title: 'Sync Assignment',
                  variant: 'warning',
                  confirmLabel: 'Sync',
                }
              );
              if (ok) await onSyncAssignment(a);
            },
          });
        }
      }
      if (isActive) {
        secondaries.push({
          id: 'pause',
          label: 'Pause',
          icon: Pause,
          onClick: () => void (onArchivePauseResume ?? noop)(a),
        });
      }
      secondaries.push({
        id: 'deactivate',
        label: 'Make Inactive',
        icon: PowerOff,
        destructive: true,
        onClick: async () => {
          const ok = await showConfirm(
            'Make assignment inactive? The join URL will stop working. Responses are preserved.',
            {
              title: 'Make Inactive',
              variant: 'warning',
              confirmLabel: 'Make Inactive',
            }
          );
          if (ok) await (onArchiveDeactivate ?? noop)(a);
        },
      });
      secondaries.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: async () => {
          const ok = await showConfirm(
            'Delete this assignment and all responses? This cannot be undone.',
            {
              title: 'Delete Assignment',
              variant: 'danger',
              confirmLabel: 'Delete',
            }
          );
          if (ok) await (onArchiveDelete ?? noop)(a);
        },
      });
      // Filter any item matching the primary label to avoid duplication.
      return {
        primary,
        secondaries: secondaries.filter((m) => m.label !== primary.label),
      };
    }

    // Archive mode — primary is Results
    const primary = {
      label: 'Results',
      icon: BarChart3,
      onClick: () => void (onArchiveResults ?? noop)(a),
    };
    secondaries.push({
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      onClick: () => void (onArchiveMonitor ?? noop)(a),
    });
    secondaries.push({
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
      onClick: () => (onArchiveEditSettings ?? noop)(a),
    });
    secondaries.push({
      id: 'share',
      label: 'Share',
      icon: Share2,
      onClick: () => void (onArchiveShare ?? noop)(a),
    });
    secondaries.push({
      id: 'reopen',
      label: 'Reopen',
      icon: RefreshCw,
      onClick: () => void (onArchiveReopen ?? noop)(a),
    });
    secondaries.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: async () => {
        const ok = await showConfirm(
          'Delete this assignment and all responses? This cannot be undone.',
          {
            title: 'Delete Assignment',
            variant: 'danger',
            confirmLabel: 'Delete',
          }
        );
        if (ok) await (onArchiveDelete ?? noop)(a);
      },
    });
    return {
      primary,
      secondaries: secondaries.filter((m) => m.label !== primary.label),
    };
  };

  // ─── PLC sheet URL validation ─────────────────────────────────────────────
  const plcSheetUrlInvalid =
    !!assignOptions.plcSheetUrl &&
    !assignOptions.plcSheetUrl.startsWith(
      'https://docs.google.com/spreadsheets/'
    );

  // ─── Assign confirm handler ───────────────────────────────────────────────
  const handleAssignConfirm = (): void => {
    if (!assignTarget || !selectedMode) return;
    // Guard against stale rosterIds — rosters can be deleted or fail to load
    // (`loadError`) between the teacher's last assignment and the current one.
    // A roster without students can't produce a joinable session, so treat
    // `loadError` rosters as unavailable at confirm time in addition to the
    // picker-side disabled state.
    const visibleRosterIds = new Set(
      rosters.filter((r) => !r.loadError).map((r) => r.id)
    );
    const validRosterIds = assignOptions.picker.rosterIds.filter((id) =>
      visibleRosterIds.has(id)
    );
    const effectivePeriodNames = resolveEffectivePeriodNames(
      { rosterIds: validRosterIds },
      rosters
    );
    // Mirror AssignPlcSlot's effective-id derivation: an explicit choice
    // wins; otherwise auto-select when there's exactly one PLC. Computed
    // inline here so a teacher who never touched the dropdown (because
    // there's only one PLC) still gets that PLC piped through.
    const explicitPlc = plcs.find((p) => p.id === assignOptions.plcId);
    const effectivePlcId =
      explicitPlc?.id ?? (plcs.length === 1 ? plcs[0].id : '');
    const plcOptions: PlcOptions = {
      plcMode: assignOptions.plcMode,
      teacherName: assignOptions.teacherName || undefined,
      periodName: effectivePeriodNames[0] || undefined,
      periodNames:
        effectivePeriodNames.length > 0 ? effectivePeriodNames : undefined,
      plcSheetUrl: assignOptions.plcSheetUrl || undefined,
      plcId: effectivePlcId || undefined,
    };
    const sessionOptions: QuizSessionOptions = {
      tabWarningsEnabled: assignOptions.tabWarningsEnabled,
      showResultToStudent: assignOptions.showResultToStudent,
      showCorrectAnswerToStudent: assignOptions.showCorrectAnswerToStudent,
      showCorrectOnBoard: assignOptions.showCorrectOnBoard,
      speedBonusEnabled: assignOptions.speedBonusEnabled,
      streakBonusEnabled: assignOptions.streakBonusEnabled,
      showPodiumBetweenQuestions: assignOptions.showPodiumBetweenQuestions,
      soundEffectsEnabled: assignOptions.soundEffectsEnabled,
    };
    onAssign(
      assignTarget,
      selectedMode,
      plcOptions,
      sessionOptions,
      validRosterIds,
      assignOptions.attemptLimit
    );
    setAssignTarget(null);
    setSelectedMode(null);
  };

  // ─── Drop-to-folder handler ───────────────────────────────────────────────
  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      try {
        await moveItem(itemId, folderId);
      } catch (err) {
        console.error('[QuizManager] moveItem failed:', err);
      }
    },
    [userId, moveItem]
  );

  // ─── Bulk handlers (Step 8) ───────────────────────────────────────────────
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
              '[QuizManager] bulk move failed for',
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
    const targets = quizzes.filter((q) => selection.selectedIds.has(q.id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      // `didAttempt` gates the selection clear: if the user cancelled a
      // confirm or the widget-level handler aborted (e.g. assignments
      // still loading), keep the selection so they can retry without
      // re-selecting everything.
      let didAttempt = false;
      if (onBulkDelete) {
        // Widget-level handler owns confirmation + summary toasts.
        didAttempt = await onBulkDelete(targets);
      } else {
        const ok = await showConfirm(
          `Delete ${targets.length} quiz${targets.length === 1 ? '' : 'zes'}? This cannot be undone.`,
          {
            title: 'Delete Quizzes',
            variant: 'danger',
            confirmLabel: 'Delete',
          }
        );
        if (ok) {
          const results = await Promise.allSettled(
            targets.map(async (quiz) => onDelete(quiz))
          );
          results.forEach((result, idx) => {
            if (result.status === 'rejected') {
              console.error(
                '[QuizManager] bulk delete failed for',
                targets[idx]?.id,
                result.reason
              );
            }
          });
          didAttempt = true;
        }
      }
      if (didAttempt) {
        selection.clear();
        setSelectionMode(false);
      }
    } finally {
      setBulkBusy(false);
    }
  }, [selection, quizzes, onDelete, onBulkDelete, showConfirm]);

  // ─── Folder sidebar (Library tab only) ────────────────────────────────────
  const folderSidebarSlot =
    managerTab === 'library' && userId ? (
      <FolderSidebar
        widget="quiz"
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

  // ─── Shell header actions ─────────────────────────────────────────────────
  const primaryAction =
    managerTab === 'library'
      ? { label: 'New Quiz', icon: Plus, onClick: onNew }
      : undefined;
  const secondaryActions =
    managerTab === 'library'
      ? [{ label: 'Import', icon: FileUp, onClick: onImport }]
      : undefined;

  // ─── Toolbar for library tab ──────────────────────────────────────────────
  const toolbar =
    managerTab === 'library' ? (
      <LibraryToolbar
        {...libraryView.toolbarProps}
        searchPlaceholder="Search quizzes…"
        sortOptions={SORT_OPTIONS}
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
    ) : undefined;

  // ─── Loading/error shell content ──────────────────────────────────────────
  if (loading && managerTab === 'library') {
    return (
      <LibraryShell
        widgetLabel="Quiz"
        tab={managerTab}
        onTabChange={(t) => onTabChange?.(t)}
        counts={{
          library: quizzes.length,
          active: activeAssignments.length,
          archive: inactiveAssignments.length,
        }}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        toolbarSlot={toolbar}
        filterSidebarSlot={folderSidebarSlot}
      >
        <div className="flex flex-col items-center justify-center h-full text-brand-blue-primary gap-3 py-10">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-medium">Loading quizzes…</span>
        </div>
      </LibraryShell>
    );
  }

  // ─── Ordered ids for LibraryDndContext (for overlay + reorder routing) ───
  const orderedIds = reorder.orderedItems.map(QUIZ_GET_ID);
  const renderDragOverlay = (activeId: string): React.ReactNode => {
    const quiz = reorder.orderedItems.find((q) => q.id === activeId);
    if (!quiz) return null;
    return (
      <LibraryItemCard<QuizMetadata>
        id={quiz.id}
        title={quiz.title}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="bg-brand-blue-lighter text-brand-blue-primary font-bold rounded px-1.5 text-[10px] uppercase">
              {quiz.questionCount} Qs
            </span>
            <span>
              Updated{' '}
              {new Date(quiz.updatedAt || quiz.createdAt).toLocaleDateString()}
            </span>
          </span>
        }
        primaryAction={{
          label: primaryActionLabel,
          icon: Play,
          onClick: () => openShareOrAssign(quiz),
        }}
        secondaryActions={buildQuizSecondaryActions(quiz)}
        viewMode="list"
        sortable={false}
        isDragOverlay
        meta={quiz}
      />
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const shell = (
    <LibraryShell
      widgetLabel="Quiz"
      tab={managerTab}
      onTabChange={(t) => onTabChange?.(t)}
      counts={{
        library: quizzes.length,
        active: activeAssignments.length,
        archive: inactiveAssignments.length,
      }}
      tabLabels={isViewOnly ? { active: 'Shared' } : undefined}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      toolbarSlot={toolbar}
      filterSidebarSlot={folderSidebarSlot}
    >
      {managerTab === 'library' && (
        <LibraryTabContent
          error={error}
          orderedItems={reorder.orderedItems}
          onAssignClick={(q) => openShareOrAssign(q)}
          buildSecondaryActions={buildQuizSecondaryActions}
          buildBadges={buildQuizBadges}
          onEdit={onEdit}
          onImport={onImport}
          totalCount={quizzes.length}
          reorderLocked={libraryView.reorderLocked}
          reorderLockedReason={libraryView.reorderLockedReason}
          enableCardDrag={Boolean(userId) && !selectionMode}
          viewMode={libraryView.state.viewMode}
          selection={selection}
          selectionMode={selectionMode}
          bulkBusy={bulkBusy}
          folders={folderState.folders}
          onBulkMove={handleBulkMove}
          onBulkDelete={handleBulkDelete}
          primaryActionLabel={primaryActionLabel}
        />
      )}

      {managerTab === 'active' && (
        <AssignmentsList
          assignments={activeAssignments}
          loading={assignmentsLoading}
          mode="active"
          buildActions={buildArchiveActions}
          syncedGroups={syncedGroups}
          emptyTitle={
            isViewOnly ? 'No active shares' : 'No quizzes in progress'
          }
          emptySub={
            isViewOnly
              ? 'Share a quiz from the Library tab to create a viewable link for students.'
              : 'Assign a quiz from the Library tab to get started. Active and paused assignments appear here.'
          }
        />
      )}

      {managerTab === 'archive' && (
        <AssignmentsList
          assignments={inactiveAssignments}
          loading={assignmentsLoading}
          mode="archive"
          buildActions={buildArchiveActions}
          syncedGroups={syncedGroups}
          emptyTitle={
            isViewOnly ? 'No archived shares' : 'No archived assignments'
          }
          emptySub={
            isViewOnly
              ? 'Ended share links will appear here.'
              : 'Ended assignments are moved here so you can review results and share them.'
          }
        />
      )}
    </LibraryShell>
  );

  return (
    <>
      {userId && managerTab === 'library' ? (
        <LibraryDndContext
          itemIds={orderedIds}
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
        <AssignModal<QuizAssignOptions>
          isOpen={!!assignTarget}
          onClose={() => {
            setAssignTarget(null);
            setSelectedMode(null);
          }}
          itemTitle={assignTarget.title}
          modes={ASSIGN_MODES}
          selectedMode={selectedMode ?? undefined}
          onModeChange={(id) => setSelectedMode(id as QuizSessionMode)}
          options={assignOptions}
          onOptionsChange={setAssignOptions}
          extraSlot={
            <AssignExtraSlot
              options={assignOptions}
              onChange={setAssignOptions}
              rosters={rosters}
            />
          }
          plcSlot={
            <AssignPlcSlot
              options={assignOptions}
              onChange={setAssignOptions}
              plcs={plcs}
              plcSheetUrlInvalid={plcSheetUrlInvalid}
              effectivePeriodCount={
                resolveEffectivePeriodNames(assignOptions.picker, rosters)
                  .length
              }
            />
          }
          onAssign={() => handleAssignConfirm()}
          confirmLabel="Assign"
          confirmDisabled={!selectedMode}
          confirmDisabledReason="Choose a session mode first."
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

/* ─── LibraryTabContent ──────────────────────────────────────────────────── */

const LibraryTabContent: React.FC<{
  error: string | null;
  orderedItems: QuizMetadata[];
  onAssignClick: (quiz: QuizMetadata) => void;
  buildSecondaryActions: (quiz: QuizMetadata) => LibraryMenuAction[];
  /**
   * Resolves the badge list for a single quiz card. Surfaces the
   * "Synced" / "Sync available" pills produced by the parent.
   */
  buildBadges?: (
    quiz: QuizMetadata
  ) => { label: string; tone: LibraryBadgeTone; dot?: boolean }[];
  onEdit: (quiz: QuizMetadata) => void;
  onImport: () => void;
  totalCount: number;
  reorderLocked: boolean;
  reorderLockedReason: string | undefined;
  /**
   * When true, cards are draggable (to folders) via the external
   * `LibraryDndContext`. Quiz has no card-to-card reorder, but we still
   * enable drag when a teacher is signed in so drag-to-folder works.
   */
  enableCardDrag: boolean;
  viewMode: 'grid' | 'list';
  selection: LibrarySelectionApi;
  selectionMode: boolean;
  bulkBusy: boolean;
  folders: import('@/types').LibraryFolder[];
  onBulkMove: (folderId: string | null) => Promise<void>;
  onBulkDelete: () => void | Promise<void>;
  primaryActionLabel: string;
}> = ({
  error,
  orderedItems,
  onAssignClick,
  buildSecondaryActions,
  buildBadges,
  onEdit,
  onImport,
  totalCount,
  reorderLocked,
  reorderLockedReason,
  enableCardDrag,
  viewMode,
  selection,
  selectionMode,
  bulkBusy,
  folders,
  onBulkMove,
  onBulkDelete,
  primaryActionLabel,
}) => {
  const emptyState =
    totalCount === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-brand-blue-primary/40 py-12 gap-4">
        <div className="bg-brand-blue-lighter/50 rounded-full border-2 border-dashed border-brand-blue-primary/20 p-6">
          <FileUp className="w-12 h-12" />
        </div>
        <div className="text-center">
          <p className="font-bold text-brand-blue-primary text-base">
            No quizzes yet
          </p>
          <p className="text-brand-blue-primary/60 font-medium text-sm mt-1 max-w-[220px]">
            Import a CSV or Google Sheet to build your library.
          </p>
        </div>
        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-2xl transition-all shadow-md active:scale-95 px-5 py-2.5 text-sm"
        >
          <Plus className="w-4 h-4" />
          Start Importing
        </button>
      </div>
    ) : (
      <div className="text-sm font-medium text-slate-500 py-8 text-center">
        No quizzes match your search.
      </div>
    );

  return (
    <>
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl text-brand-red-dark px-3 py-2 text-sm font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {selectionMode && selection.count > 0 && (
        <div className="mb-3">
          <BulkActionBar
            count={selection.count}
            onClear={() => selection.clear()}
            folders={folders}
            onMove={onBulkMove}
            onDelete={onBulkDelete}
            busy={bulkBusy}
          />
        </div>
      )}

      <LibraryGrid<QuizMetadata>
        items={orderedItems}
        getId={(q) => q.id}
        dragDisabled={!enableCardDrag}
        // Quiz has no manual reorder, so reorderLocked is noise; only surface
        // it when drag is fully disabled so the existing lock tooltip still
        // works on grids without folder drag.
        reorderLocked={enableCardDrag ? false : reorderLocked}
        reorderLockedReason={enableCardDrag ? undefined : reorderLockedReason}
        layout={viewMode}
        emptyState={emptyState}
        useExternalDndContext={enableCardDrag}
        renderCard={(quiz) => (
          <LibraryItemCard<QuizMetadata>
            key={quiz.id}
            id={quiz.id}
            title={quiz.title}
            subtitle={
              <span className="flex items-center gap-2">
                <span className="bg-brand-blue-lighter text-brand-blue-primary font-bold rounded px-1.5 text-[10px] uppercase">
                  {quiz.questionCount} Qs
                </span>
                <span>
                  Updated{' '}
                  {new Date(
                    quiz.updatedAt || quiz.createdAt
                  ).toLocaleDateString()}
                </span>
              </span>
            }
            primaryAction={{
              label: primaryActionLabel,
              icon: Play,
              onClick: () => onAssignClick(quiz),
            }}
            secondaryActions={buildSecondaryActions(quiz)}
            badges={buildBadges?.(quiz)}
            onClick={() => onEdit(quiz)}
            viewMode={viewMode}
            sortable={enableCardDrag}
            meta={quiz}
            selectionMode={selectionMode}
            selected={selection.isSelected(quiz.id)}
            onSelectionToggle={() => selection.toggle(quiz.id)}
          />
        )}
      />
    </>
  );
};

/* ─── AssignmentsList (for active + archive tabs) ────────────────────────── */

const AssignmentsList: React.FC<{
  assignments: QuizAssignment[];
  loading: boolean;
  mode: 'active' | 'archive';
  buildActions: (
    a: QuizAssignment,
    mode: 'active' | 'archive'
  ) => {
    /**
     * `null` when the card has no headline action — view-only archive cards
     * surface "Reactivate" via the kebab and intentionally omit the primary
     * to avoid a Copy-link button on a dead URL (cf. F2 in the rollout plan).
     */
    primary: {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      onClick: () => void;
    } | null;
    secondaries: LibraryMenuAction[];
  };
  /**
   * Synced-group state used to label assignment cards as "Synced" / "Sync
   * available" in the meta line. Optional — undefined collapses to the
   * legacy "no sync indicator" rendering.
   */
  syncedGroups?: Map<string, SyncedQuizGroup>;
  emptyTitle: string;
  emptySub: string;
}> = ({
  assignments,
  loading,
  mode,
  buildActions,
  syncedGroups,
  emptyTitle,
  emptySub,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-brand-blue-primary/60 gap-3 py-10">
        <Loader2 className="w-7 h-7 animate-spin" />
        <span className="text-sm">Loading assignments…</span>
      </div>
    );
  }
  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center text-brand-blue-primary/60 gap-3 py-10">
        <Inbox className="w-10 h-10 opacity-40" />
        <p className="font-semibold text-brand-blue-dark text-sm">
          {emptyTitle}
        </p>
        <p className="text-xs max-w-[360px]">{emptySub}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {assignments.map((a) => (
        <QuizArchiveRow
          key={a.id}
          assignment={a}
          mode={mode}
          buildActions={buildActions}
          syncedGroups={syncedGroups}
        />
      ))}
    </div>
  );
};

/* ─── Archive row wrapper (per-row hooks for view-count fetch) ────────────── */

interface QuizArchiveRowProps {
  assignment: QuizAssignment;
  mode: 'active' | 'archive';
  buildActions: (
    a: QuizAssignment,
    mode: 'active' | 'archive'
  ) => {
    primary: {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      onClick: () => void;
    } | null;
    secondaries: LibraryMenuAction[];
  };
  /**
   * Synced-group state used to label assignment cards as "Synced" / "Sync
   * available" in the meta line. Optional — undefined collapses to the
   * legacy "no sync indicator" rendering.
   */
  syncedGroups?: Map<string, SyncedQuizGroup>;
}

/**
 * Per-row hook host. View-only quizzes annotate the meta line with a view
 * count fetched from the session's `views/` subcollection on mount; synced
 * assignments get a "Synced" / "Sync available" pill driven by the
 * canonical group's version vs. the assignment's snapshotted version.
 */
const QuizArchiveRow: React.FC<QuizArchiveRowProps> = ({
  assignment: a,
  mode,
  buildActions,
  syncedGroups,
}) => {
  const assignmentIsViewOnly = a.mode === 'view-only';
  const { primary, secondaries } = buildActions(a, mode);
  const status = resolveStatus(a.status, assignmentIsViewOnly);
  const periods = a.periodNames ?? (a.periodName ? [a.periodName] : []);
  const urlLive = a.status !== 'inactive';
  const noPeriods = periods.length === 0 && mode === 'active';
  const periodLabel =
    periods.length === 1
      ? periods[0]
      : periods.length > 0
        ? `${periods.length} classes`
        : null;

  // Admin-only by default — view-count display fires one Firestore
  // aggregation per visible card per dashboard tab-focus, gated behind the
  // `share-link-tracking` global permission.
  const { canSeeShareTracking } = useAuth();
  const trackingEnabled = canSeeShareTracking();
  const { count } = useSessionViewCount(
    'quiz_sessions',
    // Quiz assignment id is also the underlying session id (1:1 — see the
    // QuizAssignment type's "Assignment UUID — also the sessionId" note).
    a.id,
    assignmentIsViewOnly && trackingEnabled
  );

  // Synced indicator: present iff this assignment was imported (or shared)
  // under sync mode AND the canonical group has been observed by the
  // parent's listener. Collapses to "Synced" when versions match, or
  // "Sync available" (warn) when canonical outpaces the assignment's
  // snapshotted version. Hidden on view-only shares — sync semantics
  // apply to submission-mode assignments only.
  const assignmentSync = a.sync;
  const syncBadge: { label: string; tone: 'info' | 'warn' } | null =
    !assignmentIsViewOnly && assignmentSync
      ? (() => {
          const group = syncedGroups?.get(assignmentSync.groupId);
          if (!group) {
            return { label: 'Synced', tone: 'info' };
          }
          if (group.version > assignmentSync.syncedVersion) {
            return { label: 'Sync available', tone: 'warn' };
          }
          return { label: 'Synced', tone: 'info' };
        })()
      : null;

  // Meta line composes per-mode. View-only shares show date + view count
  // only — the join code, class targeting, and live-radio dot all relate to
  // submissions plumbing that doesn't apply. Submissions show the full row.
  const dateChip = (
    <span className="inline-flex items-center gap-0.5">
      <Calendar className="w-3 h-3" />
      {new Date(a.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}
    </span>
  );

  let meta: React.ReactNode;
  if (assignmentIsViewOnly) {
    meta = (
      <>
        {dateChip}
        {trackingEnabled && <ViewCountBadge count={count} />}
      </>
    );
  } else {
    meta = (
      <>
        {dateChip}
        {urlLive && <span className="font-mono tracking-wider">{a.code}</span>}
        {noPeriods ? (
          <span className="font-semibold text-amber-600 truncate max-w-[120px]">
            No classes
          </span>
        ) : periodLabel != null ? (
          <span className="font-semibold truncate max-w-[120px]">
            {periodLabel}
          </span>
        ) : null}
        {status.tone === 'success' && (
          <span className="inline-flex items-center">
            <Radio className="w-3 h-3" />
          </span>
        )}
        {syncBadge && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              syncBadge.tone === 'warn'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            <Cloud className="w-2.5 h-2.5" />
            {syncBadge.label}
          </span>
        )}
      </>
    );
  }

  return (
    <AssignmentArchiveCard<QuizAssignment>
      assignment={a}
      mode={mode}
      status={status}
      title={a.quizTitle}
      subtitle={a.className?.trim() ? a.className : undefined}
      meta={meta}
      primaryAction={
        primary
          ? {
              label: primary.label,
              icon: primary.icon,
              onClick: primary.onClick,
            }
          : undefined
      }
      secondaryActions={secondaries}
    />
  );
};

/* ─── Assign modal slot components ───────────────────────────────────────── */

const AssignExtraSlot: React.FC<{
  options: QuizAssignOptions;
  onChange: (next: QuizAssignOptions) => void;
  rosters: ClassRoster[];
}> = ({ options, onChange, rosters }) => {
  const update = <K extends keyof QuizAssignOptions>(
    key: K,
    value: QuizAssignOptions[K]
  ) => onChange({ ...options, [key]: value });

  return (
    <>
      <AssignClassPicker
        rosters={rosters}
        value={options.picker}
        onChange={(picker) => update('picker', picker)}
      />

      <SectionHeader label="Quiz Integrity" />
      <AttemptLimitRow
        value={options.attemptLimit}
        onChange={(v) => update('attemptLimit', v)}
      />
      <ToggleRow
        label="Tab Switch Detection"
        checked={options.tabWarningsEnabled}
        onChange={(v) => update('tabWarningsEnabled', v)}
        hint="Warn students who leave the quiz tab"
      />

      <CollapsibleSection label="Answer Feedback">
        <ToggleRow
          compact
          label="Show right/wrong to students"
          checked={options.showResultToStudent}
          onChange={(v) => update('showResultToStudent', v)}
          hint="Students see ✓ or ✗ after submitting"
        />
        <ToggleRow
          compact
          label="Reveal correct answer to students"
          checked={options.showCorrectAnswerToStudent}
          onChange={(v) => update('showCorrectAnswerToStudent', v)}
          disabled={!options.showResultToStudent}
          hint="Also show what the correct answer was"
        />
        <ToggleRow
          compact
          label="Show correct answer on board"
          checked={options.showCorrectOnBoard}
          onChange={(v) => update('showCorrectOnBoard', v)}
          hint="Display correct answer on the projected screen"
        />
      </CollapsibleSection>

      <CollapsibleSection label="Gamification">
        <ToggleRow
          compact
          label="Speed Bonus Points"
          checked={options.speedBonusEnabled}
          onChange={(v) => update('speedBonusEnabled', v)}
          hint="Up to 50% bonus for fast answers"
        />
        <ToggleRow
          compact
          label="Streak Bonuses"
          checked={options.streakBonusEnabled}
          onChange={(v) => update('streakBonusEnabled', v)}
          hint="Multiplier for consecutive correct answers"
        />
        <ToggleRow
          compact
          label="Podium Between Questions"
          checked={options.showPodiumBetweenQuestions}
          onChange={(v) => update('showPodiumBetweenQuestions', v)}
          hint="Show top 3 leaderboard after each question"
        />
        <ToggleRow
          compact
          label="Sound Effects"
          checked={options.soundEffectsEnabled}
          onChange={(v) => update('soundEffectsEnabled', v)}
          hint="Chimes, ticks, and fanfares during the quiz"
        />
      </CollapsibleSection>
    </>
  );
};

const AssignPlcSlot: React.FC<{
  options: QuizAssignOptions;
  onChange: (next: QuizAssignOptions) => void;
  /**
   * Teacher's PLC memberships, threaded down from the parent so the
   * parent can also derive the effective PLC selection at
   * handleAssignConfirm time without re-subscribing to the same hook.
   */
  plcs: import('@/types').Plc[];
  plcSheetUrlInvalid: boolean;
  /**
   * Number of class periods the picker is contributing (ClassLink class
   * labels or local roster names). Drives the "students will see a picker"
   * hint without this slot needing to recompute the derivation itself.
   */
  effectivePeriodCount: number;
}> = ({
  options,
  onChange,
  plcs,
  plcSheetUrlInvalid,
  effectivePeriodCount,
}) => {
  const update = <K extends keyof QuizAssignOptions>(
    key: K,
    value: QuizAssignOptions[K]
  ) => onChange({ ...options, [key]: value });

  // Compute the effective selection on the fly instead of syncing with
  // an effect. Two cases:
  //   1. User has explicitly picked a still-existing PLC → use it
  //   2. Otherwise → auto-select the sole PLC when there's exactly one,
  //      else show no selection
  // A stale options.plcId (PLC was deleted while the modal was open)
  // collapses to ''; the assign-flow in Widget.tsx already tolerates an
  // empty plcId, so no separate cleanup is required. Computing this
  // derived value inline avoids the "calling a parent setter during
  // render" / "useEffect to sync state across components" antipatterns.
  const explicitlyChosen = plcs.find((p) => p.id === options.plcId) ?? null;
  const effectivePlcId =
    explicitlyChosen?.id ?? (plcs.length === 1 ? plcs[0].id : '');
  const selectedPlc = explicitlyChosen ?? (plcs.length === 1 ? plcs[0] : null);
  const hasCachedSheet = Boolean(selectedPlc?.sharedSheetUrl);
  const hasPlcs = plcs.length > 0;

  // "Auto-Generated PLC Sheet" toggle — ON by default. When OFF, the
  // teacher can paste a URL of an existing sheet to point this assignment
  // at it instead of letting Widget.tsx auto-create one. Initial state
  // tracks whether a URL is already attached (legacy / pre-populated),
  // mirroring the previous disclosure semantics.
  const [useAutoGenerated, setUseAutoGenerated] = useState(
    !options.plcSheetUrl
  );

  return (
    <>
      <div className="border-t border-slate-200/70 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-brand-blue-primary" />
          <span className="text-sm font-bold text-brand-blue-dark">
            Share with PLC
          </span>
        </div>
        <Toggle
          checked={options.plcMode}
          onChange={(v) => update('plcMode', v)}
          size="sm"
          showLabels={true}
        />
      </div>
      <p className="text-xxs text-slate-500 -mt-1">
        Export results to a shared Google Sheet for your PLC team.{' '}
        {effectivePeriodCount > 1 ? (
          <>Students will see a class-period picker after entering their PIN.</>
        ) : (
          <>
            Pick two or more classes above to give students a period picker when
            they join.
          </>
        )}
      </p>

      {options.plcMode && (
        <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
          {hasPlcs && (
            <div>
              <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                PLC
              </label>
              <select
                value={effectivePlcId}
                onChange={(e) => update('plcId', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {/*
                 * Only render the empty placeholder when there are 2+ PLCs.
                 * With exactly one PLC, `effectivePlcId` always derives to
                 * that PLC's id, so picking "Select a PLC…" would snap right
                 * back to the auto-selection — the option was unreachable
                 * UI debt. Teachers in a one-PLC org opt out by toggling
                 * Share-with-PLC off entirely.
                 */}
                {plcs.length > 1 && <option value="">Select a PLC…</option>}
                {plcs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedPlc && (
                <p className="text-xxs text-slate-400 mt-0.5">
                  {hasCachedSheet
                    ? 'Using your PLC’s existing Google Sheet — teammates already have access.'
                    : 'A Google Sheet will be created in your Drive and shared with every teammate automatically.'}
                </p>
              )}
              {!selectedPlc && (
                <p className="text-xxs text-slate-400 mt-0.5">
                  Pick a PLC so results land in its shared Google Sheet.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={options.teacherName}
              onChange={(e) => update('teacherName', e.target.value)}
              placeholder="e.g. Ms. Smith"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xxs text-slate-400 mt-0.5">
              Appears in the &quot;Teacher&quot; column of the shared sheet
            </p>
          </div>

          {/*
           * Auto-Generated PLC Sheet toggle. ON ⇒ Widget.tsx auto-creates a
           * fresh sheet at assignment-create time and shares it with every
           * PLC teammate. OFF ⇒ the teacher pastes a URL of an existing
           * sheet and Widget.tsx skips auto-create (the manual URL wins).
           */}
          <ToggleRow
            label="Auto-Generated PLC Sheet"
            checked={useAutoGenerated}
            onChange={(v) => {
              setUseAutoGenerated(v);
              if (v) update('plcSheetUrl', '');
            }}
            hint={
              useAutoGenerated
                ? 'SpartBoard creates a fresh Google Sheet for this assignment and shares it with your PLC.'
                : 'Paste a Google Sheet URL — useful for pointing this assignment at a sheet you already have.'
            }
          />
          {!useAutoGenerated && (
            <div>
              <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Shared Google Sheet URL
              </label>
              <input
                type="text"
                value={options.plcSheetUrl}
                onChange={(e) => update('plcSheetUrl', e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {plcSheetUrlInvalid && (
                <div className="flex items-center gap-1 mt-1 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-xxs">
                    This doesn&apos;t look like a Google Sheets URL
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ─── Shared small UI primitives ─────────────────────────────────────────── */

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest pt-1">
    {label}
  </p>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
  /**
   * When true, the label renders in the small uppercase brand-blue style
   * used inside `CollapsibleSection` bodies. Top-level rows (e.g. Tab
   * Switch Detection) use the default bold-dark label.
   */
  compact?: boolean;
}> = ({ label, checked, onChange, hint, disabled, compact = false }) => (
  <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
    <div className="flex items-center justify-between">
      <span
        className={
          compact
            ? 'text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest'
            : 'text-sm font-bold text-brand-blue-dark'
        }
      >
        {label}
      </span>
      <Toggle checked={checked} onChange={onChange} size="sm" showLabels />
    </div>
    {hint && <p className="text-xxs text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/* ─── Type exports kept so callers don't break if they re-import them ────── */

export type { LibraryBadgeTone };

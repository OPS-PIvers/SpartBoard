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
  Calendar,
  Radio,
  Inbox,
  Loader2,
  AlertCircle,
  CheckSquare,
} from 'lucide-react';
import {
  QuizMetadata,
  QuizSessionMode,
  QuizConfig,
  ClassRoster,
  QuizAssignment,
} from '@/types';
import { type QuizSessionOptions } from '@/hooks/useQuizSession';
import { AttemptLimitRow } from './AttemptLimitRow';
import { Toggle } from '@/components/common/Toggle';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
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
  AssignmentArchiveCard,
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
import { useDialog } from '@/context/useDialog';

export interface PlcOptions {
  plcMode: boolean;
  teacherName?: string;
  /** @deprecated Use periodNames instead. */
  periodName?: string;
  periodNames?: string[];
  plcSheetUrl?: string;
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
  rosters: ClassRoster[]
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
    showPodiumBetweenQuestions: true,
    soundEffectsEnabled: false,
    // Default: one attempt per student. Teachers can switch to 2/3/Unlimited
    // in the assign modal or later in the assignment settings.
    attemptLimit: 1,
    plcMode: config.plcMode ?? false,
    teacherName: config.teacherName ?? '',
    plcSheetUrl: config.plcSheetUrl ?? '',
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
  onArchiveMonitor?: (assignment: QuizAssignment) => void;
  /** Start a paused assignment: resume + navigate to monitor. */
  onArchiveStart?: (assignment: QuizAssignment) => void;
  onArchiveResults?: (assignment: QuizAssignment) => void;
  onArchiveEditSettings?: (assignment: QuizAssignment) => void;
  onArchiveShare?: (assignment: QuizAssignment) => void;
  onArchivePauseResume?: (assignment: QuizAssignment) => void;
  onArchiveDeactivate?: (assignment: QuizAssignment) => void | Promise<void>;
  /** Reopen an ended assignment back to a paused state. */
  onArchiveReopen?: (assignment: QuizAssignment) => void;
  onArchiveDelete?: (assignment: QuizAssignment) => void | Promise<void>;
  /** Persist the library grid/list toggle into widget config. */
  onLibraryViewModeChange?: (mode: 'grid' | 'list') => void;
}

/* ─── Status resolver for archive cards ───────────────────────────────────── */

function resolveStatus(
  status: QuizAssignment['status']
): AssignmentStatusBadge {
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
}) => {
  const noop = () => {
    /* action not wired */
  };

  const { showConfirm } = useDialog();

  // ─── Assign modal state (2-stage: mode → settings) ────────────────────────
  const [assignTarget, setAssignTarget] = useState<QuizMetadata | null>(null);
  const [selectedMode, setSelectedMode] = useState<QuizSessionMode | null>(
    null
  );
  const [assignOptions, setAssignOptions] = useState<QuizAssignOptions>(() =>
    buildDefaultAssignOptions(config, undefined, rosters)
  );

  // Reset assign form when modal re-opens (adjust-state-while-rendering)
  const [prevAssignTarget, setPrevAssignTarget] = useState<QuizMetadata | null>(
    null
  );
  if (assignTarget !== prevAssignTarget) {
    setPrevAssignTarget(assignTarget);
    if (assignTarget) {
      setSelectedMode(null);
      setAssignOptions(
        buildDefaultAssignOptions(config, assignTarget.id, rosters)
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
  const buildQuizSecondaryActions = (
    quiz: QuizMetadata
  ): LibraryMenuAction[] => [
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
    buildMoveToFolderAction({
      onOpenPicker: () => setFolderPickerTarget(quiz),
      disabled: !userId,
    }),
    {
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
    },
  ];

  // ─── Build archive-card actions ───────────────────────────────────────────
  const buildArchiveActions = (
    a: QuizAssignment,
    mode: 'active' | 'archive'
  ): {
    primary: {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      onClick: () => void;
    };
    secondaries: LibraryMenuAction[];
  } => {
    const isActive = a.status === 'active';
    const urlLive = a.status !== 'inactive';

    const secondaries: LibraryMenuAction[] = [];

    if (mode === 'active') {
      // Primary: Monitor (active) or Start (paused)
      const primary = isActive
        ? {
            label: 'Monitor',
            icon: Monitor,
            onClick: () => (onArchiveMonitor ?? noop)(a),
          }
        : {
            label: 'Start',
            icon: Rocket,
            onClick: () => (onArchiveStart ?? noop)(a),
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
          onClick: () => (onArchiveMonitor ?? noop)(a),
        });
      }
      secondaries.push({
        id: 'results',
        label: 'Results',
        icon: BarChart3,
        onClick: () => (onArchiveResults ?? noop)(a),
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
        onClick: () => (onArchiveShare ?? noop)(a),
      });
      if (isActive) {
        secondaries.push({
          id: 'pause',
          label: 'Pause',
          icon: Pause,
          onClick: () => (onArchivePauseResume ?? noop)(a),
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
      onClick: () => (onArchiveResults ?? noop)(a),
    };
    secondaries.push({
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      onClick: () => (onArchiveMonitor ?? noop)(a),
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
      onClick: () => (onArchiveShare ?? noop)(a),
    });
    secondaries.push({
      id: 'reopen',
      label: 'Reopen',
      icon: RefreshCw,
      onClick: () => (onArchiveReopen ?? noop)(a),
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
    const plcOptions: PlcOptions = {
      plcMode: assignOptions.plcMode,
      teacherName: assignOptions.teacherName || undefined,
      periodName: effectivePeriodNames[0] || undefined,
      periodNames:
        effectivePeriodNames.length > 0 ? effectivePeriodNames : undefined,
      plcSheetUrl: assignOptions.plcSheetUrl || undefined,
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
          label: 'Assign',
          icon: Play,
          onClick: () => setAssignTarget(quiz),
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
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      toolbarSlot={toolbar}
      filterSidebarSlot={folderSidebarSlot}
    >
      {managerTab === 'library' && (
        <LibraryTabContent
          error={error}
          orderedItems={reorder.orderedItems}
          onAssignClick={(q) => setAssignTarget(q)}
          buildSecondaryActions={buildQuizSecondaryActions}
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
        />
      )}

      {managerTab === 'active' && (
        <AssignmentsList
          assignments={activeAssignments}
          loading={assignmentsLoading}
          mode="active"
          buildActions={buildArchiveActions}
          emptyTitle="No quizzes in progress"
          emptySub="Assign a quiz from the Library tab to get started. Active and paused assignments appear here."
        />
      )}

      {managerTab === 'archive' && (
        <AssignmentsList
          assignments={inactiveAssignments}
          loading={assignmentsLoading}
          mode="archive"
          buildActions={buildArchiveActions}
          emptyTitle="No archived assignments"
          emptySub="Ended assignments are moved here so you can review results and share them."
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

      {assignTarget && (
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
    </>
  );
};

/* ─── LibraryTabContent ──────────────────────────────────────────────────── */

const LibraryTabContent: React.FC<{
  error: string | null;
  orderedItems: QuizMetadata[];
  onAssignClick: (quiz: QuizMetadata) => void;
  buildSecondaryActions: (quiz: QuizMetadata) => LibraryMenuAction[];
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
}> = ({
  error,
  orderedItems,
  onAssignClick,
  buildSecondaryActions,
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
              label: 'Assign',
              icon: Play,
              onClick: () => onAssignClick(quiz),
            }}
            secondaryActions={buildSecondaryActions(quiz)}
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
    primary: {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      onClick: () => void;
    };
    secondaries: LibraryMenuAction[];
  };
  emptyTitle: string;
  emptySub: string;
}> = ({ assignments, loading, mode, buildActions, emptyTitle, emptySub }) => {
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
      {assignments.map((a) => {
        const { primary, secondaries } = buildActions(a, mode);
        const status = resolveStatus(a.status);
        const periods = a.periodNames ?? (a.periodName ? [a.periodName] : []);
        const urlLive = a.status !== 'inactive';
        const noPeriods = periods.length === 0 && mode === 'active';
        const periodLabel =
          periods.length === 1
            ? periods[0]
            : periods.length > 0
              ? `${periods.length} classes`
              : null;

        return (
          <AssignmentArchiveCard<QuizAssignment>
            key={a.id}
            assignment={a}
            mode={mode}
            status={status}
            title={a.quizTitle}
            subtitle={a.className?.trim() ? a.className : undefined}
            meta={
              <>
                <span className="inline-flex items-center gap-0.5">
                  <Calendar className="w-3 h-3" />
                  {new Date(a.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {urlLive && (
                  <span className="font-mono tracking-wider">{a.code}</span>
                )}
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
              </>
            }
            primaryAction={{
              label: primary.label,
              icon: primary.icon,
              onClick: primary.onClick,
            }}
            secondaryActions={secondaries}
          />
        );
      })}
    </div>
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

      <SectionHeader label="Answer Feedback" />
      <ToggleRow
        label="Show right/wrong to students"
        checked={options.showResultToStudent}
        onChange={(v) => update('showResultToStudent', v)}
        hint="Students see ✓ or ✗ after submitting"
      />
      <ToggleRow
        label="Reveal correct answer to students"
        checked={options.showCorrectAnswerToStudent}
        onChange={(v) => update('showCorrectAnswerToStudent', v)}
        disabled={!options.showResultToStudent}
        hint="Also show what the correct answer was"
      />
      <ToggleRow
        label="Show correct answer on board"
        checked={options.showCorrectOnBoard}
        onChange={(v) => update('showCorrectOnBoard', v)}
        hint="Display correct answer on the projected screen"
      />

      <SectionHeader label="Gamification" />
      <ToggleRow
        label="Speed Bonus Points"
        checked={options.speedBonusEnabled}
        onChange={(v) => update('speedBonusEnabled', v)}
        hint="Up to 50% bonus for fast answers"
      />
      <ToggleRow
        label="Streak Bonuses"
        checked={options.streakBonusEnabled}
        onChange={(v) => update('streakBonusEnabled', v)}
        hint="Multiplier for consecutive correct answers"
      />
      <ToggleRow
        label="Podium Between Questions"
        checked={options.showPodiumBetweenQuestions}
        onChange={(v) => update('showPodiumBetweenQuestions', v)}
        hint="Show top 3 leaderboard after each question"
      />
      <ToggleRow
        label="Sound Effects"
        checked={options.soundEffectsEnabled}
        onChange={(v) => update('soundEffectsEnabled', v)}
        hint="Chimes, ticks, and fanfares during the quiz"
      />
    </>
  );
};

const AssignPlcSlot: React.FC<{
  options: QuizAssignOptions;
  onChange: (next: QuizAssignOptions) => void;
  plcSheetUrlInvalid: boolean;
  /**
   * Number of class periods the picker is contributing (ClassLink class
   * labels or local roster names). Drives the "students will see a picker"
   * hint without this slot needing to recompute the derivation itself.
   */
  effectivePeriodCount: number;
}> = ({ options, onChange, plcSheetUrlInvalid, effectivePeriodCount }) => {
  const update = <K extends keyof QuizAssignOptions>(
    key: K,
    value: QuizAssignOptions[K]
  ) => onChange({ ...options, [key]: value });

  return (
    <>
      <div className="flex items-center justify-between">
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
            <p className="text-xxs text-slate-400 mt-0.5">
              Paste the URL of the Google Sheet shared by your PLC lead
            </p>
          </div>
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
}> = ({ label, checked, onChange, hint, disabled }) => (
  <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
    <div className="flex items-center justify-between">
      <span className="text-sm font-bold text-brand-blue-dark">{label}</span>
      <Toggle checked={checked} onChange={onChange} size="sm" showLabels />
    </div>
    {hint && <p className="text-xxs text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/* ─── Type exports kept so callers don't break if they re-import them ────── */

export type { LibraryBadgeTone };

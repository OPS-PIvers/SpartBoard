/**
 * GuidedLearningManager — composes the shared library primitives into the
 * Guided Learning widget's teacher surface.
 *
 * Three tabs from the shared LibraryShell:
 *   - Library   : personal (Drive-backed) sets and admin building sets, shown
 *                 in a single list. An admin-only "Source" toolbar filter
 *                 narrows the list to Personal or Building. Non-admin users
 *                 never see the filter (their building entries appear inline
 *                 as read-only cards with Play/Assign only).
 *   - In Progress : teacher's live assignments (status === 'active').
 *   - Archive   : archived assignments (status === 'archived').
 *
 * Persistence is owned by the Widget — the Manager is presentational. The
 * Widget passes callbacks (save is already split personal vs building at that
 * layer) so the card layer never branches on "personal vs building" itself.
 *
 * Reference: components/widgets/QuizWidget/components/QuizManager.tsx.
 */

import React, { useCallback, useMemo } from 'react';
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Link2,
  BarChart2,
  Sparkles,
  Building2,
  BookOpen,
  Loader2,
  Archive as ArchiveIcon,
  RotateCcw,
  Copy,
  ExternalLink,
  CheckSquare,
} from 'lucide-react';
import type {
  AssignmentMode,
  GuidedLearningAssignment,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
} from '@/types';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { buildMoveToFolderAction } from '@/components/common/library/folderMenuAction';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import { useLibrarySelection } from '@/components/common/library/useLibrarySelection';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';
import { BulkActionBar } from '@/components/common/library/BulkActionBar';
import {
  countItemsByFolder,
  filterSourcedEntriesByFolder,
} from '@/components/common/library/folderFilters';
import { useFolders } from '@/hooks/useFolders';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import type {
  LibraryBadge,
  LibraryFilter,
  LibraryMenuAction,
  LibrarySortOption,
  LibraryTab,
} from '@/components/common/library/types';

/* ─── Unified list item ───────────────────────────────────────────────────── */

/**
 * A single entry in the Library tab. Hides the personal/building split so the
 * card layer can stay generic. Everything the Manager needs to render + route
 * clicks back to the owner is captured here.
 */
interface LibraryEntry {
  id: string;
  source: 'personal' | 'building';
  title: string;
  description?: string;
  stepCount: number;
  mode: GuidedLearningSet['mode'];
  imageUrl?: string;
  updatedAt: number;
  createdAt: number;
  order?: number;
  /** Personal-only: the drive file id needed to load/delete the set. */
  driveFileId?: string;
  /** Building-only: the hydrated building set so callers can pass it through. */
  buildingSet?: GuidedLearningSet;
  /** Personal-only: current folder assignment (`null` = root). */
  folderId?: string | null;
}

/* ─── Props ───────────────────────────────────────────────────────────────── */

export interface GuidedLearningManagerProps {
  /** Teacher's Firebase UID — scopes the folders subcollection. */
  userId?: string;
  /** Personal set metadata (Drive-backed). */
  sets: GuidedLearningSetMetadata[];
  /** Admin-authored building sets (Firestore-backed). */
  buildingSets: GuidedLearningSet[];
  /** Teacher's per-assignment archive. */
  assignments: GuidedLearningAssignment[];

  loading: boolean;
  buildingLoading: boolean;
  assignmentsLoading: boolean;
  isDriveConnected: boolean;
  isAdmin: boolean;

  /* ── Library tab ──────────────────────────────────────────────────────── */
  onPlay: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onEdit: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onAssign: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onDeletePersonal: (
    setId: string,
    driveFileId: string
  ) => void | Promise<void>;
  onDeleteBuilding: (setId: string) => void | Promise<void>;
  onCreateNewPersonal: () => void;
  onCreateNewBuilding: () => void;
  /** Admin-only — opens the standalone AI authoring dialog for building sets. */
  onOpenAIAuthoring: () => void;
  /**
   * Persist new personal-set ordering. Writes `order` to the metadata doc; the
   * Drive blob is untouched. Rejecting reverts the optimistic reorder.
   */
  onReorderPersonal: (orderedIds: string[]) => Promise<void>;
  /**
   * Optional Results action surfaced from recent session ids (Quiz-style).
   * When a set has a recent session, we expose "View Results" in the overflow
   * menu.
   */
  recentSessionIds: Record<string, string>;
  onViewResults: (sessionId: string) => void;

  /* ── Assignment tabs (In Progress + Archive) ──────────────────────────── */
  onAssignmentCopyLink: (assignment: GuidedLearningAssignment) => void;
  onAssignmentOpenResults: (assignment: GuidedLearningAssignment) => void;
  onAssignmentArchive: (assignment: GuidedLearningAssignment) => void;
  onAssignmentUnarchive: (assignment: GuidedLearningAssignment) => void;
  onAssignmentDelete: (assignment: GuidedLearningAssignment) => void;

  /** Persisted library grid/list toggle (from widget config). */
  initialLibraryViewMode?: 'grid' | 'list';
  /** Persist the library grid/list toggle into widget config. */
  onLibraryViewModeChange?: (mode: 'grid' | 'list') => void;

  /** Org-wide assignment mode. Drives Assign-vs-Share button labels and the
   *  In-Progress-vs-Shared tab label. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
}

/* ─── Sort / filter config ────────────────────────────────────────────────── */

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'updatedAt', label: 'Last updated', defaultDir: 'desc' },
  { key: 'createdAt', label: 'Date created', defaultDir: 'desc' },
];

const MODE_LABELS: Record<GuidedLearningSet['mode'], string> = {
  structured: 'Structured',
  guided: 'Guided',
  explore: 'Explore',
};

/* ─── Library hook option constants (module-level for referential stability) ─

 * Inline literals passed to `useLibraryView`'s options would re-derive
 * `visibleItems` on every render, which in turn triggers a re-render loop
 * through `useSortableReorder`. Keeping them at module scope keeps references
 * stable across renders. */

const LIBRARY_SEARCH_FIELDS = (e: LibraryEntry): string[] => [
  e.title,
  e.description ?? '',
];

const LIBRARY_INITIAL_SORT = { key: 'manual', dir: 'asc' as const };

const LIBRARY_SORT_COMPARATORS = {
  manual: (a: LibraryEntry, b: LibraryEntry, dir: 'asc' | 'desc') => {
    const av = a.order ?? Number.POSITIVE_INFINITY;
    const bv = b.order ?? Number.POSITIVE_INFINITY;
    const diff = av - bv;
    return dir === 'asc' ? diff : -diff;
  },
  title: (a: LibraryEntry, b: LibraryEntry, dir: 'asc' | 'desc') => {
    const diff = a.title.localeCompare(b.title);
    return dir === 'asc' ? diff : -diff;
  },
  updatedAt: (a: LibraryEntry, b: LibraryEntry, dir: 'asc' | 'desc') => {
    const diff = a.updatedAt - b.updatedAt;
    return dir === 'asc' ? diff : -diff;
  },
  createdAt: (a: LibraryEntry, b: LibraryEntry, dir: 'asc' | 'desc') => {
    const diff = a.createdAt - b.createdAt;
    return dir === 'asc' ? diff : -diff;
  },
};

const LIBRARY_FILTER_PREDICATES = {
  source: (item: LibraryEntry, value: string): boolean =>
    value === '' ? true : item.source === value,
};

const LIBRARY_GET_ID = (e: LibraryEntry): string => e.id;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

// Non-admins still see building sets (they're shared with the whole
// building), so we always concatenate; only the toolbar "Source" filter
// affordance is admin-gated (handled at the component level).
const buildLibraryEntries = (
  sets: GuidedLearningSetMetadata[],
  buildingSets: GuidedLearningSet[]
): LibraryEntry[] => {
  const personal: LibraryEntry[] = sets.map((meta) => ({
    id: `personal:${meta.id}`,
    source: 'personal',
    title: meta.title,
    description: meta.description,
    stepCount: meta.stepCount,
    mode: meta.mode,
    imageUrl: meta.imageUrl,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
    order: meta.order,
    driveFileId: meta.driveFileId,
    folderId: meta.folderId ?? null,
  }));

  const building: LibraryEntry[] = buildingSets.map((set) => ({
    id: `building:${set.id}`,
    source: 'building',
    title: set.title,
    description: set.description,
    stepCount: set.steps.length,
    mode: set.mode,
    imageUrl: set.imageUrls[0],
    updatedAt: set.updatedAt,
    createdAt: set.createdAt,
    buildingSet: set,
  }));

  return [...personal, ...building];
};

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/* ─── Component ───────────────────────────────────────────────────────────── */

export const GuidedLearningManager: React.FC<GuidedLearningManagerProps> = ({
  userId,
  sets,
  buildingSets,
  assignments,
  loading,
  buildingLoading,
  assignmentsLoading,
  isDriveConnected,
  isAdmin,
  onPlay,
  onEdit,
  onAssign,
  onDeletePersonal,
  onDeleteBuilding,
  onCreateNewPersonal,
  onCreateNewBuilding,
  onOpenAIAuthoring,
  onReorderPersonal,
  recentSessionIds,
  onViewResults,
  onAssignmentCopyLink,
  onAssignmentOpenResults,
  onAssignmentArchive,
  onAssignmentUnarchive,
  onAssignmentDelete,
  initialLibraryViewMode,
  onLibraryViewModeChange,
  assignmentMode = 'submissions',
}) => {
  const isViewOnly = assignmentMode === 'view-only';
  const primaryActionLabel = isViewOnly ? 'Share' : 'Assign';
  const [tab, setTab] = React.useState<LibraryTab>('library');

  // ─── Bulk selection (Step 8) ────────────────────────────────────────────
  const selection = useLibrarySelection();
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [prevTab, setPrevTab] = React.useState(tab);
  if (prevTab !== tab) {
    setPrevTab(tab);
    if (tab !== 'library' && selectionMode) {
      setSelectionMode(false);
      selection.clear();
    }
  }

  // ─── Folder navigation (Wave 3-B-3) ─────────────────────────────────────
  const folderState = useFolders(userId, 'guided_learning');
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(
    null
  );
  // When set, a `FolderPickerPopover` dialog is shown for this personal entry.
  // Only 'personal' sets participate in folders (building sets have no
  // folderId). Carry the rawId + display title so the dialog can label itself
  // without another lookup.
  const [folderPickerTarget, setFolderPickerTarget] = React.useState<{
    rawId: string;
    title: string;
    folderId: string | null;
  } | null>(null);

  // Reset folder selection when the signed-in user changes or the selected
  // folder no longer exists (adjust-state-during-render pattern).
  const [prevFolderUserId, setPrevFolderUserId] = React.useState(userId);
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

  // Only personal sets participate in folders. Building sets are always at
  // root (they're shared at the building level and have no folderId field).
  const folderItemCounts = useMemo(() => countItemsByFolder(sets), [sets]);

  const allEntries = useMemo(
    () =>
      filterSourcedEntriesByFolder(
        buildLibraryEntries(sets, buildingSets),
        selectedFolderId
      ),
    [sets, buildingSets, selectedFolderId]
  );

  // ─── Toolbar state (search/sort/filter) via useLibraryView ────────────────
  const sourceFilter: LibraryFilter = {
    id: 'source',
    label: 'Source',
    options: [
      { value: 'personal', label: 'Personal' },
      { value: 'building', label: 'Building' },
    ],
    // Building filter is admin-gated. Non-admins never see this control.
    visible: isAdmin,
  };

  const view = useLibraryView<LibraryEntry>({
    items: allEntries,
    initialSort: LIBRARY_INITIAL_SORT,
    initialViewMode: initialLibraryViewMode ?? 'grid',
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
    filterPredicates: LIBRARY_FILTER_PREDICATES,
    onViewModeChange: onLibraryViewModeChange,
  });

  const activeSourceFilter = view.state.filterValues.source ?? '';
  const isBuildingFiltered = activeSourceFilter === 'building';

  // ─── Drag-reorder only when viewing personal manually (no search, manual
  // sort, source filter === 'personal' so every card is actually reorderable).
  const personalEntries = useMemo(
    () => view.visibleItems.filter((e) => e.source === 'personal'),
    [view.visibleItems]
  );

  const onReorderCommit = useCallback(
    async (orderedIds: string[]) => {
      // Strip the `personal:` prefix and ignore building entries — the Widget
      // only accepts personal set ids.
      const personalIds = orderedIds
        .filter((id) => id.startsWith('personal:'))
        .map((id) => id.slice('personal:'.length));
      await onReorderPersonal(personalIds);
    },
    [onReorderPersonal]
  );

  const reorder = useSortableReorder<LibraryEntry>({
    items: view.visibleItems,
    getId: LIBRARY_GET_ID,
    onCommit: onReorderCommit,
  });

  // ─── Drop-to-folder handler ───────────────────────────────────────────────
  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      // GL entry ids are prefixed "personal:" or "building:". Only personal
      // entries participate in folders; building cards are `sortable={false}`
      // so drops from them shouldn't fire, but we guard defensively.
      if (!itemId.startsWith('personal:')) return;
      const rawId = itemId.slice('personal:'.length);
      try {
        await moveItem(rawId, folderId);
      } catch (err) {
        console.error('[GuidedLearningManager] moveItem failed:', err);
      }
    },
    [userId, moveItem]
  );

  // ─── Bulk handlers (Step 8) ─────────────────────────────────────────────
  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selection.count === 0) return;
    const personalIds = Array.from(selection.selectedIds).filter((id) =>
      id.startsWith('personal:')
    );
    if (personalIds.length === 0) return;
    const ok = window.confirm(
      `Delete ${personalIds.length} set${personalIds.length === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        personalIds.map(async (id) => {
          const rawId = id.slice('personal:'.length);
          const entry = allEntries.find((e) => e.id === id);
          if (entry?.driveFileId) {
            await onDeletePersonal(rawId, entry.driveFileId);
          }
        })
      );
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(
            '[GuidedLearningManager] bulk delete failed for',
            personalIds[idx],
            result.reason
          );
        }
      });
      selection.clear();
      setSelectionMode(false);
    } finally {
      setBulkBusy(false);
    }
  }, [selection, allEntries, onDeletePersonal]);

  const handleBulkMove = useCallback(
    async (folderId: string | null): Promise<void> => {
      if (!userId || selection.count === 0) return;
      const ids = Array.from(selection.selectedIds).filter((id) =>
        id.startsWith('personal:')
      );
      setBulkBusy(true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) => moveItem(id.slice('personal:'.length), folderId))
        );
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(
              '[GuidedLearningManager] bulk move failed for',
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

  const reorderDragActive =
    !view.reorderLocked &&
    activeSourceFilter === 'personal' &&
    personalEntries.length >= 2;
  // When folder drag is available we enable card drag even if manual reorder
  // would be blocked (e.g. sort !== 'manual'). Drops on a folder tile move the
  // item; drops on another card reorder (only honored when manual reorder is
  // active — see `handleReorderDrop` below).
  const enableCardDrag =
    (Boolean(userId) || reorderDragActive) && !selectionMode;

  const handleReorderDrop = useCallback(
    (orderedIds: string[]) => {
      if (!reorderDragActive) return;
      void reorder.handleReorder(orderedIds);
    },
    [reorder, reorderDragActive]
  );

  // ─── Counts for tabs ──────────────────────────────────────────────────────
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'active'),
    [assignments]
  );
  const archivedAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'archived'),
    [assignments]
  );

  // ─── Header actions ───────────────────────────────────────────────────────
  const primaryAction = isBuildingFiltered
    ? {
        label: 'New Building Set',
        icon: Plus,
        onClick: onCreateNewBuilding,
      }
    : {
        label: 'New Set',
        icon: Plus,
        onClick: onCreateNewPersonal,
      };

  const secondaryActions =
    isAdmin && isBuildingFiltered
      ? [
          {
            label: 'AI',
            icon: Sparkles,
            onClick: onOpenAIAuthoring,
          },
        ]
      : undefined;

  // ─── Drive disconnected banner ────────────────────────────────────────────
  const showDriveBanner =
    tab === 'library' && !isDriveConnected && activeSourceFilter !== 'building';

  /* ─── Rendering helpers ─────────────────────────────────────────────────── */

  const renderLibraryCard = (entry: LibraryEntry): React.ReactElement => {
    const badges: LibraryBadge[] = [
      { label: MODE_LABELS[entry.mode], tone: 'info' },
    ];
    if (entry.source === 'building') {
      badges.push({ label: 'Building', tone: 'warn' });
    }

    const isBuildingEntry = entry.source === 'building';
    const canEdit = isBuildingEntry ? isAdmin : true;
    const canDelete = isBuildingEntry ? isAdmin : true;

    const secondary: LibraryMenuAction[] = [
      {
        id: 'play',
        label: 'Play (teacher mode)',
        icon: Play,
        onClick: () =>
          onPlay(
            entry.source === 'personal'
              ? entry.id.slice('personal:'.length)
              : entry.id.slice('building:'.length),
            entry.driveFileId,
            entry.buildingSet
          ),
      },
    ];

    if (canEdit) {
      secondary.push({
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () =>
          onEdit(
            entry.source === 'personal'
              ? entry.id.slice('personal:'.length)
              : entry.id.slice('building:'.length),
            entry.driveFileId,
            entry.buildingSet
          ),
      });
    }

    const rawId =
      entry.source === 'personal'
        ? entry.id.slice('personal:'.length)
        : entry.id.slice('building:'.length);

    const recentSessionId = recentSessionIds[rawId];
    if (recentSessionId) {
      secondary.push({
        id: 'results',
        label: 'View Results',
        icon: BarChart2,
        onClick: () => onViewResults(recentSessionId),
      });
    }

    if (entry.source === 'personal') {
      secondary.push(
        buildMoveToFolderAction({
          onOpenPicker: () =>
            setFolderPickerTarget({
              rawId,
              title: entry.title,
              folderId: entry.folderId ?? null,
            }),
          disabled: !userId,
        })
      );
    }

    if (canDelete) {
      secondary.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => {
          if (entry.source === 'personal' && entry.driveFileId) {
            void onDeletePersonal(rawId, entry.driveFileId);
          } else if (entry.source === 'building') {
            void onDeleteBuilding(rawId);
          }
        },
      });
    }

    const subtitle = (
      <span>
        {entry.stepCount} step{entry.stepCount === 1 ? '' : 's'}
        {' · Updated '}
        {formatDate(entry.updatedAt)}
      </span>
    );

    const thumbnail = entry.imageUrl ? (
      <img
        src={entry.imageUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
    ) : (
      <BookOpen className="h-5 w-5 text-slate-400" aria-hidden="true" />
    );

    const isPersonal = entry.source === 'personal';
    const selectable = isPersonal && selectionMode;
    return (
      <LibraryItemCard<LibraryEntry>
        key={entry.id}
        id={entry.id}
        title={entry.title}
        subtitle={subtitle}
        thumbnail={thumbnail}
        badges={badges}
        primaryAction={{
          label: primaryActionLabel,
          icon: Link2,
          onClick: () => onAssign(rawId, entry.driveFileId, entry.buildingSet),
        }}
        secondaryActions={secondary}
        onClick={
          canEdit
            ? () => onEdit(rawId, entry.driveFileId, entry.buildingSet)
            : undefined
        }
        sortable={isPersonal && enableCardDrag && !selectionMode}
        viewMode={view.state.viewMode}
        meta={entry}
        selectionMode={selectable}
        selected={selectable && selection.isSelected(entry.id)}
        onSelectionToggle={
          selectable ? () => selection.toggle(entry.id) : undefined
        }
      />
    );
  };

  /* ─── Assignment cards (used in active + archive tabs) ──────────────────── */

  const renderAssignmentCard = (
    a: GuidedLearningAssignment,
    mode: 'active' | 'archive'
  ): React.ReactElement => {
    // Matches the path form produced by useGuidedLearningSession.createSession
    // (App.tsx routes the student app on pathname.startsWith('/guided-learning/')).
    const studentLink = `${window.location.origin}/guided-learning/${a.sessionId}`;

    // Per-assignment mode is frozen at creation. View-only entries get
    // share-flavored labels so teachers can distinguish them at a glance,
    // matching the badge shape Quiz / VA / Mini App use.
    const isViewOnly = a.assignmentMode === 'view-only';
    const badges: LibraryBadge[] =
      mode === 'active'
        ? [
            {
              label: isViewOnly ? 'Shared' : 'Live',
              tone: 'success',
              dot: true,
            },
          ]
        : [
            {
              label: isViewOnly ? 'Ended share' : 'Archived',
              tone: 'neutral',
            },
          ];

    if (a.source === 'building') {
      badges.push({ label: 'Building', tone: 'warn' });
    }

    const subtitle = (
      <span>
        {mode === 'active' ? 'Assigned ' : 'Archived '}
        {formatDate(
          mode === 'active' ? a.createdAt : (a.archivedAt ?? a.updatedAt)
        )}
      </span>
    );

    const secondary: LibraryMenuAction[] = [
      {
        id: 'copy',
        label: 'Copy student link',
        icon: Copy,
        onClick: () => onAssignmentCopyLink(a),
      },
      {
        id: 'open',
        label: 'Open student link',
        icon: ExternalLink,
        onClick: () => window.open(studentLink, '_blank', 'noopener'),
      },
    ];

    if (mode === 'active') {
      secondary.push({
        id: 'archive',
        label: 'Archive',
        icon: ArchiveIcon,
        onClick: () => onAssignmentArchive(a),
      });
    } else {
      secondary.push({
        id: 'unarchive',
        label: 'Move to In Progress',
        icon: RotateCcw,
        onClick: () => onAssignmentUnarchive(a),
      });
    }

    secondary.push({
      id: 'delete',
      label: 'Delete permanently',
      icon: Trash2,
      destructive: true,
      onClick: () => onAssignmentDelete(a),
    });

    // Per-assignment mode is frozen at creation. View-only shares have no
    // results to surface — swap the primary action accordingly. The status
    // badge above already encodes the mode (Shared / Ended share).
    const assignmentIsViewOnly = isViewOnly;

    return (
      <LibraryItemCard<GuidedLearningAssignment>
        key={a.id}
        id={a.id}
        title={a.setTitle}
        subtitle={subtitle}
        badges={badges}
        primaryAction={
          assignmentIsViewOnly
            ? {
                label: 'Copy link',
                icon: Copy,
                onClick: () => onAssignmentCopyLink(a),
              }
            : {
                label: 'View Results',
                icon: BarChart2,
                onClick: () => onAssignmentOpenResults(a),
              }
        }
        secondaryActions={secondary}
        sortable={false}
        viewMode="list"
        onClick={
          assignmentIsViewOnly ? undefined : () => onAssignmentOpenResults(a)
        }
      />
    );
  };

  /* ─── Tab bodies ─────────────────────────────────────────────────────────── */

  const renderLibraryTab = () => {
    if (loading || buildingLoading) {
      return (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    return (
      <>
        {showDriveBanner && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Your personal sets are saved to Google Drive. Sign out and sign back
            in to grant Drive access. Building sets are still available below.
          </div>
        )}

        {selectionMode && selection.count > 0 && (
          <div className="mb-3">
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

        <LibraryGrid<LibraryEntry>
          items={reorder.orderedItems}
          getId={(e) => e.id}
          renderCard={renderLibraryCard}
          onReorder={handleReorderDrop}
          dragDisabled={!enableCardDrag}
          reorderLocked={reorderDragActive ? view.reorderLocked : false}
          reorderLockedReason={
            reorderDragActive ? view.reorderLockedReason : undefined
          }
          layout={view.state.viewMode}
          useExternalDndContext={Boolean(userId)}
          emptyState={
            <ScaledEmptyState
              icon={BookOpen}
              title="No sets yet"
              subtitle={
                isBuildingFiltered
                  ? isAdmin
                    ? 'Use "New Building Set" or "AI" to add a building-level experience.'
                    : 'No building sets have been created yet.'
                  : 'Click "New Set" to create your first guided experience.'
              }
            />
          }
        />
      </>
    );
  };

  const renderAssignmentTab = (mode: 'active' | 'archive') => {
    if (assignmentsLoading) {
      return (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }
    const list = mode === 'active' ? activeAssignments : archivedAssignments;
    if (list.length === 0) {
      return (
        <ScaledEmptyState
          icon={mode === 'active' ? Play : ArchiveIcon}
          title={
            mode === 'active'
              ? 'No live assignments'
              : 'No archived assignments'
          }
          subtitle={
            mode === 'active'
              ? 'Assign a set from the Library tab to get started.'
              : 'Archived assignments will appear here.'
          }
        />
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {list.map((a) => renderAssignmentCard(a, mode))}
      </div>
    );
  };

  /* ─── Folder sidebar + DnD overlay ─────────────────────────────────────── */

  const folderSidebarSlot =
    tab === 'library' && userId ? (
      <FolderSidebar
        widget="guided_learning"
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

  const orderedIds = reorder.orderedItems.map((e) => e.id);

  const renderDragOverlay = (activeId: string): React.ReactNode => {
    const entry = reorder.orderedItems.find((e) => e.id === activeId);
    if (!entry) return null;
    const thumbnail = entry.imageUrl ? (
      <img
        src={entry.imageUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
    ) : (
      <BookOpen className="h-5 w-5 text-slate-400" aria-hidden="true" />
    );
    const subtitle = (
      <span>
        {entry.stepCount} step{entry.stepCount === 1 ? '' : 's'}
        {' · Updated '}
        {formatDate(entry.updatedAt)}
      </span>
    );
    return (
      <LibraryItemCard<LibraryEntry>
        id={entry.id}
        title={entry.title}
        subtitle={subtitle}
        thumbnail={thumbnail}
        badges={[{ label: MODE_LABELS[entry.mode], tone: 'info' }]}
        primaryAction={{
          label: primaryActionLabel,
          icon: Link2,
          onClick: () => undefined,
        }}
        viewMode={view.state.viewMode}
        sortable={false}
        isDragOverlay
        meta={entry}
      />
    );
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  const shell = (
    <LibraryShell
      widgetLabel="Guided Learning"
      tab={tab}
      onTabChange={setTab}
      counts={{
        library: allEntries.length,
        active: activeAssignments.length,
        archive: archivedAssignments.length,
      }}
      tabLabels={isViewOnly ? { active: 'Shared' } : undefined}
      primaryAction={tab === 'library' ? primaryAction : undefined}
      secondaryActions={tab === 'library' ? secondaryActions : undefined}
      filterSidebarSlot={folderSidebarSlot}
      toolbarSlot={
        tab === 'library' ? (
          <LibraryToolbar
            {...view.toolbarProps}
            sortOptions={SORT_OPTIONS}
            filters={[sourceFilter]}
            searchPlaceholder="Search sets…"
            rightSlot={
              <span className="flex items-center gap-2">
                {isBuildingFiltered && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    <Building2 size={12} />
                    Building library
                  </span>
                )}
                {userId && (
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
                      selectionMode
                        ? 'Exit selection mode'
                        : 'Enter selection mode'
                    }
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {selectionMode ? 'Cancel' : 'Select'}
                  </button>
                )}
              </span>
            }
          />
        ) : undefined
      }
    >
      {tab === 'library' && renderLibraryTab()}
      {tab === 'active' && renderAssignmentTab('active')}
      {tab === 'archive' && renderAssignmentTab('archive')}
    </LibraryShell>
  );

  const folderPickerDialog = folderPickerTarget ? (
    <FolderPickerPopover
      variant="dialog"
      folders={folderState.folders}
      selectedFolderId={folderPickerTarget.folderId}
      onSelect={(folderId) => {
        void handleDropOnFolder(folderPickerTarget.rawId, folderId);
      }}
      onClose={() => setFolderPickerTarget(null)}
      title={`Move "${folderPickerTarget.title}" to…`}
    />
  ) : null;

  return userId && tab === 'library' ? (
    <>
      <LibraryDndContext
        itemIds={orderedIds}
        onDropOnFolder={handleDropOnFolder}
        onReorder={handleReorderDrop}
        renderOverlay={renderDragOverlay}
      >
        {shell}
      </LibraryDndContext>
      {folderPickerDialog}
    </>
  ) : (
    <>
      {shell}
      {folderPickerDialog}
    </>
  );
};

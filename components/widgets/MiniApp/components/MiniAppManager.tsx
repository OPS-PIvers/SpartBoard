/**
 * MiniAppManager — Wave 2-MA library surface for the MiniApp widget.
 *
 * Composes the shared library primitives (`LibraryShell`, `LibraryToolbar`,
 * `LibraryGrid`, `LibraryItemCard`, `AssignmentArchiveCard`, `useLibraryView`,
 * `useSortableReorder`) into a 3-tab surface: Library / In Progress / Archive.
 *
 * MiniApp-specific wrinkles (vs the Quiz reference):
 *
 *   1. "My Apps" vs "Global Apps" is a toolbar filter (`source`), NOT a tab.
 *      Switching to `source === 'global'` enables read-only mode:
 *        - `LibraryGrid.dragDisabled = true` (no reorder on global).
 *        - Only Run / Save-to-Library / Assign / Assignments actions.
 *        - Destructive actions (Delete/Edit) are hidden.
 *
 *   2. Library persistence is owned by the parent widget. Reorder, delete,
 *      save-global-to-personal, etc. are surfaced via callbacks.
 *
 *   3. JSON Import / Export are secondary shell actions (not a toolbar
 *      button). They invoke callbacks provided by the parent.
 *
 *   4. Magic Generator (Gemini) stays inside the editor body; it is NOT
 *      surfaced in the import wizard — by design.
 *
 * This component is presentational + toolbar state only. All Firestore /
 * session lifecycle lives in the parent Widget.tsx.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Plus,
  FileUp,
  Download,
  Box,
  Globe,
  Play,
  Pencil,
  Trash2,
  Link2,
  BarChart3,
  BookDown,
  Loader2,
  ExternalLink,
  Copy,
} from 'lucide-react';
import type {
  MiniAppItem,
  GlobalMiniAppItem,
  MiniAppAssignment,
} from '@/types';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';
import { useFolders } from '@/hooks/useFolders';
import type {
  LibraryTab,
  LibrarySortDir,
  LibraryFilter,
  LibrarySortOption,
  LibraryMenuAction,
  AssignmentStatusBadge,
} from '@/components/common/library/types';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type MiniAppSource = 'personal' | 'global';

export interface MiniAppManagerProps {
  /** Teacher's Firebase UID — scopes the folders subcollection. */
  userId?: string;
  /** Which tab is active. Parent owns this so it can persist across flips. */
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;

  /** Personal ("My Apps") library. Already ordered by Firestore `order`. */
  personalLibrary: MiniAppItem[];
  /** Admin-published Global library. Filtered by building upstream. */
  globalLibrary: GlobalMiniAppItem[];

  /** All MiniApp assignments for this teacher (active + archive). */
  assignments: MiniAppAssignment[];
  assignmentsLoading?: boolean;

  /* ── Library-tab callbacks (personal) ─────────────────────────────────── */
  onCreate: () => void;
  onEdit: (app: MiniAppItem) => void;
  onDelete: (app: MiniAppItem) => void;
  onRun: (app: MiniAppItem) => void;
  onAssign: (app: MiniAppItem) => void;
  onShowAssignments: (app: MiniAppItem) => void;
  /** Persist a new ordering. Invoked by `useSortableReorder`. */
  onReorder: (nextOrderedIds: string[]) => Promise<void> | void;

  /* ── Library-tab callbacks (global — read-only) ───────────────────────── */
  onSaveGlobalToLibrary: (app: GlobalMiniAppItem) => void;
  savingGlobalId: string | null;

  /* ── Secondary shell actions ──────────────────────────────────────────── */
  onImport: () => void;
  onExport: () => void;

  /* ── Archive / In Progress callbacks ──────────────────────────────────── */
  onArchiveCopyUrl: (assignment: MiniAppAssignment) => void;
  onArchiveEnd: (assignment: MiniAppAssignment) => void;
  onArchiveDelete: (assignment: MiniAppAssignment) => void;
  /** Optional — open the underlying app in the widget. */
  onArchiveOpenApp?: (assignment: MiniAppAssignment) => void;
}

/* ─── Constants ───────────────────────────────────────────────────────────── */

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'createdAt', label: 'Date added', defaultDir: 'desc' },
  { key: 'size', label: 'Size', defaultDir: 'desc' },
];

const SOURCE_FILTER: LibraryFilter = {
  id: 'source',
  label: 'Source',
  options: [
    { value: 'personal', label: 'My apps' },
    { value: 'global', label: 'Global' },
  ],
};

/* ─── Unified row type (so toolbar filter/sort can drive one list) ────────── */

type UnifiedRow =
  | { kind: 'personal'; item: MiniAppItem }
  | { kind: 'global'; item: GlobalMiniAppItem };

function getRowId(row: UnifiedRow): string {
  // Namespace so a personal + global row with identical ids never collide in
  // dnd-kit's SortableContext (ids must be unique across the context).
  return `${row.kind}:${row.item.id}`;
}

function getRowTitle(row: UnifiedRow): string {
  return row.item.title;
}

function getRowCreatedAt(row: UnifiedRow): number {
  return row.item.createdAt;
}

function getRowSize(row: UnifiedRow): number {
  return row.item.html.length;
}

function compareStrings(a: string, b: string, dir: LibrarySortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

function compareNumbers(a: number, b: number, dir: LibrarySortDir): number {
  return dir === 'asc' ? a - b : b - a;
}

/* ─── Library hook option constants (module-level for referential stability) ─

 * Inline literals passed to `useLibraryView` would re-derive `visibleItems` on
 * every render, which in turn triggers a re-render loop through
 * `useSortableReorder`. Module-scoped constants keep the references stable. */

const LIBRARY_SEARCH_FIELDS = (row: UnifiedRow): string => row.item.title;

const LIBRARY_INITIAL_SORT = { key: 'manual', dir: 'asc' as const };

const LIBRARY_INITIAL_FILTER_VALUES = { source: 'personal' };

const LIBRARY_SORT_COMPARATORS = {
  // Manual = keep input order (personal first in its stored order, then
  // global). useLibraryView preserves the input order when the comparator
  // returns 0.
  manual: () => 0,
  title: (a: UnifiedRow, b: UnifiedRow, dir: LibrarySortDir) =>
    compareStrings(getRowTitle(a), getRowTitle(b), dir),
  createdAt: (a: UnifiedRow, b: UnifiedRow, dir: LibrarySortDir) =>
    compareNumbers(getRowCreatedAt(a), getRowCreatedAt(b), dir),
  size: (a: UnifiedRow, b: UnifiedRow, dir: LibrarySortDir) =>
    compareNumbers(getRowSize(a), getRowSize(b), dir),
};

const LIBRARY_FILTER_PREDICATES = {
  source: (row: UnifiedRow, value: string): boolean => row.kind === value,
};

/* ─── Component ───────────────────────────────────────────────────────────── */

export const MiniAppManager: React.FC<MiniAppManagerProps> = ({
  userId,
  tab,
  onTabChange,
  personalLibrary,
  globalLibrary,
  assignments,
  assignmentsLoading = false,
  onCreate,
  onEdit,
  onDelete,
  onRun,
  onAssign,
  onShowAssignments,
  onReorder,
  onSaveGlobalToLibrary,
  savingGlobalId,
  onImport,
  onExport,
  onArchiveCopyUrl,
  onArchiveEnd,
  onArchiveDelete,
  onArchiveOpenApp,
}) => {
  /* ── Assignment buckets ─────────────────────────────────────────────── */
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'active'),
    [assignments]
  );
  const archivedAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'inactive'),
    [assignments]
  );

  /* ── Folder navigation (Wave 3-B-3) ────────────────────────────────── */
  const folderState = useFolders(userId, 'miniapp');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Count personal apps per folder id (+ `root` for unfoldered items) for the
  // sidebar badges. Global apps never live in a teacher's folder.
  const folderItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of personalLibrary) {
      const key = item.folderId ?? 'root';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [personalLibrary]);

  // Filter BEFORE building rows so search/sort only operate on the currently
  // selected folder's apps.
  const folderFilteredPersonal = useMemo(() => {
    if (selectedFolderId === null) return personalLibrary;
    return personalLibrary.filter(
      (item) => (item.folderId ?? null) === selectedFolderId
    );
  }, [personalLibrary, selectedFolderId]);

  /* ── Unified rows (sorted by source + ordering) ─────────────────────── */
  const personalRows = useMemo<UnifiedRow[]>(
    () => folderFilteredPersonal.map((item) => ({ kind: 'personal', item })),
    [folderFilteredPersonal]
  );
  const globalRows = useMemo<UnifiedRow[]>(
    () => globalLibrary.map((item) => ({ kind: 'global', item })),
    [globalLibrary]
  );

  /* ── Reorder is only meaningful for personal rows ───────────────────── */
  const onReorderCommit = useCallback(
    async (nextOrderedIds: string[]) => {
      // Strip the "personal:" prefix before handing to the parent.
      const ids = nextOrderedIds
        .filter((id) => id.startsWith('personal:'))
        .map((id) => id.slice('personal:'.length));
      await onReorder(ids);
    },
    [onReorder]
  );

  const reorderHook = useSortableReorder<UnifiedRow>({
    items: personalRows,
    getId: getRowId,
    onCommit: onReorderCommit,
  });

  /* ── useLibraryView manages toolbar state + filtered list ────────────── */
  const allRows = useMemo<UnifiedRow[]>(
    () => [...reorderHook.orderedItems, ...globalRows],
    [reorderHook.orderedItems, globalRows]
  );

  const view = useLibraryView<UnifiedRow>({
    items: allRows,
    initialSort: LIBRARY_INITIAL_SORT,
    initialFilterValues: LIBRARY_INITIAL_FILTER_VALUES,
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
    filterPredicates: LIBRARY_FILTER_PREDICATES,
  });

  const source: MiniAppSource =
    (view.state.filterValues.source as MiniAppSource | undefined) ?? 'personal';
  const isGlobalView = source === 'global';

  /* ── Shell actions ────────────────────────────────────────────────────── */
  const primaryAction = {
    label: 'New App',
    icon: Plus,
    onClick: onCreate,
  };

  const secondaryActions = [
    {
      label: 'Import',
      icon: FileUp,
      onClick: onImport,
    },
    {
      label: 'Export',
      icon: Download,
      onClick: onExport,
      disabled: personalLibrary.length === 0,
      disabledReason: 'Your library is empty.',
    },
  ];

  /* ── Drop-to-folder handler (Wave 3-B-3) ─────────────────────────────── */
  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      // Row ids are prefixed `personal:` or `global:`. Only personal rows
      // participate in folders; global cards are `sortable={false}` so drops
      // from them shouldn't fire, but guard defensively.
      if (!itemId.startsWith('personal:')) return;
      const rawId = itemId.slice('personal:'.length);
      try {
        await moveItem(rawId, folderId);
      } catch (err) {
        console.error('[MiniAppManager] moveItem failed:', err);
      }
    },
    [userId, moveItem]
  );

  /* ── Folder sidebar (Library tab only) ───────────────────────────────── */
  const folderSidebarSlot =
    tab === 'library' && userId ? (
      <FolderSidebar
        widget="miniapp"
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

  /* ── Card builders ────────────────────────────────────────────────────── */

  function renderPersonalCard(row: UnifiedRow & { kind: 'personal' }) {
    const app = row.item;
    const secondary: LibraryMenuAction[] = [
      {
        id: 'run',
        label: 'Run app',
        icon: Play,
        onClick: () => onRun(app),
      },
      {
        id: 'assignments',
        label: 'View assignments',
        icon: BarChart3,
        onClick: () => onShowAssignments(app),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => onEdit(app),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => onDelete(app),
        destructive: true,
      },
    ];

    return (
      <LibraryItemCard<MiniAppItem>
        key={getRowId(row)}
        id={getRowId(row)}
        title={app.title}
        subtitle={
          <span className="font-mono">
            {(app.html.length / 1024).toFixed(1)} KB
          </span>
        }
        thumbnail={
          <div className="flex h-full w-full items-center justify-center bg-indigo-50 text-[10px] font-black uppercase tracking-widest text-indigo-600">
            HTML
          </div>
        }
        primaryAction={{
          label: 'Assign',
          icon: Link2,
          onClick: () => onAssign(app),
        }}
        secondaryActions={secondary}
        onClick={() => onEdit(app)}
        sortable
        viewMode={view.state.viewMode}
      />
    );
  }

  function renderGlobalCard(row: UnifiedRow & { kind: 'global' }) {
    const app = row.item;
    const saving = savingGlobalId === app.id;
    const secondary: LibraryMenuAction[] = [
      {
        id: 'run',
        label: 'Run app',
        icon: Play,
        onClick: () => onRun(app),
      },
      {
        id: 'assignments',
        label: 'View assignments',
        icon: BarChart3,
        onClick: () => onShowAssignments(app),
      },
      {
        id: 'save',
        label: saving ? 'Saving…' : 'Save to my library',
        icon: saving ? Loader2 : BookDown,
        onClick: () => onSaveGlobalToLibrary(app),
        disabled: saving,
      },
    ];

    return (
      <LibraryItemCard<GlobalMiniAppItem>
        key={getRowId(row)}
        id={getRowId(row)}
        title={app.title}
        subtitle={
          <span className="font-mono">
            {(app.html.length / 1024).toFixed(1)} KB
          </span>
        }
        thumbnail={
          <div className="flex h-full w-full items-center justify-center bg-violet-50 text-[10px] font-black uppercase tracking-widest text-violet-600">
            HTML
          </div>
        }
        primaryAction={{
          label: 'Assign',
          icon: Link2,
          onClick: () => onAssign(app),
        }}
        secondaryActions={secondary}
        // No onClick for global items — they are read-only here; clicking the
        // body would imply "edit", which is admin-only.
        sortable={false}
        viewMode={view.state.viewMode}
      />
    );
  }

  function renderCard(row: UnifiedRow): React.ReactElement {
    if (row.kind === 'personal') return renderPersonalCard(row);
    return renderGlobalCard(row);
  }

  /* ── Empty states ─────────────────────────────────────────────────────── */

  const personalEmpty = (
    <div className="flex flex-col items-center justify-center gap-3 text-center py-10 text-slate-400">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <Box className="h-8 w-8 stroke-slate-300" />
      </div>
      <div>
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">
          No apps saved yet
        </p>
        <p className="text-xs font-medium text-slate-400">
          Import a file or create your first mini-app.
        </p>
      </div>
    </div>
  );

  const globalEmpty = (
    <div className="flex flex-col items-center justify-center gap-3 text-center py-10 text-slate-400">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <Globe className="h-8 w-8 stroke-slate-300" />
      </div>
      <div>
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">
          No shared apps yet
        </p>
        <p className="text-xs font-medium text-slate-400">
          Your admin has not published any apps yet.
        </p>
      </div>
    </div>
  );

  const activeEmpty = (
    <div className="flex flex-col items-center justify-center gap-2 text-center py-10 text-slate-400">
      <p className="text-sm font-black uppercase tracking-widest text-slate-500">
        No active assignments
      </p>
      <p className="text-xs font-medium text-slate-400">
        Assign a mini-app to create a live link for students.
      </p>
    </div>
  );

  const archiveEmpty = (
    <div className="flex flex-col items-center justify-center gap-2 text-center py-10 text-slate-400">
      <p className="text-sm font-black uppercase tracking-widest text-slate-500">
        No archived assignments
      </p>
      <p className="text-xs font-medium text-slate-400">
        Ended assignments will appear here.
      </p>
    </div>
  );

  /* ── Render helpers for Active / Archive tabs ─────────────────────────── */

  function statusBadge(
    assignment: MiniAppAssignment,
    mode: 'active' | 'archive'
  ): AssignmentStatusBadge {
    if (mode === 'archive') {
      return { label: 'Ended', tone: 'neutral' };
    }
    return { label: 'Live', tone: 'success', dot: true };
  }

  function assignmentSecondary(
    assignment: MiniAppAssignment,
    mode: 'active' | 'archive'
  ): LibraryMenuAction[] {
    const actions: LibraryMenuAction[] = [];
    actions.push({
      id: 'copy-url',
      label: 'Copy student link',
      icon: Copy,
      onClick: () => onArchiveCopyUrl(assignment),
    });
    if (onArchiveOpenApp) {
      actions.push({
        id: 'open',
        label: 'Open app',
        icon: ExternalLink,
        onClick: () => onArchiveOpenApp(assignment),
      });
    }
    if (mode === 'active') {
      actions.push({
        id: 'end',
        label: 'End assignment',
        icon: Box,
        onClick: () => onArchiveEnd(assignment),
      });
    }
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => onArchiveDelete(assignment),
      destructive: true,
    });
    return actions;
  }

  /* ── Tab content ──────────────────────────────────────────────────────── */

  let tabContent: React.ReactElement;
  if (tab === 'active') {
    if (assignmentsLoading) {
      tabContent = (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    } else if (activeAssignments.length === 0) {
      tabContent = activeEmpty;
    } else {
      tabContent = (
        <div className="flex flex-col gap-2">
          {activeAssignments.map((a) => (
            <AssignmentArchiveCard<MiniAppAssignment>
              key={a.id}
              assignment={a}
              mode="active"
              status={statusBadge(a, 'active')}
              title={a.assignmentName}
              subtitle={a.appTitle}
              primaryAction={{
                label: 'Copy link',
                icon: Copy,
                onClick: () => onArchiveCopyUrl(a),
              }}
              secondaryActions={assignmentSecondary(a, 'active')}
            />
          ))}
        </div>
      );
    }
  } else if (tab === 'archive') {
    if (assignmentsLoading) {
      tabContent = (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    } else if (archivedAssignments.length === 0) {
      tabContent = archiveEmpty;
    } else {
      tabContent = (
        <div className="flex flex-col gap-2">
          {archivedAssignments.map((a) => (
            <AssignmentArchiveCard<MiniAppAssignment>
              key={a.id}
              assignment={a}
              mode="archive"
              status={statusBadge(a, 'archive')}
              title={a.assignmentName}
              subtitle={a.appTitle}
              primaryAction={{
                label: 'Copy link',
                icon: Copy,
                onClick: () => onArchiveCopyUrl(a),
              }}
              secondaryActions={assignmentSecondary(a, 'archive')}
            />
          ))}
        </div>
      );
    }
  } else {
    /* Library tab */
    const empty = isGlobalView ? globalEmpty : personalEmpty;
    // Enable card drag when a teacher is signed in so drag-to-folder works.
    // In the Global view we keep drag disabled — global items are read-only
    // and never move between folders.
    const enableCardDrag = Boolean(userId) && !isGlobalView;
    const gridEl = (
      <LibraryGrid<UnifiedRow>
        items={view.visibleItems}
        getId={getRowId}
        renderCard={renderCard}
        onReorder={
          isGlobalView ? undefined : (ids) => reorderHook.handleReorder(ids)
        }
        dragDisabled={isGlobalView}
        reorderLocked={!isGlobalView && view.reorderLocked}
        reorderLockedReason={view.reorderLockedReason}
        layout={view.state.viewMode}
        useExternalDndContext={enableCardDrag}
        emptyState={empty}
      />
    );

    if (enableCardDrag) {
      const orderedIds = view.visibleItems.map(getRowId);
      const renderDragOverlay = (activeId: string): React.ReactNode => {
        const row = view.visibleItems.find((r) => getRowId(r) === activeId);
        if (!row || row.kind !== 'personal') return null;
        const app = row.item;
        return (
          <LibraryItemCard<MiniAppItem>
            id={getRowId(row)}
            title={app.title}
            subtitle={
              <span className="font-mono">
                {(app.html.length / 1024).toFixed(1)} KB
              </span>
            }
            thumbnail={
              <div className="flex h-full w-full items-center justify-center bg-indigo-50 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                HTML
              </div>
            }
            primaryAction={{
              label: 'Assign',
              icon: Link2,
              onClick: () => undefined,
            }}
            viewMode={view.state.viewMode}
            sortable={false}
            isDragOverlay
          />
        );
      };
      tabContent = (
        <LibraryDndContext
          itemIds={orderedIds}
          onDropOnFolder={handleDropOnFolder}
          onReorder={(ids) => reorderHook.handleReorder(ids)}
          renderOverlay={renderDragOverlay}
        >
          {gridEl}
        </LibraryDndContext>
      );
    } else {
      tabContent = gridEl;
    }
  }

  /* ── Toolbar is only meaningful on the Library tab ────────────────────── */
  const toolbarSlot =
    tab === 'library' ? (
      <LibraryToolbar
        search={view.toolbarProps.search}
        onSearchChange={view.toolbarProps.onSearchChange}
        searchPlaceholder="Search mini-apps…"
        sort={view.toolbarProps.sort}
        sortOptions={SORT_OPTIONS}
        onSortChange={view.toolbarProps.onSortChange}
        filters={[SOURCE_FILTER]}
        filterValues={view.toolbarProps.filterValues}
        onFilterChange={view.toolbarProps.onFilterChange}
        viewMode={view.toolbarProps.viewMode}
        onViewModeChange={view.toolbarProps.onViewModeChange}
      />
    ) : null;

  return (
    <LibraryShell
      widgetLabel="Mini App"
      tab={tab}
      onTabChange={onTabChange}
      counts={{
        library: personalLibrary.length + globalLibrary.length,
        active: activeAssignments.length,
        archive: archivedAssignments.length,
      }}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      filterSidebarSlot={folderSidebarSlot}
      toolbarSlot={toolbarSlot}
    >
      {tabContent}
    </LibraryShell>
  );
};

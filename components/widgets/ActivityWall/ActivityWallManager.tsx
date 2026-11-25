// Activity Wall library on the widget face, on the same shell as Quiz and Video Activity.

import React, { useCallback, useMemo, useState } from 'react';
import { CheckSquare, LayoutGrid, Loader2 } from 'lucide-react';
import type {
  ActivityWallConfig,
  ActivityWallLibraryEntry,
  WidgetData,
} from '@/types';
import {
  BulkActionBar,
  FolderPickerPopover,
  FolderSidebar,
  LibraryDndContext,
  LibraryGrid,
  LibraryItemCard,
  LibraryShell,
  LibraryToolbar,
  countItemsByFolder,
  buildMoveToFolderAction,
  useFolderLibraryView,
  useLibrarySelection,
  useSortableReorder,
} from '@/components/common/library';
import type {
  LibraryBadge,
  LibrarySortOption,
} from '@/components/common/library/types';
import { useFolderViewSidebar } from '@/components/common/library/useFolderViewSidebar';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useFolders, type UseFoldersResult } from '@/hooks/useFolders';
import { tourAttr, tourTypeAttr } from '@/config/tourAnchors';
import { WallThumbnail } from './WallThumbnail';
import {
  useWallLibraryActions,
  wallBadges,
  wallMenuActions,
  wallOpenAction,
  wallSubtitle,
} from './wallLibraryShared';

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'updatedAt', label: 'Last updated', defaultDir: 'desc' },
  { key: 'createdAt', label: 'Date created', defaultDir: 'desc' },
];

const SEARCH_FIELDS = (entry: ActivityWallLibraryEntry): string[] => [
  entry.title,
  entry.prompt,
];

const INITIAL_SORT = { key: 'manual', dir: 'asc' as const };

const SORT_COMPARATORS = {
  manual: (
    a: ActivityWallLibraryEntry,
    b: ActivityWallLibraryEntry,
    dir: 'asc' | 'desc'
  ) => {
    const diff =
      (a.order ?? Number.POSITIVE_INFINITY) -
      (b.order ?? Number.POSITIVE_INFINITY);
    return dir === 'asc' ? diff : -diff;
  },
  title: (
    a: ActivityWallLibraryEntry,
    b: ActivityWallLibraryEntry,
    dir: 'asc' | 'desc'
  ) => {
    const diff = a.title.localeCompare(b.title);
    return dir === 'asc' ? diff : -diff;
  },
  updatedAt: (
    a: ActivityWallLibraryEntry,
    b: ActivityWallLibraryEntry,
    dir: 'asc' | 'desc'
  ) => {
    const diff = a.updatedAt - b.updatedAt;
    return dir === 'asc' ? diff : -diff;
  },
  createdAt: (
    a: ActivityWallLibraryEntry,
    b: ActivityWallLibraryEntry,
    dir: 'asc' | 'desc'
  ) => {
    const diff = a.createdAt - b.createdAt;
    return dir === 'asc' ? diff : -diff;
  },
};

const GET_ID = (entry: ActivityWallLibraryEntry): string => entry.id;
const WALL_NOUN = ['wall', 'walls'] as const;

interface ActivityWallManagerProps {
  widget: WidgetData;
  uid: string | undefined;
  entries: ActivityWallLibraryEntry[];
  loading: boolean;
  activeEntryId: string | null;
  readOnly: boolean;
  onOpenOnBoard: (entryId: string) => void;
  /** Starts a new wall in the open folder. */
  onCreate: (folderId: string | null) => void;
  onEdit: (entry: ActivityWallLibraryEntry) => void;
  /** Extra status chips, e.g. the Claude review mark. */
  badgesFor?: (entry: ActivityWallLibraryEntry) => LibraryBadge[];
  onDuplicate: (entry: ActivityWallLibraryEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onClearPosts: (entryId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onConfigChange: (updates: Partial<ActivityWallConfig>) => void;
  addToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  confirm: (message: string) => Promise<boolean>;
  /** Fixture folders for the dev harness. */
  folders?: UseFoldersResult;
}

export const ActivityWallManager: React.FC<ActivityWallManagerProps> = ({
  widget,
  uid,
  entries,
  loading,
  activeEntryId,
  readOnly,
  onOpenOnBoard,
  onCreate,
  onEdit,
  badgesFor,
  onDuplicate,
  onDelete,
  onClearPosts,
  onReorder,
  onConfigChange,
  addToast,
  confirm,
  folders,
}) => {
  const config = widget.config as ActivityWallConfig;
  const canWrite = !!uid && !readOnly;
  const ownFolders = useFolders(folders ? undefined : uid, 'activity_wall');
  const folderState = folders ?? ownFolders;
  const [folderPickerTarget, setFolderPickerTarget] =
    useState<ActivityWallLibraryEntry | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useLibrarySelection();

  const { counts, clearPosts, wallDelete } = useWallLibraryActions({
    active: true,
    uid,
    entries,
    onDelete,
    onClearPosts,
    addToast,
    confirm,
  });

  const folderItemCounts = useMemo(
    () => countItemsByFolder(entries),
    [entries]
  );
  const folderSidebarActions = useFolderViewSidebar({
    setFolderColor: folderState.setFolderColor,
    reorderSiblings: folderState.reorderSiblings,
    noun: { one: 'wall', many: 'walls' },
    items: entries,
    deleteItems: wallDelete.folderActions(entries).deleteItems,
  });

  const view = useFolderLibraryView<ActivityWallLibraryEntry>({
    items: entries,
    folderView: {
      library: 'activity_wall',
      userId: uid,
      folders: folderState.folders,
      foldersLoading: folderState.loading,
      reorderSiblings: folderState.reorderSiblings,
      getId: GET_ID,
      itemNoun: WALL_NOUN,
    },
    initialSort: INITIAL_SORT,
    initialViewMode: config.libraryViewMode ?? 'list',
    searchFields: SEARCH_FIELDS,
    sortComparators: SORT_COMPARATORS,
    onViewModeChange: (libraryViewMode) => onConfigChange({ libraryViewMode }),
  });

  const reorder = useSortableReorder<ActivityWallLibraryEntry>({
    items: view.visibleItems,
    getId: GET_ID,
    onCommit: onReorder,
  });

  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!uid) return;
      try {
        await moveItem(itemId, folderId);
      } catch {
        addToast('That wall could not be moved.', 'error');
      }
    },
    [addToast, moveItem, uid]
  );

  const reorderDragActive =
    canWrite && !view.reorderLocked && view.visibleItems.length >= 2;
  const handleReorderDrop = useCallback(
    (orderedIds: string[]) => {
      if (!reorderDragActive || !view.prepareReorder()) return;
      void reorder.handleReorder(orderedIds);
    },
    [reorder, reorderDragActive, view]
  );

  const exitSelection = () => {
    selection.clear();
    setSelectionMode(false);
  };

  const handleBulkMove = async (folderId: string | null): Promise<void> => {
    if (!uid || selection.count === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selection.selectedIds).map((id) => moveItem(id, folderId))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        addToast(
          `${failed} wall${failed === 1 ? '' : 's'} failed to move.`,
          'error'
        );
      }
      exitSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selection.count === 0) return;
    const targets = entries.filter((e) => selection.selectedIds.has(e.id));
    setBulkBusy(true);
    try {
      if (await wallDelete.deleteMany(targets)) exitSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const renderCard = (
    entry: ActivityWallLibraryEntry,
    index?: number
  ): React.ReactElement => (
    <LibraryItemCard<ActivityWallLibraryEntry>
      key={entry.id}
      id={entry.id}
      title={entry.title || 'Untitled wall'}
      subtitle={wallSubtitle(entry, counts[entry.id])}
      thumbnail={<WallThumbnail entry={entry} />}
      badges={wallBadges(entry, activeEntryId, badgesFor?.(entry))}
      primaryAction={wallOpenAction(() => onOpenOnBoard(entry.id), readOnly)}
      secondaryActions={
        readOnly
          ? []
          : wallMenuActions({
              onEdit: () => onEdit(entry),
              onDuplicate: () => void onDuplicate(entry),
              onClearPosts: () => void clearPosts(entry),
              onDelete: () => void wallDelete.deleteOne(entry),
              extra: [
                buildMoveToFolderAction({
                  onOpenPicker: () => setFolderPickerTarget(entry),
                  disabled: !uid,
                }),
              ],
            })
      }
      viewMode={view.state.viewMode}
      meta={entry}
      selectionMode={selectionMode}
      selected={selection.isSelected(entry.id)}
      onSelectionToggle={() => selection.toggle(entry.id)}
      tourIndex={index}
      tourWidgetType="activity-wall"
    />
  );

  const folderSidebarSlot = uid ? (
    <FolderSidebar
      widget="activity_wall"
      folders={folderState.folders}
      loading={folderState.loading}
      error={folderState.error}
      selectedFolderId={view.selectedFolderId}
      onSelectFolder={view.onSelectFolder}
      folderView={view.folderView}
      itemCounts={folderItemCounts}
      {...(canWrite
        ? {
            onCreateFolder: folderState.createFolder,
            onRenameFolder: folderState.renameFolder,
            onMoveFolder: folderState.moveFolder,
            onDeleteFolder: folderState.deleteFolder,
            ...folderSidebarActions,
          }
        : {})}
      enableDrop={canWrite}
    />
  ) : undefined;

  const selectButton = canWrite ? (
    <button
      type="button"
      {...tourAttr('activity-wall.selection-mode', widget.id, widget.type)}
      onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
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
      title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
    >
      <CheckSquare
        style={{ width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' }}
      />
      {selectionMode ? 'Cancel' : 'Select'}
    </button>
  ) : undefined;

  const shell = (
    <LibraryShell
      widgetLabel="Activity Wall"
      widgetType="activity-wall"
      tab="library"
      onTabChange={() => undefined}
      visibleTabs={['library']}
      counts={{ library: entries.length }}
      primaryAction={
        readOnly
          ? undefined
          : {
              label: 'New wall',
              icon: LayoutGrid,
              onClick: () => onCreate(view.selectedFolderId),
            }
      }
      folderPanelMode={config.folderPanelMode}
      onFolderPanelModeChange={(folderPanelMode) =>
        onConfigChange({ folderPanelMode })
      }
      filterSidebarSlot={folderSidebarSlot}
      folderView={view.folderView}
      folderViewMode={view.state.viewMode}
      toolbarSlot={
        <LibraryToolbar
          {...view.toolbarProps}
          sortOptions={SORT_OPTIONS}
          searchPlaceholder="Search walls…"
          widgetType="activity-wall"
          rightSlot={selectButton}
        />
      }
    >
      {loading ? (
        <div
          className="flex items-center justify-center text-brand-blue-primary"
          style={{ height: 'min(160px, 40cqmin)' }}
        >
          <Loader2
            aria-label="Loading walls"
            className="animate-spin"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {selectionMode && selection.count > 0 && (
            <div style={{ marginBottom: 'min(12px, 3cqmin)' }}>
              <BulkActionBar
                count={selection.count}
                onClear={exitSelection}
                folders={folderState.folders}
                onMove={handleBulkMove}
                onDelete={handleBulkDelete}
                busy={bulkBusy}
                anchors={{
                  move: tourAttr('activity-wall.bulk-move'),
                  delete: tourAttr('activity-wall.bulk-delete'),
                  clear: tourAttr('activity-wall.bulk-clear'),
                }}
              />
            </div>
          )}
          <LibraryGrid<ActivityWallLibraryEntry>
            items={reorder.orderedItems}
            getId={GET_ID}
            renderCard={renderCard}
            onReorder={handleReorderDrop}
            dragDisabled={!canWrite}
            reorderLocked={reorderDragActive ? view.reorderLocked : false}
            reorderLockedReason={
              reorderDragActive ? view.reorderLockedReason : undefined
            }
            layout={view.state.viewMode}
            useExternalDndContext={canWrite}
            emptyState={
              entries.length === 0 ? (
                <ScaledEmptyState
                  icon={LayoutGrid}
                  title="No Walls Yet"
                  subtitle="Create your first Activity Wall to get started."
                  titleClassName="text-slate-500"
                  subtitleClassName="text-slate-400"
                  action={
                    !readOnly && (
                      <button
                        type="button"
                        onClick={() => onCreate(view.selectedFolderId)}
                        {...tourTypeAttr(
                          'activity-wall-library.empty-new',
                          'activity-wall'
                        )}
                        className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary font-bold text-white shadow-xs transition-colors hover:bg-brand-blue-dark"
                        style={{
                          padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                          fontSize: 'min(14px, 4.5cqmin)',
                        }}
                      >
                        New wall
                      </button>
                    )
                  }
                />
              ) : (
                <ScaledEmptyState
                  icon={LayoutGrid}
                  title="Nothing matches"
                  subtitle="Try a different search, folder, or filter."
                  titleClassName="text-slate-500"
                  subtitleClassName="text-slate-400"
                />
              )
            }
          />
        </div>
      )}
    </LibraryShell>
  );

  return (
    <>
      {canWrite ? (
        <LibraryDndContext
          folderView={view.folderView}
          selectedIds={selection.selectedIds}
          folderActions={folderState}
          itemIds={reorder.orderedItems.map(GET_ID)}
          onReorder={handleReorderDrop}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={(activeId) => {
            const entry = reorder.orderedItems.find((e) => e.id === activeId);
            return entry ? renderCard(entry) : null;
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
          title={`Move "${folderPickerTarget.title || 'Untitled wall'}" to…`}
        />
      )}
    </>
  );
};

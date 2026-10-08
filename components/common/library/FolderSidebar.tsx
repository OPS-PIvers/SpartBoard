/**
 * FolderSidebar — left-rail folder navigation for library-style widgets.
 *
 * Renders "All items" (root) + the recursive FolderTree, plus inline
 * new-folder / rename UI and a delete-confirmation modal for non-empty
 * folders. All CRUD is delegated to `useFolders`; this component owns
 * transient UI state only (selection echo, which folder is renaming,
 * which overflow menu is open, etc.).
 *
 * Intended slot: `LibraryShellProps.filterSidebarSlot`.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  FolderPlus,
  Inbox,
  X,
  AlertTriangle,
  Home,
  List,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type {
  LibraryFolder,
  LibraryFolderColor,
  LibraryFolderWidget,
} from '@/types';
import type { FolderDeleteUndo } from '@/hooks/useFolderTree';
import { collectDescendantIds } from '@/utils/folderTree';
import { FolderTree } from './FolderTree';
import { folderDroppableId, type FolderDropData } from './folderDropTargets';
import { useFolderPanelMode } from './LibraryFolderPanelContext';
import {
  DeleteFolderDialog,
  type DeleteFolderChoice,
  type LibraryItemNoun,
} from './DeleteFolderDialog';
import type { LibraryFolderViewModel } from './LibraryFolderViewContext';
import { LIBRARY_ROOT_LABEL } from './FolderViewHeader';
import { folderPath, sameLocation, type LibraryLocation } from './folderView';

export type FolderDeleteMode = 'move-to-parent' | 'delete-all';

/** Turns on the folder-view delete dialog (LIBRARY_FOLDERS D17-D20). */
export interface FolderDeleteConfig {
  noun: LibraryItemNoun;
  /** Every item the teacher owns, with its folder; drives the counts and "delete everything". */
  items: { id: string; folderId?: string | null }[];
  /** True when the widget won't delete this item yet (e.g. a live assignment). */
  isBlocked?: (id: string) => boolean;
  /** Names why blocked items are kept, e.g. "2 quizzes have live assignments". */
  blockedReason?: (count: number) => string;
  /** The widget's own delete path, run without its per-item confirm; omit to offer only "Keep everything". */
  deleteItems?: (ids: string[]) => Promise<void>;
  /** Reports a finished delete, with an undo when the folder's contents were kept. */
  onDeleted?: (message: string, undo?: FolderDeleteUndo) => void;
}

/** A widget's own delete path for "Delete the folder and everything in it", passed down from its Widget. */
export type FolderDeleteActions = Pick<
  FolderDeleteConfig,
  'deleteItems' | 'isBlocked' | 'blockedReason'
>;

export interface FolderSidebarProps {
  /** Which widget's folder tree to render. Reserved for future use. */
  widget: LibraryFolderWidget;
  folders: LibraryFolder[];
  /** `null` = "All items" (no folder filter — every item is shown). */
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;

  /**
   * Per-folder item counts, keyed by `folder.id` plus `ROOT_FOLDER_COUNT_KEY`
   * ("root") for unfoldered items. The "All items" row's badge is the sum of
   * every bucket here (it shows every item, not just unfoldered ones).
   */
  itemCounts?: Record<string, number>;

  /** Hook-level CRUD. Passing a handler enables that affordance in the UI. */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<string>;
  onRenameFolder?: (folderId: string, nextName: string) => Promise<void>;
  onMoveFolder?: (
    folderId: string,
    nextParentId: string | null
  ) => Promise<void>;
  onDeleteFolder?: (
    folderId: string,
    mode: FolderDeleteMode
  ) => Promise<FolderDeleteUndo | undefined | void>;
  /** Shows the colour row in each folder's menu. */
  onSetFolderColor?: (
    folderId: string,
    color: LibraryFolderColor | null
  ) => Promise<void>;
  /** Uses the folder-view delete dialog instead of the legacy one. */
  folderDelete?: FolderDeleteConfig;

  loading?: boolean;
  error?: string | null;

  /**
   * When true, folder rows (and the "All items" root) become drop targets via
   * `useDroppable`. Must be rendered inside a `LibraryDndContext`. The parent
   * context is responsible for routing drops to `useFolders.moveItem(...)`.
   */
  enableDrop?: boolean;

  /** Folder view model; when set the panel navigates places instead of filtering. */
  folderView?: LibraryFolderViewModel | null;
}

// Matches no folder, so the tree highlights nothing while All items or Recent is open.
const NO_FOLDER_SELECTED = '\u0000none';

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  itemCounts,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onSetFolderColor,
  folderDelete,
  loading = false,
  error = null,
  enableDrop = false,
  folderView = null,
}) => {
  const rootDropData = useMemo<FolderDropData>(
    () => ({ type: 'folder', folderId: null }),
    []
  );
  const rootDroppable = useDroppable({
    id: folderDroppableId(null),
    data: rootDropData,
    disabled: !enableDrop,
  });
  const isRootOver = enableDrop && rootDroppable.isOver;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(
    undefined
  );
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LibraryFolder | null>(
    null
  );
  const [commitError, setCommitError] = useState<string | null>(null);

  // Opening a folder from the main list reveals it in the tree.
  const openFolderId =
    folderView?.location.kind === 'folder'
      ? folderView.location.folderId
      : null;
  const [revealedFolderId, setRevealedFolderId] = useState<string | null>(null);
  if (folderView && openFolderId !== revealedFolderId) {
    setRevealedFolderId(openFolderId);
    const ancestors = folderPath(openFolderId, folderView.index).slice(0, -1);
    if (ancestors.some((f) => !expanded[f.id])) {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const f of ancestors) next[f.id] = true;
        return next;
      });
    }
  }

  // "All items" bypasses folder filtering entirely (selectedFolderId === null
  // means "show everything the caller passed in" — see filterByFolder's
  // contract in folderFilters.ts), so its badge must sum every bucket in
  // itemCounts, not just the root bucket. Reading only itemCounts['root']
  // undercounted whenever any items were actually filed into a folder — e.g.
  // 7 unfoldered + 3 in "Unit 2" showed "7" on a row that opens all 10.
  const totalItemCount = itemCounts
    ? Object.values(itemCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  // Count descendants + direct items for the delete modal.
  const deleteImpact = useMemo(() => {
    if (!confirmDelete) return { itemCount: 0, subfolderCount: 0 };
    const byParent = new Map<string | null, LibraryFolder[]>();
    for (const f of folders) {
      const bucket = byParent.get(f.parentId) ?? [];
      bucket.push(f);
      byParent.set(f.parentId, bucket);
    }
    let subfolderCount = 0;
    const walk = (id: string): void => {
      const kids = byParent.get(id) ?? [];
      for (const k of kids) {
        subfolderCount += 1;
        walk(k.id);
      }
    };
    walk(confirmDelete.id);
    const itemCount = itemCounts?.[confirmDelete.id] ?? 0;
    return { itemCount, subfolderCount };
  }, [confirmDelete, folders, itemCounts]);

  const handleCreate = async (parentId: string | null): Promise<void> => {
    if (!onCreateFolder) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreatingUnder(undefined);
      setNewName('');
      return;
    }
    try {
      await onCreateFolder(trimmed, parentId);
      setCreatingUnder(undefined);
      setNewName('');
      setCommitError(null);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameCommit = async (
    folderId: string,
    nextName: string
  ): Promise<void> => {
    if (!onRenameFolder) return;
    try {
      await onRenameFolder(folderId, nextName);
      setRenamingId(null);
      setCommitError(null);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmDelete = async (mode: FolderDeleteMode): Promise<void> => {
    if (!onDeleteFolder || !confirmDelete) return;
    try {
      await onDeleteFolder(confirmDelete.id, mode);
      // If we deleted the selected folder, fall back to root.
      if (selectedFolderId === confirmDelete.id) onSelectFolder(null);
      setConfirmDelete(null);
      setCommitError(null);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  };

  // Folder-view dialog: everything below the folder, at any depth.
  const subtree = useMemo(() => {
    if (!confirmDelete || !folderDelete) return null;
    const subfolderIds = collectDescendantIds(
      confirmDelete.id,
      folders,
      (f) => f.parentId
    );
    const inTree = new Set([confirmDelete.id, ...subfolderIds]);
    const itemIds = folderDelete.items
      .filter((i) => i.folderId != null && inTree.has(i.folderId))
      .map((i) => i.id);
    const blocked = folderDelete.isBlocked
      ? itemIds.filter((id) => folderDelete.isBlocked?.(id))
      : [];
    return { subfolderCount: subfolderIds.length, itemIds, blocked };
  }, [confirmDelete, folderDelete, folders]);

  const parentNameOf = (folder: LibraryFolder): string =>
    folders.find((f) => f.id === folder.parentId)?.name ?? 'Library';

  const deleteEmptyFolder = async (target: LibraryFolder): Promise<void> => {
    if (!onDeleteFolder) return;
    try {
      const undo = await onDeleteFolder(target.id, 'move-to-parent');
      folderDelete?.onDeleted?.(`Deleted “${target.name}”`, undo ?? undefined);
      setCommitError(null);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDialogConfirm = async (
    choice: DeleteFolderChoice
  ): Promise<void> => {
    if (!onDeleteFolder || !confirmDelete || !folderDelete || !subtree) return;
    const target = confirmDelete;
    if (choice === 'keep') {
      const undo = await onDeleteFolder(target.id, 'move-to-parent');
      folderDelete.onDeleted?.(`Deleted “${target.name}”`, undo ?? undefined);
    } else {
      const blocked = new Set(subtree.blocked);
      const doomed = subtree.itemIds.filter((id) => !blocked.has(id));
      if (doomed.length > 0) await folderDelete.deleteItems?.(doomed);
      // Blocked items are still filed in the tree; 'delete-all' moves them to the parent.
      await onDeleteFolder(target.id, 'delete-all');
      folderDelete.onDeleted?.(
        doomed.length > 0
          ? `Deleted “${target.name}” and ${doomed.length} ${
              doomed.length === 1
                ? folderDelete.noun.one
                : folderDelete.noun.many
            }`
          : `Deleted “${target.name}”`
      );
    }
    if (selectedFolderId === target.id) onSelectFolder(target.parentId);
    setConfirmDelete(null);
    setCommitError(null);
  };

  const requestDelete = (folderId: string): void => {
    const target = folders.find((f) => f.id === folderId);
    if (!target) return;
    const hasChildren = folders.some((f) => f.parentId === folderId);
    const itemCount = folderDelete
      ? folderDelete.items.filter((i) => i.folderId === folderId).length
      : (itemCounts?.[folderId] ?? 0);
    if (itemCount === 0 && !hasChildren) {
      // Empty folder — delete immediately without the modal.
      if (folderDelete) void deleteEmptyFolder(target);
      else void (onDeleteFolder && onDeleteFolder(folderId, 'move-to-parent'));
      if (selectedFolderId === folderId) onSelectFolder(null);
      return;
    }
    setConfirmDelete(target);
  };

  const panelMode = useFolderPanelMode();
  const isRail = panelMode === 'rail';

  const treeCounts = useMemo(() => {
    if (!folderView) return itemCounts;
    const out: Record<string, number> = {};
    for (const [id, t] of folderView.totals) out[id] = t.items;
    return out;
  }, [folderView, itemCounts]);
  const isAt = (target: LibraryLocation): boolean =>
    folderView != null && sameLocation(folderView.location, target);
  const treeSelectedId = folderView
    ? folderView.location.kind === 'folder'
      ? folderView.location.folderId
      : NO_FOLDER_SELECTED
    : selectedFolderId;
  const selectFolder = (folderId: string | null): void => {
    if (folderView) folderView.navigate({ kind: 'folder', folderId });
    else onSelectFolder(folderId);
  };

  return (
    <div
      className="flex flex-col gap-1 w-full"
      style={{ padding: isRail ? 'min(4px, 1cqmin)' : 'min(8px, 2cqmin)' }}
    >
      {!isRail && (
        <header
          className="flex items-center justify-between"
          style={{
            paddingInline: 'min(8px, 2cqmin)',
            paddingTop: 'min(4px, 1cqmin)',
            paddingBottom: 'min(8px, 2cqmin)',
          }}
        >
          <span
            className="font-bold text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            Folders
          </span>
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => {
                setCreatingUnder(null);
                setNewName('');
              }}
              className="p-1 rounded-lg hover:bg-white text-brand-blue-primary transition-colors"
              title="New folder"
              aria-label="New folder"
            >
              <FolderPlus
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
            </button>
          )}
        </header>
      )}

      {/* Root entry: "Library" in the folder view, "All items" otherwise */}
      <SidebarNavButton
        dropRef={enableDrop ? rootDroppable.setNodeRef : undefined}
        isOver={isRootOver}
        isRail={isRail}
        icon={folderView ? Home : Inbox}
        label={folderView ? LIBRARY_ROOT_LABEL : 'All items'}
        selected={
          folderView
            ? isAt({ kind: 'folder', folderId: null })
            : selectedFolderId === null
        }
        count={folderView ? undefined : totalItemCount}
        onClick={() => selectFolder(null)}
      />

      {/* Inline new-folder at root */}
      {!isRail && creatingUnder === null && (
        <NewFolderInput
          value={newName}
          onChange={setNewName}
          onCommit={() => handleCreate(null)}
          onCancel={() => {
            setCreatingUnder(undefined);
            setNewName('');
          }}
        />
      )}

      {!isRail && loading && (
        <p className="text-xxs text-slate-400 italic px-2 py-1">
          Loading folders…
        </p>
      )}
      {!isRail && error && (
        <p className="text-xxs text-brand-red-primary px-2 py-1">{error}</p>
      )}
      {!isRail && commitError && (
        <p className="text-xxs text-brand-red-primary px-2 py-1">
          {commitError}
        </p>
      )}

      <FolderTree
        folders={folders}
        parentId={null}
        depth={0}
        enableDrop={enableDrop}
        selectedFolderId={treeSelectedId}
        onSelectFolder={selectFolder}
        expanded={expanded}
        onToggleExpanded={(id) =>
          setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
        }
        itemCounts={treeCounts}
        openMenuId={openMenuId}
        onOpenMenu={setOpenMenuId}
        renamingId={renamingId}
        onStartRename={setRenamingId}
        onCommitRename={handleRenameCommit}
        onCancelRename={() => setRenamingId(null)}
        onRequestDelete={(folder) => requestDelete(folder.id)}
        onSetColor={
          onSetFolderColor
            ? (folderId, color) => {
                onSetFolderColor(folderId, color).catch((err: unknown) =>
                  setCommitError(
                    err instanceof Error ? err.message : String(err)
                  )
                );
              }
            : undefined
        }
        onCreateChild={(parentId) => {
          setCreatingUnder(parentId);
          setNewName('');
          // Make sure the new folder's parent is expanded so the input shows.
          setExpanded((prev) => ({ ...prev, [parentId]: true }));
        }}
        onMoveToRoot={async (folderId) => {
          if (!onMoveFolder) return;
          try {
            await onMoveFolder(folderId, null);
            setCommitError(null);
          } catch (err) {
            setCommitError(err instanceof Error ? err.message : String(err));
          }
        }}
      />

      {/* Inline new-folder rendered below the subtree it targets */}
      {!isRail && creatingUnder && creatingUnder !== null && (
        <div className="ml-6">
          <NewFolderInput
            value={newName}
            onChange={setNewName}
            onCommit={() => handleCreate(creatingUnder)}
            onCancel={() => {
              setCreatingUnder(undefined);
              setNewName('');
            }}
          />
        </div>
      )}

      {folderView && (
        <>
          <div
            className="border-t border-brand-gray-lightest"
            style={{ marginBlock: 'min(6px, 1.5cqmin)' }}
            role="separator"
          />
          <SidebarNavButton
            isRail={isRail}
            icon={List}
            label="All items"
            selected={isAt({ kind: 'all' })}
            count={totalItemCount}
            onClick={() => folderView.navigate({ kind: 'all' })}
          />
          <SidebarNavButton
            isRail={isRail}
            icon={Clock}
            label="Recent"
            selected={isAt({ kind: 'recent' })}
            onClick={() => folderView.navigate({ kind: 'recent' })}
          />
        </>
      )}

      {confirmDelete && folderDelete && subtree && (
        <DeleteFolderDialog
          folder={confirmDelete}
          parentName={parentNameOf(confirmDelete)}
          subfolderCount={subtree.subfolderCount}
          itemCount={subtree.itemIds.length}
          noun={folderDelete.noun}
          blockedCount={subtree.blocked.length}
          blockedReason={
            subtree.blocked.length > 0
              ? folderDelete.blockedReason?.(subtree.blocked.length)
              : undefined
          }
          canDeleteItems={!!folderDelete.deleteItems}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDialogConfirm}
        />
      )}
      {confirmDelete && !folderDelete && (
        <DeleteFolderModal
          folder={confirmDelete}
          itemCount={deleteImpact.itemCount}
          subfolderCount={deleteImpact.subfolderCount}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};

const SidebarNavButton: React.FC<{
  icon: LucideIcon;
  label: string;
  selected: boolean;
  isRail: boolean;
  count?: number;
  isOver?: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  onClick: () => void;
}> = ({
  icon: Icon,
  label,
  selected,
  isRail,
  count,
  isOver,
  dropRef,
  onClick,
}) => (
  <button
    ref={dropRef}
    type="button"
    onClick={onClick}
    title={isRail ? label : undefined}
    aria-label={isRail ? label : undefined}
    aria-current={selected ? 'location' : undefined}
    className={`flex items-center rounded-lg font-semibold text-left transition-colors ${
      isRail ? 'justify-center' : ''
    } ${
      selected
        ? 'bg-brand-blue-primary/10 text-brand-blue-dark'
        : 'text-slate-700 hover:bg-slate-100'
    } ${isOver ? 'ring-2 ring-brand-blue-primary/60 bg-brand-blue-lighter/40' : ''}`}
    style={{
      gap: isRail ? '0' : 'min(8px, 2cqmin)',
      paddingInline: isRail ? '0' : 'min(8px, 2cqmin)',
      paddingBlock: 'min(6px, 1.5cqmin)',
      fontSize: 'min(13px, 4cqmin)',
    }}
  >
    <Icon
      style={{
        width: 'min(16px, 4.5cqmin)',
        height: 'min(16px, 4.5cqmin)',
        flexShrink: 0,
      }}
    />
    {!isRail && <span className="flex-1 break-words">{label}</span>}
    {!isRail && count != null && count > 0 && (
      <span
        className={`inline-flex items-center justify-center rounded-full font-bold leading-none ${
          selected
            ? 'bg-brand-blue-primary/20 text-brand-blue-dark'
            : 'bg-slate-200 text-slate-600'
        }`}
        style={{
          paddingInline: 'min(6px, 1.5cqmin)',
          fontSize: 'min(10px, 3cqmin)',
        }}
      >
        {count}
      </span>
    )}
  </button>
);

const NewFolderInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onCommit, onCancel }) => {
  // Set to true synchronously before calling onCancel() so that the
  // synchronous blur event fired by unmounting the focused input (which
  // carries a stale onBlur closure still holding the typed text) does not
  // accidentally call onCommit with the cancelled value. Same pattern as
  // DraggableWindow's isCancellingTitleRef (Bug #1965).
  const isCancellingRef = useRef(false);

  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        // Pressing Enter commits and unmounts this input; the browser then
        // fires a synchronous blur during DOM removal. Bail out if the input
        // is no longer connected so onCommit() can't fire a second time and
        // create a duplicate folder.
        if (!e.currentTarget?.isConnected) return;
        if (isCancellingRef.current) {
          isCancellingRef.current = false;
          return;
        }
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Set the cancellation flag BEFORE calling onCancel() — onCancel()
          // unmounts this input, which synchronously fires blur with the stale
          // onBlur closure. The flag is read in the onBlur handler to skip the write.
          isCancellingRef.current = true;
          onCancel();
        }
      }}
      placeholder="New folder name"
      className="w-full px-2 py-1.5 text-sm rounded-lg border border-brand-blue-primary/40 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
    />
  );
};

const DeleteFolderModal: React.FC<{
  folder: LibraryFolder;
  itemCount: number;
  subfolderCount: number;
  onCancel: () => void;
  onConfirm: (mode: FolderDeleteMode) => void;
}> = ({ folder, itemCount, subfolderCount, onCancel, onConfirm }) => {
  const summary: string[] = [];
  if (itemCount > 0) {
    summary.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
  }
  if (subfolderCount > 0) {
    summary.push(
      `${subfolderCount} subfolder${subfolderCount === 1 ? '' : 's'}`
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full m-4 p-5">
        <header className="flex items-start gap-3 mb-3">
          <div className="bg-amber-100 text-amber-600 rounded-full p-2 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-brand-blue-dark text-base">
              Delete “{folder.name}”?
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              This folder contains {summary.join(' and ')}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="space-y-2 text-sm">
          <p className="text-slate-600">What should happen to its contents?</p>
          <button
            type="button"
            onClick={() => onConfirm('move-to-parent')}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-brand-blue-lighter/40 hover:bg-brand-blue-lighter text-brand-blue-dark font-semibold transition-colors"
          >
            Move contents to parent folder
            <span className="block text-xxs font-normal text-slate-500 mt-0.5">
              Safe — no items deleted.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onConfirm('delete-all')}
            className="w-full text-left px-3 py-2.5 rounded-xl text-brand-red-dark hover:bg-brand-red-lighter/60 font-semibold transition-colors"
          >
            Delete folder and subfolders
            <span className="block text-xxs font-normal text-slate-500 mt-0.5">
              Items inside move to the parent folder.
            </span>
          </button>
        </div>

        <footer className="flex items-center justify-end mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FolderSidebar;

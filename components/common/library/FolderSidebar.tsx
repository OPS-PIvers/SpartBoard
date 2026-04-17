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

import React, { useMemo, useState } from 'react';
import { FolderPlus, Inbox, X, AlertTriangle } from 'lucide-react';
import type { LibraryFolder, LibraryFolderWidget } from '@/types';
import { FolderTree } from './FolderTree';

export type FolderDeleteMode = 'move-to-parent' | 'delete-all';

export interface FolderSidebarProps {
  /** Which widget's folder tree to render. Reserved for future use. */
  widget: LibraryFolderWidget;
  folders: LibraryFolder[];
  /** `null` = "All items" (root). */
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;

  /** Count of items whose `folderId === folder.id` (null key = root). */
  itemCounts?: Record<string, number>;

  /** Hook-level CRUD. Passing a handler enables that affordance in the UI. */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<string>;
  onRenameFolder?: (folderId: string, nextName: string) => Promise<void>;
  onMoveFolder?: (
    folderId: string,
    nextParentId: string | null
  ) => Promise<void>;
  onDeleteFolder?: (folderId: string, mode: FolderDeleteMode) => Promise<void>;

  loading?: boolean;
  error?: string | null;
}

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  itemCounts,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  loading = false,
  error = null,
}) => {
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

  const rootCount = itemCounts?.['root'] ?? itemCounts?.[''] ?? 0;

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

  const requestDelete = (folderId: string): void => {
    const target = folders.find((f) => f.id === folderId);
    if (!target) return;
    const itemCount = itemCounts?.[folderId] ?? 0;
    const hasChildren = folders.some((f) => f.parentId === folderId);
    if (itemCount === 0 && !hasChildren) {
      // Empty folder — delete immediately without the modal.
      void (onDeleteFolder && onDeleteFolder(folderId, 'move-to-parent'));
      if (selectedFolderId === folderId) onSelectFolder(null);
      return;
    }
    setConfirmDelete(target);
  };

  return (
    <aside
      className="flex flex-col gap-1 w-56 shrink-0 border-r border-slate-200 bg-slate-50/60 p-2 overflow-y-auto"
      aria-label="Folders"
    >
      <header className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className="text-xs font-bold text-brand-blue-dark uppercase tracking-widest">
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
            <FolderPlus className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* Root / "All items" entry */}
      <button
        type="button"
        onClick={() => onSelectFolder(null)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold text-left transition-colors ${
          selectedFolderId === null
            ? 'bg-brand-blue-primary text-white'
            : 'text-brand-blue-dark hover:bg-white'
        }`}
      >
        <Inbox className="w-4 h-4" />
        <span className="flex-1">All items</span>
        {rootCount > 0 && (
          <span
            className={`text-xxs font-bold ${
              selectedFolderId === null
                ? 'text-white/80'
                : 'text-brand-blue-primary/60'
            }`}
          >
            {rootCount}
          </span>
        )}
      </button>

      {/* Inline new-folder at root */}
      {creatingUnder === null && (
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

      {loading && (
        <p className="text-xxs text-slate-400 italic px-2 py-1">
          Loading folders…
        </p>
      )}
      {error && (
        <p className="text-xxs text-brand-red-primary px-2 py-1">{error}</p>
      )}
      {commitError && (
        <p className="text-xxs text-brand-red-primary px-2 py-1">
          {commitError}
        </p>
      )}

      <FolderTree
        folders={folders}
        parentId={null}
        depth={0}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        expanded={expanded}
        onToggleExpanded={(id) =>
          setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
        }
        itemCounts={itemCounts}
        openMenuId={openMenuId}
        onOpenMenu={setOpenMenuId}
        renamingId={renamingId}
        onStartRename={setRenamingId}
        onCommitRename={handleRenameCommit}
        onCancelRename={() => setRenamingId(null)}
        onRequestDelete={(folder) => requestDelete(folder.id)}
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
      {creatingUnder && creatingUnder !== null && (
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

      {confirmDelete && (
        <DeleteFolderModal
          folder={confirmDelete}
          itemCount={deleteImpact.itemCount}
          subfolderCount={deleteImpact.subfolderCount}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </aside>
  );
};

const NewFolderInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onCommit, onCancel }) => {
  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
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
              Items inside are still preserved and re-homed to the parent.
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

/**
 * FolderTree — recursive folder tree renderer used inside `FolderSidebar`.
 *
 * Wave 3-B UI: renders a keyboard-navigable tree with expand/collapse per
 * branch, per-folder item counts, inline rename, and a context-menu-style
 * overflow button for Rename / Delete / Move-to-Root. The tree is pure —
 * all state (selection, expansion, rename modes) is owned by the parent
 * `FolderSidebar`, which wires up the CRUD callbacks coming from
 * `useFolders`.
 *
 * Kept separate from `FolderSidebar` so Wave 3-B can unit-test the
 * recursive rendering + expand/collapse behavior in isolation.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type { LibraryFolder } from '@/types';
import { folderDroppableId, type FolderDropData } from './folderDropTargets';
import { useFolderPanelMode } from './LibraryFolderPanelContext';

export interface FolderTreeProps {
  /** Flat folder list — the tree shape is derived from `parentId`. */
  folders: LibraryFolder[];
  /** Which subtree to render. `null` = start from root-level folders. */
  parentId?: string | null;
  /** Current depth — used for indentation. Defaults to 0 at the root. */
  depth?: number;

  /** Currently-selected folder id (`null` = root). */
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;

  /** Expand/collapse state, keyed by folder id. */
  expanded: Record<string, boolean>;
  onToggleExpanded: (folderId: string) => void;

  /** Optional item count per folder id, rendered as a trailing badge. */
  itemCounts?: Record<string, number>;

  /** Which folder id currently has its overflow menu open. */
  openMenuId: string | null;
  onOpenMenu: (folderId: string | null) => void;

  /** Which folder id is in inline-rename mode. */
  renamingId: string | null;
  onStartRename: (folderId: string) => void;
  onCommitRename: (folderId: string, nextName: string) => void;
  onCancelRename: () => void;

  /** Triggers the delete flow in the parent sidebar. */
  onRequestDelete: (folder: LibraryFolder) => void;
  /** Create a child folder under this folder. */
  onCreateChild: (parentId: string) => void;
  /** Move a folder up to the root (null parent). */
  onMoveToRoot: (folderId: string) => void;

  /**
   * When true, each folder row becomes a `useDroppable` target. Must be
   * rendered inside a `DndContext` (see `LibraryDndContext`). Drops fire via
   * the parent context's `onDropOnFolder` callback, not through this prop.
   */
  enableDrop?: boolean;
}

const INDENT_PX = 14;

/**
 * Inline rename input — one ref per render, auto-focused + selected on mount.
 */
const RenameInput: React.FC<{
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}> = ({ initial, onCommit, onCancel }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const handleBlur = () => {
    const v = ref.current?.value ?? '';
    const trimmed = v.trim();
    if (trimmed && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={initial}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v) onCommit(v);
          else onCancel();
        } else if (e.key === 'Escape') {
          onCancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 min-w-0 bg-white border border-brand-blue-primary/40 rounded px-1.5 py-0.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
    />
  );
};

interface FolderRowProps {
  folder: LibraryFolder;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isMenuOpen: boolean;
  isRenaming: boolean;
  count: number;
  enableDrop: boolean;
  onSelectFolder: (folderId: string | null) => void;
  onToggleExpanded: (folderId: string) => void;
  onOpenMenu: (folderId: string | null) => void;
  onStartRename: (folderId: string) => void;
  onCommitRename: (folderId: string, nextName: string) => void;
  onCancelRename: () => void;
  onRequestDelete: (folder: LibraryFolder) => void;
  onCreateChild: (parentId: string) => void;
  onMoveToRoot: (folderId: string) => void;
}

/**
 * Single folder row. Extracted into a component so we can call the
 * `useDroppable` hook per-row without violating the Rules of Hooks.
 */
const FolderRow: React.FC<FolderRowProps> = ({
  folder,
  depth,
  hasChildren,
  isExpanded,
  isSelected,
  isMenuOpen,
  isRenaming,
  count,
  enableDrop,
  onSelectFolder,
  onToggleExpanded,
  onOpenMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onCreateChild,
  onMoveToRoot,
}) => {
  const panelMode = useFolderPanelMode();
  const isRail = panelMode === 'rail';
  const dropData = useMemo<FolderDropData>(
    () => ({ type: 'folder', folderId: folder.id }),
    [folder.id]
  );
  const droppable = useDroppable({
    id: folderDroppableId(folder.id),
    data: dropData,
    disabled: !enableDrop,
  });
  const isOver = enableDrop && droppable.isOver;

  // Rail mode: render a single icon button per folder so the tiny rail is
  // still navigable. Nesting/rename/menu affordances are suppressed; the
  // user can expand the panel to access them.
  if (isRail) {
    return (
      <div
        ref={enableDrop ? droppable.setNodeRef : undefined}
        className={`flex items-center justify-center rounded-lg transition-colors ${
          isSelected
            ? 'bg-brand-blue-primary/15 text-brand-blue-dark'
            : 'text-slate-500 hover:bg-slate-100'
        } ${
          isOver
            ? 'ring-2 ring-brand-blue-primary/60 bg-brand-blue-lighter/40'
            : ''
        }`}
        style={{ paddingBlock: 'min(6px, 1.5cqmin)' }}
      >
        <button
          type="button"
          onClick={() => onSelectFolder(folder.id)}
          title={`${folder.name}${count > 0 ? ` (${count})` : ''}`}
          aria-label={`${folder.name}, ${count} items`}
          className="flex items-center justify-center"
          style={{
            width: 'min(32px, 9cqmin)',
            height: 'min(32px, 9cqmin)',
          }}
        >
          <Folder
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={enableDrop ? droppable.setNodeRef : undefined}
      className={`group relative flex items-center font-medium select-none rounded-lg transition-colors ${
        isSelected
          ? 'bg-brand-blue-primary/10 text-brand-blue-dark'
          : 'text-slate-700 hover:bg-slate-100'
      } ${
        isOver
          ? 'ring-2 ring-brand-blue-primary/60 bg-brand-blue-lighter/40'
          : ''
      }`}
      style={{
        paddingLeft: depth * INDENT_PX + 4,
        gap: 'min(4px, 1cqmin)',
        fontSize: 'min(13px, 4cqmin)',
      }}
    >
      {/* Expand/collapse chevron. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggleExpanded(folder.id);
        }}
        className="shrink-0 w-4 h-5 flex items-center justify-center text-slate-400"
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
        tabIndex={-1}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )
        ) : null}
      </button>

      {/* Primary select action — a real <button> wrapping the folder icon +
          name. Kept distinct from the outer container so the chevron and
          overflow menu buttons aren't nested inside another interactive
          element (HTML spec + screen-reader clarity). During inline rename
          we render the input in its place to avoid nesting an <input> inside
          a <button>, which is invalid HTML. */}
      {isRenaming ? (
        <span className="flex-1 min-w-0 flex items-center gap-1 py-1">
          <span className="shrink-0 text-brand-blue-primary/80">
            {isExpanded && hasChildren ? (
              <FolderOpen size={14} />
            ) : (
              <Folder size={14} />
            )}
          </span>
          <RenameInput
            initial={folder.name}
            onCommit={(next) => onCommitRename(folder.id, next)}
            onCancel={onCancelRename}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onSelectFolder(folder.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
              e.preventDefault();
              onToggleExpanded(folder.id);
            } else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
              e.preventDefault();
              onToggleExpanded(folder.id);
            } else if (e.key === 'F2') {
              e.preventDefault();
              onStartRename(folder.id);
            }
          }}
          className="flex-1 min-w-0 flex items-center gap-1 py-1 text-left cursor-pointer"
          aria-label={`${folder.name}, ${count} items`}
          aria-pressed={isSelected}
        >
          <span className="shrink-0 text-brand-blue-primary/80">
            {isExpanded && hasChildren ? (
              <FolderOpen size={14} />
            ) : (
              <Folder size={14} />
            )}
          </span>
          <span className="flex-1 min-w-0 truncate">{folder.name}</span>
        </button>
      )}

      {/* Item count badge. */}
      {!isRenaming && count > 0 && (
        <span
          className={`shrink-0 inline-flex items-center justify-center rounded-full font-bold leading-none ${
            isSelected
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

      {/* Overflow menu trigger. */}
      {!isRenaming && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(isMenuOpen ? null : folder.id);
          }}
          aria-label={`Actions for ${folder.name}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          className={`shrink-0 p-1 rounded-md text-slate-400 hover:text-brand-blue-dark hover:bg-white/60 ${
            isMenuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
          tabIndex={-1}
        >
          <MoreHorizontal size={14} />
        </button>
      )}

      {/* Overflow menu popover. */}
      {isMenuOpen && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-full mt-1 z-20 min-w-[160px] rounded-xl bg-white shadow-xl border border-slate-200 p-1 text-sm"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700"
            onClick={() => {
              onOpenMenu(null);
              onStartRename(folder.id);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700"
            onClick={() => {
              onOpenMenu(null);
              onCreateChild(folder.id);
            }}
          >
            New subfolder
          </button>
          {folder.parentId != null && (
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700"
              onClick={() => {
                onOpenMenu(null);
                onMoveToRoot(folder.id);
              }}
            >
              Move to root
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-brand-red-lighter/40 text-brand-red-dark"
            onClick={() => {
              onOpenMenu(null);
              onRequestDelete(folder);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  parentId = null,
  depth = 0,
  selectedFolderId,
  onSelectFolder,
  expanded,
  onToggleExpanded,
  itemCounts,
  openMenuId,
  onOpenMenu,
  renamingId,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onCreateChild,
  onMoveToRoot,
  enableDrop = false,
}) => {
  // Group children by parentId once per render. Sorted input is expected
  // (the hook orders by `order` asc); still, sort defensively.
  const children = useMemo(
    () =>
      folders
        .filter((f) => (f.parentId ?? null) === parentId)
        .sort((a, b) => a.order - b.order),
    [folders, parentId]
  );

  if (children.length === 0) return null;

  return (
    <ul role="group" className="flex flex-col">
      {children.map((folder) => {
        const hasChildren = folders.some((f) => f.parentId === folder.id);
        const isExpanded = expanded[folder.id] ?? true;
        const isSelected = selectedFolderId === folder.id;
        const isMenuOpen = openMenuId === folder.id;
        const isRenaming = renamingId === folder.id;
        const count = itemCounts?.[folder.id] ?? 0;

        return (
          <li key={folder.id} role="treeitem" aria-expanded={isExpanded}>
            <FolderRow
              folder={folder}
              depth={depth}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              isSelected={isSelected}
              isMenuOpen={isMenuOpen}
              isRenaming={isRenaming}
              count={count}
              enableDrop={enableDrop}
              onSelectFolder={onSelectFolder}
              onToggleExpanded={onToggleExpanded}
              onOpenMenu={onOpenMenu}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onRequestDelete={onRequestDelete}
              onCreateChild={onCreateChild}
              onMoveToRoot={onMoveToRoot}
            />
            {/* Recurse into children when expanded. */}
            {isExpanded && hasChildren && (
              <FolderTree
                folders={folders}
                parentId={folder.id}
                depth={depth + 1}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
                expanded={expanded}
                onToggleExpanded={onToggleExpanded}
                itemCounts={itemCounts}
                openMenuId={openMenuId}
                onOpenMenu={onOpenMenu}
                renamingId={renamingId}
                onStartRename={onStartRename}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onRequestDelete={onRequestDelete}
                onCreateChild={onCreateChild}
                onMoveToRoot={onMoveToRoot}
                enableDrop={enableDrop}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default FolderTree;

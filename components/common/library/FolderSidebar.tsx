/**
 * FolderSidebar — left-rail folder navigation for library-style widgets.
 *
 * **STUB ONLY (Wave 3-A).** This component accepts the final prop shape
 * but renders nothing. Wave 3-B ships the real tree + selection UI on
 * top of this contract. The prop surface is defined here so Wave 3-A's
 * type shape + PR review can lock the API before UI work lands.
 *
 * Intended slot: `LibraryShellProps.filterSidebarSlot` (already reserved
 * by the Wave 1 primitives for exactly this use case).
 */

import React from 'react';
import type { LibraryFolder, LibraryFolderWidget } from '@/types';

export interface FolderSidebarProps {
  /** Which widget's folder tree to render. */
  widget: LibraryFolderWidget;
  /** Flat list of folders — the component builds the tree client-side. */
  folders: LibraryFolder[];
  /**
   * Currently-selected folder id. `null` = root ("All items"). Used by
   * the library view to filter items by `folderId`.
   */
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;

  /** Count of items at each folder id (for "(N)" badges). Null key = root. */
  itemCounts?: Record<string, number>;

  /** Create/Rename/Move/Delete handlers — delegated to `useFolders`. */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<string>;
  onRenameFolder?: (folderId: string, nextName: string) => Promise<void>;
  onDeleteFolder?: (folderId: string) => Promise<void>;
  onMoveFolder?: (
    folderId: string,
    nextParentId: string | null
  ) => Promise<void>;

  /** Optional initial loading state (e.g. while the snapshot is in-flight). */
  loading?: boolean;
  /** Optional error string to surface inline. */
  error?: string | null;
}

/**
 * Placeholder render. Intentionally returns null so the sidebar slot
 * collapses to zero width before Wave 3-B fills it in.
 */
export const FolderSidebar: React.FC<FolderSidebarProps> = () => {
  /* TODO: Wave 3-B — render folder tree, selection, and CRUD affordances. */
  return null;
};

export default FolderSidebar;

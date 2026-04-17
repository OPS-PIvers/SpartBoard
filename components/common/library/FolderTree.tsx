/**
 * FolderTree — recursive folder tree renderer used inside `FolderSidebar`.
 *
 * **STUB ONLY (Wave 3-A).** This component defines the tree-level props
 * that the Wave 3-B implementation will consume. It renders nothing for
 * now so the module can be imported without visual side effects.
 *
 * Kept separate from `FolderSidebar` so Wave 3-B can unit-test the
 * recursive rendering + expand/collapse behavior in isolation.
 */

import React from 'react';
import type { LibraryFolder } from '@/types';

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
  expanded?: Record<string, boolean>;
  onToggleExpanded?: (folderId: string) => void;

  /** Optional item count per folder id, rendered as a trailing badge. */
  itemCounts?: Record<string, number>;

  /** Rename + delete handlers — omit to render a read-only tree. */
  onRenameFolder?: (folderId: string, nextName: string) => Promise<void>;
  onDeleteFolder?: (folderId: string) => Promise<void>;
  onMoveFolder?: (
    folderId: string,
    nextParentId: string | null
  ) => Promise<void>;
}

/**
 * Placeholder render. Wave 3-B will build the recursive tree + drag
 * handles here.
 */
export const FolderTree: React.FC<FolderTreeProps> = () => {
  /* TODO: Wave 3-B — render recursive folder rows with expand/collapse. */
  return null;
};

export default FolderTree;

import { createContext, useContext } from 'react';
import type { LibraryFolder } from '@/types';
import type {
  FolderDropHint,
  FolderIndex,
  FolderTotals,
  ItemNoun,
  LibraryLocation,
} from './folderView';

/** Dragging folder rows to reorder them among the open folder's subfolders. */
export interface FolderRowReorder {
  draggingId: string | null;
  hint: FolderDropHint | null;
  start: (folderId: string) => void;
  over: (hint: FolderDropHint) => void;
  leave: (folderId: string) => void;
  drop: () => void;
  end: () => void;
}

export interface LibraryFolderRow {
  folder: LibraryFolder;
  label: string;
}

/** Everything the shell, grid, cards and sidebar need to render the folder view. */
export interface LibraryFolderViewModel {
  location: LibraryLocation;
  navigate: (location: LibraryLocation) => void;
  index: FolderIndex;
  totals: Map<string, FolderTotals>;
  folderRows: LibraryFolderRow[];
  itemNoun: ItemNoun;
  searchActive: boolean;
  searchScope: 'folder' | 'all';
  setSearchScope: (scope: 'folder' | 'all') => void;
  /** Folder path label per item id, for rows shown outside their own folder (D4, D5). */
  pathByItemId: Map<string, string>;
  /** Effective folder of any item in the library, for drag moves and Undo. */
  folderIdOf: (itemId: string) => string | null;
  /** True when an open folder has no subfolders and no items. */
  emptyFolder: boolean;
  /** Null when folder rows can't be dragged to reorder. */
  folderReorder: FolderRowReorder | null;
}

export const LibraryFolderViewContext =
  createContext<LibraryFolderViewModel | null>(null);

export const useLibraryFolderView = (): LibraryFolderViewModel | null =>
  useContext(LibraryFolderViewContext);

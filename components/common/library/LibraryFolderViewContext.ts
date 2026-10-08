import { createContext, useContext } from 'react';
import type { LibraryFolder } from '@/types';
import type {
  FolderIndex,
  FolderTotals,
  ItemNoun,
  LibraryLocation,
} from './folderView';

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
  /** True when an open folder has no subfolders and no items. */
  emptyFolder: boolean;
}

export const LibraryFolderViewContext =
  createContext<LibraryFolderViewModel | null>(null);

export const useLibraryFolderView = (): LibraryFolderViewModel | null =>
  useContext(LibraryFolderViewContext);

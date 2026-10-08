import { createContext, useContext } from 'react';

/** Live drag state that `LibraryDndContext` shares with cards and folder rows (D13, D14). */
export interface LibraryDragState {
  /** True when the folder view's drag additions are on. */
  enabled: boolean;
  /** Items travelling with the active drag (the selection, or just the dragged item). */
  draggingIds: ReadonlySet<string>;
  /** Item that a held drag will turn into a new folder on drop. */
  armedItemId: string | null;
  /** Folder whose name field opens focused after a drag-created folder. */
  renamingFolderId: string | null;
  finishRename: (folderId: string, name: string | null) => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const LibraryDragContext = createContext<LibraryDragState>({
  enabled: false,
  draggingIds: EMPTY,
  armedItemId: null,
  renamingFolderId: null,
  finishRename: () => undefined,
});

export const useLibraryDrag = (): LibraryDragState =>
  useContext(LibraryDragContext);

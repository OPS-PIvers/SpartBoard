/**
 * folderDropTargets — shared helpers + types for folder drag/drop wiring.
 *
 * Extracted out of `LibraryDndContext.tsx` so the context file exports only a
 * React component (required by the `react-refresh/only-export-components`
 * lint rule to keep Fast Refresh happy in dev).
 */

/** Data attached to folder droppables via `useDroppable({ data: {...} })`. */
export interface FolderDropData {
  type: 'folder';
  /** `null` means the "All items" root drop zone. */
  folderId: string | null;
}

/**
 * Droppable id prefix for folder drop targets. Prefixing keeps folder ids
 * from ever colliding with sortable card ids in the same DndContext.
 */
export const FOLDER_DROPPABLE_PREFIX = 'folder:';

/** Build the droppable id for a given folder (null = root). */
export const folderDroppableId = (folderId: string | null): string =>
  `${FOLDER_DROPPABLE_PREFIX}${folderId ?? 'root'}`;

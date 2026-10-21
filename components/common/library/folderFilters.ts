/**
 * Pure helpers for the per-widget folder navigation introduced in Wave 3-B-3.
 *
 * The four widget Managers (Quiz, VideoActivity, GuidedLearning, MiniApp) all
 * filter their library items by a selected folder and bucket counts for the
 * sidebar badges the same way. Keeping the logic here makes it trivial to test
 * and guarantees the four call sites stay in sync.
 *
 * Conventions:
 *   - `folderId: null | undefined` means the item is at the personal root.
 *   - `selectedFolderId === null` means "no folder selected" (show everything
 *     the caller passed in).
 *   - The count bucket for root items is keyed under `ROOT_FOLDER_COUNT_KEY`.
 */

export const ROOT_FOLDER_COUNT_KEY = 'root';

/** Minimum shape required for folder-based filtering / counting. */
export interface HasFolderId {
  folderId?: string | null;
}

/**
 * Buckets `items` by `folderId`, using `ROOT_FOLDER_COUNT_KEY` for items
 * without one. The returned shape matches what `FolderSidebar` expects for its
 * badge counts.
 */
export function countItemsByFolder<T extends HasFolderId>(
  items: T[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.folderId ?? ROOT_FOLDER_COUNT_KEY;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

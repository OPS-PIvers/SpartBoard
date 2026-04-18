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

/** Minimum shape for GuidedLearning-style entries that mix sources. */
export interface HasFolderIdAndSource extends HasFolderId {
  source: 'personal' | 'building';
}

/**
 * Returns only the items whose `folderId` matches `selectedFolderId`. When
 * `selectedFolderId` is `null` the caller hasn't picked a folder, so the full
 * input list is returned unchanged.
 */
export function filterByFolder<T extends HasFolderId>(
  items: T[],
  selectedFolderId: string | null
): T[] {
  if (selectedFolderId === null) return items;
  return items.filter((item) => (item.folderId ?? null) === selectedFolderId);
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

/**
 * GuidedLearning-style filter: folder selection only narrows the personal
 * subset. Building entries are always retained so the toolbar's Source filter
 * can still show a non-empty list when the teacher switches to "Building".
 */
export function filterSourcedEntriesByFolder<T extends HasFolderIdAndSource>(
  entries: T[],
  selectedFolderId: string | null
): T[] {
  if (selectedFolderId === null) return entries;
  return entries.filter(
    (e) =>
      e.source === 'building' ||
      (e.source === 'personal' && (e.folderId ?? null) === selectedFolderId)
  );
}

import { ROOT_COLLECTION_KEY } from '@/types';
import type { Collection, Dashboard } from '@/types';

/**
 * Choose which Board to load on app open. Honors per-Collection navigation
 * memory (`lastActiveCollectionId` + `lastBoardIdByCollection`) populated by
 * `loadDashboard` in Plan 1, with progressively weaker fallbacks so a
 * partially-populated profile (or a Board that no longer exists) still
 * lands on a sensible default.
 *
 * Fallback chain:
 *   1. `lastBoardIdByCollection[lastActiveCollectionId]` if that Board still
 *      exists AND still belongs to that Collection.
 *   2. The active Collection's `defaultBoardId` if set and present.
 *   3. The first Board in the active Collection (sorted by existing `order`).
 *   4. The first Board with `isDefault === true` globally.
 *   5. The first Board in the global list (last-resort).
 *   6. `null` if `dashboards` is empty.
 *
 * Pure function — all inputs are passed explicitly so this can be tested
 * without React or Firestore. `lastActiveCollectionId === null` means
 * "the user was last in the root (no Collection)". A `lastActiveCollectionId`
 * of `undefined` indicates the profile hasn't been read yet; callers SHOULD
 * defer the call until the profile loads. As a defensive fallback (in case a
 * caller forgets), we still return a sensible Board — the global default or
 * the first Board in the list — rather than throwing.
 */
export const pickInitialBoard = (
  dashboards: Dashboard[],
  lastActiveCollectionId: string | null | undefined,
  lastBoardIdByCollection: Record<string, string> | undefined,
  collections: Collection[]
): Dashboard | null => {
  if (dashboards.length === 0) return null;
  // Caller should never invoke this with `undefined` lastActiveCollectionId;
  // it indicates profile-not-yet-loaded. Treat as "no memory yet" and fall
  // through to global defaults so we don't crash if a caller forgets.
  if (lastActiveCollectionId === undefined) {
    return (
      dashboards.find((d) => d.isDefault === true) ?? dashboards[0] ?? null
    );
  }

  const targetCollectionId = lastActiveCollectionId;
  const collectionKey = targetCollectionId ?? ROOT_COLLECTION_KEY;
  const rememberedBoardId = lastBoardIdByCollection?.[collectionKey];

  if (rememberedBoardId) {
    const remembered = dashboards.find((d) => d.id === rememberedBoardId);
    if (
      remembered &&
      (remembered.collectionId ?? null) === targetCollectionId
    ) {
      return remembered;
    }
  }

  if (targetCollectionId !== null) {
    const targetCollection = collections.find(
      (c) => c.id === targetCollectionId
    );
    if (targetCollection?.defaultBoardId) {
      const collectionDefault = dashboards.find(
        (d) =>
          d.id === targetCollection.defaultBoardId &&
          (d.collectionId ?? null) === targetCollectionId
      );
      if (collectionDefault) return collectionDefault;
    }
  }

  const inCollection = dashboards
    .filter((d) => (d.collectionId ?? null) === targetCollectionId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (inCollection.length > 0) return inCollection[0];

  return dashboards.find((d) => d.isDefault === true) ?? dashboards[0] ?? null;
};

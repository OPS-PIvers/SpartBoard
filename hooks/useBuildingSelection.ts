import { useState } from 'react';
import type { Building } from '@/config/buildings';

/**
 * Returns a `[selectedId, setSelectedId]` tuple scoped to the admin-configurable
 * building list. Auto-recovers when `buildings` transitions (seed fallback →
 * Firestore load, an org admin renaming/archiving a building, or an org
 * membership revoke mid-session dropping the list to empty) and the
 * currently selected id is no longer in the list: on the next render it
 * snaps forward to the first available building, or clears to `''` when
 * the list is empty.
 *
 * Uses the React "adjusting state while rendering" pattern so consumers never
 * render one frame with a stale id that doesn't match any tab.
 */
export function useBuildingSelection(
  buildings: readonly Building[]
): [string, (id: string) => void] {
  const first = buildings[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState<string>(first);

  const hasMatch = buildings.some((b) => b.id === selectedId);
  // Reset even to '' when `buildings` goes empty — a stale id that used to
  // match can never match again once the list is empty, and would otherwise
  // stick forever with no way for the user to reselect out of it.
  if (!hasMatch && selectedId !== first) {
    setSelectedId(first);
  }

  return [selectedId, setSelectedId];
}

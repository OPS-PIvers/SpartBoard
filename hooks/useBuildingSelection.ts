import { useState } from 'react';
import type { Building } from '@/config/buildings';

/**
 * Returns a `[selectedId, setSelectedId]` tuple scoped to the admin-configurable
 * building list. Auto-recovers when `buildings` transitions (seed fallback →
 * Firestore load, or an org admin renaming/archiving a building) and the
 * currently selected id is no longer in the list: on the next render it
 * snaps forward to the first available building.
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
  if (!hasMatch && first && selectedId !== first) {
    setSelectedId(first);
  }

  return [selectedId, setSelectedId];
}

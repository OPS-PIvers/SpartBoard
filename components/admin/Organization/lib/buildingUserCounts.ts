import { canonicalBuildingId } from '@/config/buildings';
import type { BuildingRecord, UserRecord } from '@/types/organization';

/**
 * Derives per-building user counts from the live members list. `inactive`
 * members are excluded so the count reflects "who can actually use the
 * building today" rather than historical assignments.
 *
 * The caller still receives a list of `BuildingRecord` with the denormalized
 * `users` field overwritten by the derived count, so the view can render
 * without needing to know how the number was produced.
 */
export function withDerivedUserCounts(
  buildings: BuildingRecord[],
  users: Pick<UserRecord, 'status' | 'buildingIds'>[]
): BuildingRecord[] {
  // Canonicalize both sides so a legacy stored buildingId (e.g. `orono-high-school`) counts against its canonical building (`high`).
  const counts = new Map<string, number>();
  for (const u of users) {
    if (u.status === 'inactive') continue;
    for (const bid of u.buildingIds) {
      const id = canonicalBuildingId(bid);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return buildings.map((b) => ({
    ...b,
    users: counts.get(canonicalBuildingId(b.id)) ?? 0,
  }));
}

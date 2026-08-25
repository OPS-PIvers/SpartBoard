import { canonicalizeBuildingIds } from '@/config/buildings';
import type { ActorRole, BuildingRecord } from '@/types/organization';

// Canonicalizes a building_admin's memberBuildingIds so a legacy long-form ID (e.g. `orono-high-school`) still matches canonical BuildingRecord ids.
export function resolveActorBuildingIds(
  actorRole: ActorRole,
  memberBuildingIds: string[],
  buildings: Pick<BuildingRecord, 'id'>[]
): string[] {
  if (actorRole === 'building_admin') {
    return canonicalizeBuildingIds(memberBuildingIds);
  }
  return buildings.map((b) => b.id);
}

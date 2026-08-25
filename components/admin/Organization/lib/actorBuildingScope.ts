import { canonicalizeBuildingIds } from '@/config/buildings';
import type { ActorRole, BuildingRecord } from '@/types/organization';

/**
 * Derives the building IDs a building_admin actor is scoped to, from their
 * member doc's `buildingIds`. Canonicalizes first — like `withDerivedUserCounts`,
 * a member doc can still carry a legacy long-form ID (e.g. `orono-high-school`)
 * predating the Organization admin panel, which would never match the canonical
 * `BuildingRecord`/`UserRecord` IDs (`high`) it's compared against downstream
 * (BuildingsView's `canEdit`, UsersView's `isInScope`/`filtered`), silently
 * hiding a building admin's own building and members.
 */
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

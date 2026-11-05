import type { ActorRole, RoleId, UserRecord } from '@/types/organization';

// Roles whose role or status the rules refuse this actor changing (one refusal fails a whole batch).
export function protectedRolesFor(actorRole: ActorRole): readonly RoleId[] {
  if (actorRole === 'super_admin') return [];
  if (actorRole === 'building_admin') return ['super_admin', 'domain_admin'];
  return ['super_admin'];
}

/** Drops the ids of members this actor may not change. */
export function withoutProtectedMembers(
  ids: string[],
  users: readonly UserRecord[],
  actorRole: ActorRole
): string[] {
  const roles = protectedRolesFor(actorRole);
  if (roles.length === 0) return ids;
  return ids.filter((id) => {
    const role = users.find((u) => u.id === id)?.role;
    return role === undefined || !roles.includes(role);
  });
}

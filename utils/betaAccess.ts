/**
 * Shared beta-access check for `FeaturePermission.accessLevel === 'beta'`.
 *
 * Single source of truth so every consumer (AuthContext.canAccessWidget /
 * canAccessFeature, DashboardContext.getDefaultDockTools) grants beta access
 * identically. A user is a beta user if their (case-insensitively compared)
 * email appears in the permission's own `betaUsers` list, OR in the account-
 * wide `userRoles.betaTeachers` / `userRoles.superAdmins` lists, OR they hold
 * the `super_admin` role.
 */
import type { UserRolesConfig } from '@/types';

export function isBetaUser(
  betaUsers: string[],
  email: string | null | undefined,
  userRoles?: UserRolesConfig | null,
  roleId?: string | null
): boolean {
  const lowerEmail = email?.toLowerCase() ?? '';
  return (
    betaUsers.some((e) => e.toLowerCase() === lowerEmail) ||
    (userRoles?.betaTeachers?.some((e) => e.toLowerCase() === lowerEmail) ??
      false) ||
    (userRoles?.superAdmins?.some((e) => e.toLowerCase() === lowerEmail) ??
      false) ||
    roleId === 'super_admin'
  );
}

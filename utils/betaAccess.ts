// Single source of truth for beta-widget access — shared by AuthContext and DashboardContext.
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

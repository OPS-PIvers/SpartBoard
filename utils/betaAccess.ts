// Single source of truth for beta-widget access — shared by AuthContext and DashboardContext.
import type { UserRolesConfig } from '@/types';

export function isBetaUser(
  betaUsers: string[],
  email: string | null | undefined,
  userRoles?: UserRolesConfig | null,
  roleId?: string | null
): boolean {
  if (roleId === 'super_admin') return true;
  // No email means no email-based source can legitimately match.
  const lowerEmail = email?.toLowerCase();
  if (!lowerEmail) return false;
  return (
    betaUsers.some((e) => e.toLowerCase() === lowerEmail) ||
    (userRoles?.betaTeachers?.some((e) => e.toLowerCase() === lowerEmail) ??
      false)
  );
}

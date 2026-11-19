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

/** An exclude list beats every other rule, including admin and super admin. */
export function isExcludedUser(
  excludedUsers: readonly string[] | undefined,
  email: string | null | undefined
): boolean {
  const lowerEmail = email?.toLowerCase();
  if (!lowerEmail || !excludedUsers) return false;
  return excludedUsers.some(
    (e) => typeof e === 'string' && e.toLowerCase() === lowerEmail
  );
}

/** Puts the caller's own beta and exclude grants back onto a stripped public permission. */
export function withOwnGrants<T extends { betaUsers: string[] }>(
  permission: T,
  id: string,
  betaIds: readonly string[],
  excludedIds: readonly string[],
  email: string
): T & { excludedUsers?: string[] } {
  const beta = betaIds.includes(id);
  const excluded = excludedIds.includes(id);
  if (!beta && !excluded) return permission;
  return {
    ...permission,
    ...(beta ? { betaUsers: [email] } : {}),
    ...(excluded ? { excludedUsers: [email] } : {}),
  };
}

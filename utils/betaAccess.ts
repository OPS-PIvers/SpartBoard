// Single source of truth for beta-widget access — shared by AuthContext and DashboardContext.
import type { UserRolesConfig } from '@/types';

export function isBetaUser(
  betaUsers: string[],
  email: string | null | undefined,
  userRoles?: UserRolesConfig | null,
  roleId?: string | null
): boolean {
  if (roleId === 'super_admin') return true;
  // No email means no email-based source can legitimately match — without this
  // guard a blank line in an admin-edited list (betaUsers/betaTeachers/
  // superAdmins, e.g. a trailing newline saved straight to Firestore) becomes
  // an empty-string entry, and `''.toLowerCase() === lowerEmail` would match a
  // null/undefined caller's email, granting beta access with no email at all.
  const lowerEmail = email?.toLowerCase();
  if (!lowerEmail) return false;
  return (
    betaUsers.some((e) => e.toLowerCase() === lowerEmail) ||
    (userRoles?.betaTeachers?.some((e) => e.toLowerCase() === lowerEmail) ??
      false) ||
    // LO2 harmonization: legacy admin_settings/user_roles.superAdmins[] is kept as an accepted source alongside roleId==='super_admin' until a Paul-gated migration retires it.
    (userRoles?.superAdmins?.some((e) => e.toLowerCase() === lowerEmail) ??
      false)
  );
}

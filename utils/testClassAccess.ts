import { UserRolesConfig } from '@/types';

/**
 * Whether the actor can read `/organizations/{orgId}/testClasses`. Mirrors the
 * role gate Firestore rules enforce at `firestore.rules:345`. Kept in one
 * place so the sidebar hook and the ClassLink import dialog stay in lock-step
 * with the rule.
 */
export const canReadTestClasses = (
  orgId: string | null | undefined,
  roleId: string | null | undefined,
  userRoles: UserRolesConfig | null | undefined,
  userEmail: string | null | undefined
): boolean => {
  if (!orgId || !orgId.trim()) return false;
  const isSuperAdminByEmail = Boolean(
    userEmail &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === userEmail.toLowerCase()
    )
  );
  return (
    isSuperAdminByEmail || roleId === 'super_admin' || roleId === 'domain_admin'
  );
};

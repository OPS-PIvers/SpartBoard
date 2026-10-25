import { OPERATOR_ORG_ID } from '@/config/organization';

/**
 * Client mirror of `firestore.rules` isSuperAdmin(): the legacy
 * `admin_settings/user_roles.superAdmins[]` list OR an operator-org member doc
 * with `roleId === 'super_admin'`. Any UI that gates on super-admin status must
 * use this, or it offers writes the rules will refuse.
 *
 * `memberOrgId` is required because isMemberSuperAdmin() reads
 * `organizations/orono/members/{email}` by fixed path — a `super_admin` roleId
 * in any other org is meaningless server-side.
 */
export const isSuperAdminActor = (
  email: string | null | undefined,
  superAdmins: readonly string[] | null | undefined,
  memberRoleId: string | null | undefined,
  memberOrgId: string | null | undefined
): boolean => {
  // Both rules branches sit behind an email claim, so mirror that first.
  if (!email) return false;
  if (memberRoleId === 'super_admin' && memberOrgId === OPERATOR_ORG_ID)
    return true;
  const lower = email.toLowerCase();
  return (superAdmins ?? []).some((entry) => entry.toLowerCase() === lower);
};

const ORG_ADMIN_ROLE_IDS: readonly string[] = [
  'super_admin',
  'domain_admin',
  'building_admin',
];

// An admin of their own org without an /admins doc: Admin Settings shows them only the Organization tab.
export const isOrgOnlyAdmin = (
  isAdmin: boolean | null,
  memberRoleId: string | null | undefined,
  memberOrgId: string | null | undefined
): boolean =>
  isAdmin === false &&
  !!memberOrgId &&
  !!memberRoleId &&
  ORG_ADMIN_ROLE_IDS.includes(memberRoleId);

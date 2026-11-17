/**
 * Whether the actor can read `/organizations/{orgId}/testClasses`. Mirrors the
 * role gate Firestore rules enforce. Kept in one place so the sidebar hook and
 * the ClassLink import dialog stay in lock-step with the rule.
 */
export const canReadTestClasses = (
  orgId: string | null | undefined,
  roleId: string | null | undefined
): boolean => {
  if (!orgId || !orgId.trim()) return false;
  return roleId === 'super_admin' || roleId === 'domain_admin';
};

import type * as admin from 'firebase-admin';

/**
 * `/admins/{emailLower}` existence is NOT proof of site-wide super-admin
 * authority. `organizationMembersSync.ts` mirrors `building_admin` (alongside
 * `super_admin`/`domain_admin`) into that same collection so building admins
 * can read the members list — see its `ADMIN_ROLES`. A doc written by that
 * sync carries the mirrored `roleId`; a legacy, hand-created doc (pre-dating
 * the sync) carries none and is always a true super admin.
 */
export function isSuperAdminRoleId(roleId: unknown): boolean {
  if (typeof roleId !== 'string') return true; // legacy doc, no mirror marker
  return roleId === 'super_admin' || roleId === 'domain_admin';
}

/** True only for a genuine site-wide super/domain admin — see `isSuperAdminRoleId`. */
export async function isSiteSuperAdmin(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<boolean> {
  const snap = await db.collection('admins').doc(emailLower).get();
  return snap.exists && isSuperAdminRoleId(snap.get('roleId'));
}

import type * as admin from 'firebase-admin';

/** `/admins/{email}` also mirrors building_admin (org-scoped) — bare doc existence isn't proof of super-admin; a missing roleId means a legacy pre-sync doc. */
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

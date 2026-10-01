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

// Operator org: the fixed path the rules' isMemberSuperAdmin() reads.
export const OPERATOR_ORG_ID = 'orono';

/** Role ids the strict gate admits; domain_admin and a missing roleId are deliberately out. */
export const STRICT_SUPER_ADMIN_ROLE_IDS: readonly string[] = ['super_admin'];

/** Strict super admin, mirroring the rules' isSuperAdmin(): operator-org member roleId or legacy user_roles list. */
export async function isStrictSuperAdmin(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<boolean> {
  const [operatorSnap, legacySnap] = await Promise.all([
    db.doc(`organizations/${OPERATOR_ORG_ID}/members/${emailLower}`).get(),
    db.doc('admin_settings/user_roles').get(),
  ]);
  if (operatorSnap.exists) {
    const roleId: unknown = operatorSnap.get('roleId');
    if (
      typeof roleId === 'string' &&
      STRICT_SUPER_ADMIN_ROLE_IDS.includes(roleId)
    ) {
      return true;
    }
  }
  if (!legacySnap.exists) return false;
  const legacy: unknown = legacySnap.get('superAdmins');
  return Array.isArray(legacy) && legacy.includes(emailLower);
}

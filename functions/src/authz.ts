import type * as admin from './firebaseAdmin';

/** `/admins/{email}` also mirrors building_admin (org-scoped) — bare doc existence isn't proof of super-admin; a missing roleId means a legacy pre-sync doc. */
export function isSuperAdminRoleId(roleId: unknown, orgId?: unknown): boolean {
  if (typeof roleId !== 'string') return true; // legacy doc, no mirror marker
  // A role mirrored from any org but the operator's is scoped to that org, never site-wide.
  if (typeof orgId === 'string' && orgId !== OPERATOR_ORG_ID) return false;
  return roleId === 'super_admin' || roleId === 'domain_admin';
}

/** Site-wide check for an existing /admins doc: a mirror stamped with another org falls back to the operator-org member doc. */
export async function isSiteWideAdmin(
  db: admin.firestore.Firestore,
  emailLower: string,
  roleId: unknown,
  orgId: unknown
): Promise<boolean> {
  if (isSuperAdminRoleId(roleId, orgId)) return true;
  if (typeof orgId !== 'string' || orgId === OPERATOR_ORG_ID) return false;
  const snap = await db
    .doc(`organizations/${OPERATOR_ORG_ID}/members/${emailLower}`)
    .get();
  const data = snap.exists
    ? (snap.data() as { roleId?: unknown; status?: unknown } | undefined)
    : undefined;
  return (
    (data?.roleId === 'super_admin' || data?.roleId === 'domain_admin') &&
    data.status === 'active'
  );
}

/** True only for a genuine site-wide super/domain admin — see `isSiteWideAdmin`. */
export async function isSiteSuperAdmin(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<boolean> {
  const snap = await db.collection('admins').doc(emailLower).get();
  return (
    snap.exists &&
    (await isSiteWideAdmin(
      db,
      emailLower,
      snap.get('roleId'),
      snap.get('orgId')
    ))
  );
}

/** A deactivated member keeps their roleId, so every org-admin gate must also reject this status. */
export function isRevokedMemberStatus(status: unknown): boolean {
  return status === 'inactive' || status === 'removed';
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

import type * as admin from './firebaseAdmin';

/** `/admins/{email}` also mirrors building_admin (org-scoped) — bare doc existence isn't proof of super-admin; a missing roleId means a legacy pre-sync doc. */
export function isSuperAdminRoleId(roleId: unknown, orgId?: unknown): boolean {
  if (typeof roleId !== 'string') return true; // legacy doc, no mirror marker
  // A role mirrored from any org but the operator's is scoped to that org, never site-wide.
  if (typeof orgId === 'string' && orgId !== OPERATOR_ORG_ID) return false;
  return roleId === 'super_admin' || roleId === 'domain_admin';
}

/** Site-wide check for an existing /admins doc: a mirror stamped with another org falls back to the operator-org member doc, and a deactivated operator-org member never passes. */
export async function isSiteWideAdmin(
  db: admin.firestore.Firestore,
  emailLower: string,
  roleId: unknown,
  orgId: unknown
): Promise<boolean> {
  const snap = await db
    .doc(`organizations/${OPERATOR_ORG_ID}/members/${emailLower}`)
    .get();
  const data = snap.exists
    ? (snap.data() as { roleId?: unknown; status?: unknown } | undefined)
    : undefined;
  if (data && isRevokedMemberStatus(data.status)) return false;
  if (isSuperAdminRoleId(roleId, orgId)) return true;
  if (typeof orgId !== 'string' || orgId === OPERATOR_ORG_ID) return false;
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

/** A deactivated member keeps their roleId; like the rules' liveStatus(), anything but active, invited or missing revokes. */
export function isRevokedMemberStatus(status: unknown): boolean {
  return status !== undefined && status !== 'active' && status !== 'invited';
}

// Operator org: the fixed path the rules' isMemberSuperAdmin() reads.
export const OPERATOR_ORG_ID = 'orono';

/** Role ids the strict gate admits; domain_admin and a missing roleId are deliberately out. */
export const STRICT_SUPER_ADMIN_ROLE_IDS: readonly string[] = ['super_admin'];

/** Strict super admin, mirroring the rules' isMemberSuperAdmin(): an active operator-org super_admin member. */
export async function isStrictSuperAdmin(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<boolean> {
  const operatorSnap = await db
    .doc(`organizations/${OPERATOR_ORG_ID}/members/${emailLower}`)
    .get();
  return isStrictSuperAdminData(
    operatorSnap.exists
      ? {
          roleId: operatorSnap.get('roleId') as unknown,
          status: operatorSnap.get('status') as unknown,
        }
      : undefined
  );
}

/** isStrictSuperAdmin over an operator-org member doc the caller already read (e.g. inside a transaction). */
export function isStrictSuperAdminData(
  operator: Record<string, unknown> | undefined
): boolean {
  if (!operator) return false;
  const roleId = operator.roleId;
  const status = operator.status;
  return (
    typeof roleId === 'string' &&
    STRICT_SUPER_ADMIN_ROLE_IDS.includes(roleId) &&
    (status === undefined || status === 'active')
  );
}

/** Custom claim set on a deactivated operator-org member's Auth account, so the uid stays revoked whatever its email claim. */
export const DEACTIVATED_CLAIM = 'deactivated';

/** True when an ID token carries the deactivation claim. */
export function hasDeactivatedClaim(token: unknown): boolean {
  return (
    !!token &&
    typeof token === 'object' &&
    (token as Record<string, unknown>)[DEACTIVATED_CLAIM] === true
  );
}

/** As the rules' notDeactivated() for an email: true only for an operator-org member doc whose status revokes access. */
export async function isDeactivatedOperatorMember(
  db: admin.firestore.Firestore,
  email: string
): Promise<boolean> {
  const member = await db
    .collection(`organizations/${OPERATOR_ORG_ID}/members`)
    .doc(email.toLowerCase())
    .get();
  return member.exists && isRevokedMemberStatus(member.get('status'));
}

/** As the rules' notDeactivated() for a caller: no deactivation claim and no revoked operator-org member doc. */
export async function isLiveCaller(
  db: admin.firestore.Firestore,
  token: unknown
): Promise<boolean> {
  if (hasDeactivatedClaim(token)) return false;
  const email =
    token && typeof token === 'object'
      ? (token as Record<string, unknown>).email
      : undefined;
  return (
    typeof email !== 'string' ||
    email.trim() === '' ||
    !(await isDeactivatedOperatorMember(db, email.trim()))
  );
}

/** As the rules' isAdmin() on the server: an /admins doc whose holder is not a deactivated operator-org member. */
export async function isLiveAdmin(
  db: admin.firestore.Firestore,
  email: string
): Promise<boolean> {
  const lower = email.trim().toLowerCase();
  if (!lower || !(await db.collection('admins').doc(lower).get()).exists)
    return false;
  return !(await isDeactivatedOperatorMember(db, lower));
}

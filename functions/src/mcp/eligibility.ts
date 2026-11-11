// Who may connect Claude (CC-D5) and whether the connector gate is open (CC-D7).
import type * as admin from '../firebaseAdmin';
import {
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from '../classlinkShared';
import { CONNECTOR_FEATURE_ID } from './config';
import { OPERATOR_ORG_ID, isRevokedMemberStatus } from '../authz';

type Firestore = admin.firestore.Firestore;

export type IneligibleReason = 'not-member' | 'feature-off';

export interface Eligibility {
  ok: boolean;
  reason?: IneligibleReason;
  orgId?: string | null;
}

/** As the rules' notDeactivated(): true only for an operator-org member doc whose status revokes access. */
export async function isDeactivatedOperatorMember(
  db: Firestore,
  email: string
): Promise<boolean> {
  const member = await db
    .doc(`organizations/${OPERATOR_ORG_ID}/members/${email.toLowerCase()}`)
    .get();
  return member.exists && isRevokedMemberStatus(member.get('status'));
}

/** Active org member via the email's verified domain, or a SpartBoard admin who is not deactivated. */
export async function isActiveOrgMemberOrAdmin(
  db: Firestore,
  email: string
): Promise<{ ok: boolean; orgId: string | null }> {
  const lower = email.toLowerCase();
  const [adminDoc, deactivated] = await Promise.all([
    db.collection('admins').doc(lower).get(),
    isDeactivatedOperatorMember(db, lower),
  ]);
  const domain = normalizeEmailDomain(lower);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (deactivated) return { ok: false, orgId };
  if (adminDoc.exists) return { ok: true, orgId };
  if (!orgId) return { ok: false, orgId: null };
  const member = await db.doc(`organizations/${orgId}/members/${lower}`).get();
  const status: unknown = member.exists ? member.get('status') : undefined;
  return { ok: member.exists && !isRevokedMemberStatus(status), orgId };
}

export async function isConnectorFeatureGranted(
  db: Firestore,
  email: string,
  uid: string
): Promise<boolean> {
  // Lazy: quizMediaArchive pulls heavy deps the OAuth endpoints don't otherwise need.
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  return isGlobalFeatureGranted(db, CONNECTOR_FEATURE_ID, email, uid);
}

export async function checkEligibility(
  db: Firestore,
  uid: string,
  email: string
): Promise<Eligibility> {
  const membership = await isActiveOrgMemberOrAdmin(db, email);
  if (!membership.ok) {
    return { ok: false, reason: 'not-member', orgId: membership.orgId };
  }
  if (!(await isConnectorFeatureGranted(db, email, uid))) {
    return { ok: false, reason: 'feature-off', orgId: membership.orgId };
  }
  return { ok: true, orgId: membership.orgId };
}

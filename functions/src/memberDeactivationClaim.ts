// Mirrors operator-org member deactivation onto the Auth account (uid-keyed claim plus refresh-token revocation).
import type * as admin from './firebaseAdmin';
import {
  DEACTIVATED_CLAIM,
  OPERATOR_ORG_ID,
  isRevokedMemberStatus,
} from './authz';

export type DeactivationClaimChange = 'set' | 'clear';

interface MemberStatusFields {
  status?: unknown;
}

/** The claim change a member-doc write needs; a deleted doc keeps the claim until an admin reactivates the member. */
export function deactivationClaimChange(
  orgId: string,
  before: MemberStatusFields | null,
  after: MemberStatusFields | null
): DeactivationClaimChange | null {
  if (orgId !== OPERATOR_ORG_ID || after === null) return null;
  const was = before !== null && isRevokedMemberStatus(before.status);
  const now = after !== null && isRevokedMemberStatus(after.status);
  if (now === was) return null;
  return now ? 'set' : 'clear';
}

/** The claim the member doc's current state calls for; null when the doc is gone. */
export function deactivationClaimTarget(
  current: MemberStatusFields | null
): DeactivationClaimChange | null {
  if (current === null) return null;
  return isRevokedMemberStatus(current.status) ? 'set' : 'clear';
}

function isUserNotFound(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 'auth/user-not-found';
}

/** Sets or clears the claim on the member's linked uid and the account holding the address; 'set' also ends live sessions. Returns the uids changed. */
export async function applyDeactivationClaim(
  auth: Pick<
    admin.auth.Auth,
    'getUser' | 'getUserByEmail' | 'setCustomUserClaims' | 'revokeRefreshTokens'
  >,
  emailLower: string,
  uidHint: unknown,
  change: DeactivationClaimChange
): Promise<string[]> {
  const users: admin.auth.UserRecord[] = [];
  const lookups: Array<() => Promise<admin.auth.UserRecord>> = [];
  if (typeof uidHint === 'string' && uidHint) {
    lookups.push(() => auth.getUser(uidHint));
  }
  if (emailLower) lookups.push(() => auth.getUserByEmail(emailLower));
  for (const lookup of lookups) {
    try {
      const user = await lookup();
      if (!users.some((u) => u.uid === user.uid)) users.push(user);
    } catch (err) {
      if (!isUserNotFound(err)) throw err;
    }
  }
  const changed: string[] = [];
  for (const user of users) {
    const claims: Record<string, unknown> = { ...(user.customClaims ?? {}) };
    const has = claims[DEACTIVATED_CLAIM] === true;
    if (change === 'set') {
      if (!has) {
        claims[DEACTIVATED_CLAIM] = true;
        await auth.setCustomUserClaims(user.uid, claims);
      }
      await auth.revokeRefreshTokens(user.uid);
      changed.push(user.uid);
    } else if (has) {
      delete claims[DEACTIVATED_CLAIM];
      await auth.setCustomUserClaims(user.uid, claims);
      changed.push(user.uid);
    }
  }
  return changed;
}

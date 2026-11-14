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

/** True when a member-doc write may change the claim: any create or delete, or a revoked-status flip. */
export function deactivationClaimSyncNeeded(
  orgId: string,
  before: MemberStatusFields | null,
  after: MemberStatusFields | null
): boolean {
  if (orgId !== OPERATOR_ORG_ID) return false;
  if (before === null || after === null) return true;
  return (
    isRevokedMemberStatus(before.status) !== isRevokedMemberStatus(after.status)
  );
}

/** The claim the member doc's current state calls for; a gone or live doc clears it. */
export function deactivationClaimTarget(
  current: MemberStatusFields | null
): DeactivationClaimChange {
  if (current === null) return 'clear';
  return isRevokedMemberStatus(current.status) ? 'set' : 'clear';
}

// Unmappable lookups (no such account, malformed email or uid) never succeed on retry.
const SKIPPABLE_LOOKUP_CODES = [
  'auth/user-not-found',
  'auth/invalid-email',
  'auth/invalid-uid',
];
function isUserNotFound(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && SKIPPABLE_LOOKUP_CODES.includes(code);
}

/** Sets or clears the claim on the member's linked uid and the account holding the address; 'set' also ends live sessions. Returns the uids changed. */
export async function applyDeactivationClaim(
  auth: Pick<
    admin.auth.Auth,
    'getUser' | 'getUserByEmail' | 'setCustomUserClaims' | 'revokeRefreshTokens'
  >,
  emailLower: string,
  uidHint: unknown,
  change: DeactivationClaimChange,
  isLiveMember?: (emailLower: string) => Promise<boolean>
): Promise<string[]> {
  const users: admin.auth.UserRecord[] = [];
  const lookups: Array<() => Promise<admin.auth.UserRecord | null>> = [];
  if (typeof uidHint === 'string' && uidHint) {
    lookups.push(async () => {
      const user = await auth.getUser(uidHint);
      const current = user.email?.toLowerCase() ?? '';
      // A linked account that moved to another live member address is that member now, not this one.
      const movedToLive =
        change === 'set' &&
        !!isLiveMember &&
        !!current &&
        current !== emailLower &&
        (await isLiveMember(current));
      return movedToLive ? null : user;
    });
  }
  if (emailLower) lookups.push(() => auth.getUserByEmail(emailLower));
  for (const lookup of lookups) {
    try {
      const user = await lookup();
      if (user && !users.some((u) => u.uid === user.uid)) users.push(user);
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

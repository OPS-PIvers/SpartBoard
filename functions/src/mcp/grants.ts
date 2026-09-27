// Grant lifecycle: one grant per Claude connection, under users/{uid}/mcp_grants (CC-D10).
import type * as admin from 'firebase-admin';
import {
  ACCESS_TOKEN_TTL_S,
  REFRESH_IDLE_TTL_MS,
  REFRESH_REUSE_GRACE_MS,
  SCOPE,
} from './config';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  randomToken,
  safeEqual,
  sha256,
  signAccessToken,
} from './tokens';
import { checkEligibility } from './eligibility';

type Firestore = admin.firestore.Firestore;

export interface GrantDoc {
  clientName: string;
  email: string;
  orgId: string | null;
  createdAt: number;
  lastRefreshedAt: number;
  refreshHash: string;
  prevRefreshHash: string | null;
  rotatedAt: number;
  refreshExpiresAt: number;
  revokedAt: number | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export class OAuthError extends Error {
  constructor(
    readonly code: 'invalid_grant' | 'invalid_request' | 'access_denied',
    message: string
  ) {
    super(message);
  }
}

export const grantRef = (db: Firestore, uid: string, grantId: string) =>
  db.doc(`users/${uid}/mcp_grants/${grantId}`);

async function issue(
  db: Firestore,
  uid: string,
  email: string,
  grantId: string,
  secret: string
): Promise<TokenResponse> {
  return {
    access_token: await signAccessToken(db, { uid, email, grantId }),
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: encodeRefreshToken(uid, grantId, secret),
    scope: SCOPE,
  };
}

export async function createGrant(
  db: Firestore,
  input: {
    uid: string;
    email: string;
    clientName: string;
    orgId: string | null;
  },
  now = Date.now()
): Promise<TokenResponse> {
  const ref = db.collection(`users/${input.uid}/mcp_grants`).doc();
  const secret = randomToken();
  const doc: GrantDoc = {
    clientName: input.clientName.slice(0, 80),
    email: input.email,
    orgId: input.orgId,
    createdAt: now,
    lastRefreshedAt: now,
    refreshHash: sha256(secret),
    prevRefreshHash: null,
    rotatedAt: now,
    refreshExpiresAt: now + REFRESH_IDLE_TTL_MS,
    revokedAt: null,
  };
  await ref.set(doc);
  return issue(db, input.uid, input.email, ref.id, secret);
}

/** Rotate a refresh token; re-checks membership and the gate (CC-D5, CC-D7). */
export async function refreshGrant(
  db: Firestore,
  refreshToken: string,
  now = Date.now()
): Promise<TokenResponse> {
  const parsed = decodeRefreshToken(refreshToken);
  if (!parsed) throw new OAuthError('invalid_grant', 'Malformed refresh token');
  const ref = grantRef(db, parsed.uid, parsed.grantId);
  const presented = sha256(parsed.secret);

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const grant = snap.exists ? (snap.data() as GrantDoc) : null;
    if (!grant || grant.revokedAt !== null) return { kind: 'dead' as const };
    if (now > grant.refreshExpiresAt) return { kind: 'dead' as const };
    const isCurrent = safeEqual(presented, grant.refreshHash);
    const isRetry =
      !isCurrent &&
      grant.prevRefreshHash !== null &&
      safeEqual(presented, grant.prevRefreshHash) &&
      now - grant.rotatedAt <= REFRESH_REUSE_GRACE_MS;
    if (!isCurrent && !isRetry) {
      // A stale token replayed outside the retry window: treat the grant as stolen.
      if (
        grant.prevRefreshHash !== null &&
        safeEqual(presented, grant.prevRefreshHash)
      ) {
        tx.update(ref, { revokedAt: now });
      }
      return { kind: 'dead' as const };
    }
    const secret = randomToken();
    tx.update(ref, {
      refreshHash: sha256(secret),
      prevRefreshHash: isCurrent ? grant.refreshHash : grant.prevRefreshHash,
      rotatedAt: now,
      lastRefreshedAt: now,
      refreshExpiresAt: now + REFRESH_IDLE_TTL_MS,
    });
    return { kind: 'ok' as const, secret, email: grant.email };
  });

  if (outcome.kind === 'dead') {
    throw new OAuthError('invalid_grant', 'Refresh token is no longer valid');
  }
  const eligibility = await checkEligibility(db, parsed.uid, outcome.email);
  if (!eligibility.ok) {
    await ref.update({ revokedAt: now });
    throw new OAuthError('invalid_grant', 'Access to SpartBoard was removed');
  }
  return issue(db, parsed.uid, outcome.email, parsed.grantId, outcome.secret);
}

/** RFC 7009: revoke by refresh token. Unknown tokens are not an error. */
export async function revokeByRefreshToken(
  db: Firestore,
  refreshToken: string,
  now = Date.now()
): Promise<void> {
  const parsed = decodeRefreshToken(refreshToken);
  if (!parsed) return;
  const ref = grantRef(db, parsed.uid, parsed.grantId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const grant = snap.data() as GrantDoc;
  if (safeEqual(sha256(parsed.secret), grant.refreshHash)) {
    await ref.update({ revokedAt: now });
  }
}

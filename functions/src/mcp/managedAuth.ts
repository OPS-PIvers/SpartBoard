// Enterprise Managed Auth: exchange a Claude-issued identity assertion (ID-JAG) for an access token.
import * as admin from '../firebaseAdmin';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import {
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from '../classlinkShared';
import { publicOrigin, resourceUrl } from './config';
import { checkEligibility } from './eligibility';
import { OAuthError, issueManagedGrant } from './grants';
import type { ManagedTokenResponse } from './grants';
import { sha256, verifyClientId } from './tokens';
import { MANAGED_AUTH_SETTINGS_PATH, isSwitchOn } from './switches';

type Firestore = admin.firestore.Firestore;

export const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
export const ID_JAG_TYP = 'oauth-id-jag+jwt';
/** Org field an org's domain admins set in Organization > Overview. */
export const MANAGED_AUTH_FIELD = 'claudeManagedAuth';

const CLOCK_SKEW_S = 60;
const DISCOVERY_CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const MAX_DOC_BYTES = 64 * 1024;
const JTI_COLLECTION = 'mcp_oauth_jti';
const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface ManagedUser {
  uid: string;
  emailVerified: boolean;
  student: boolean;
}

/** I/O seams so tests can supply keys, documents, users and a clock. */
export interface ManagedAuthDeps {
  fetchJson: (url: string) => Promise<unknown>;
  keySet: (jwksUri: string) => JWTVerifyGetKey;
  getUserByEmail: (email: string) => Promise<ManagedUser | null>;
  now: () => number;
}

const discoveryCache = new Map<string, { jwksUri: string; at: number }>();
const keySets = new Map<string, JWTVerifyGetKey>();

/** Test hook. */
export function resetManagedAuthCache(): void {
  discoveryCache.clear();
  keySets.clear();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_DOC_BYTES) throw new Error('document too large');
  return JSON.parse(text) as unknown;
}

export const defaultDeps: ManagedAuthDeps = {
  fetchJson,
  keySet: (jwksUri) => {
    let set = keySets.get(jwksUri);
    if (!set) {
      set = createRemoteJWKSet(new URL(jwksUri), {
        timeoutDuration: FETCH_TIMEOUT_MS,
      });
      keySets.set(jwksUri, set);
    }
    return set;
  },
  getUserByEmail: async (email) => {
    try {
      const user = await admin.auth().getUserByEmail(email);
      return {
        uid: user.uid,
        emailVerified: user.emailVerified,
        student: user.customClaims?.studentRole === true,
      };
    } catch {
      return null;
    }
  },
  now: () => Date.now(),
};

export const isManagedAuthEnabled = (db: Firestore, now = Date.now()) =>
  isSwitchOn(db, MANAGED_AUTH_SETTINGS_PATH, now);

/** An issuer an admin may register: a plain https URL. */
export function isValidIssuerUrl(raw: string): boolean {
  if (raw.length > 300) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

interface OrgManagedAuth {
  enabled: boolean;
  issuer: string;
}

function readConfig(raw: unknown): OrgManagedAuth | null {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Record<string, unknown>;
  if (typeof cfg.issuer !== 'string') return null;
  return { enabled: cfg.enabled === true, issuer: cfg.issuer };
}

const deny = (message: string) => new OAuthError('invalid_grant', message);

/** Exactly one org: the one `aud_tenant` names, else the only org that registered `iss`. */
export async function resolveOrg(
  db: Firestore,
  iss: string,
  audTenant: unknown
): Promise<string> {
  if (audTenant !== undefined) {
    if (typeof audTenant !== 'string' || !ORG_ID_RE.test(audTenant)) {
      throw deny('Unknown tenant');
    }
    const snap = await db.doc(`organizations/${audTenant}`).get();
    const cfg = snap.exists ? readConfig(snap.get(MANAGED_AUTH_FIELD)) : null;
    if (!cfg?.enabled || cfg.issuer !== iss) {
      throw deny('Issuer is not trusted for this tenant');
    }
    return audTenant;
  }
  const hits = await db
    .collection('organizations')
    .where(`${MANAGED_AUTH_FIELD}.issuer`, '==', iss)
    .get();
  // Only switched-on orgs count, so a switched-off copy of another org's issuer can't block it.
  const live = hits.docs.filter(
    (d) => readConfig(d.get(MANAGED_AUTH_FIELD))?.enabled === true
  );
  if (live.length !== 1) throw deny('Issuer is not trusted');
  return live[0].id;
}

async function jwksUriFor(iss: string, deps: ManagedAuthDeps): Promise<string> {
  const now = deps.now();
  const hit = discoveryCache.get(iss);
  if (hit && now - hit.at < DISCOVERY_CACHE_MS) return hit.jwksUri;
  let doc: unknown;
  try {
    doc = await deps.fetchJson(
      `${iss.replace(/\/+$/, '')}/.well-known/openid-configuration`
    );
  } catch {
    throw deny('Issuer discovery failed');
  }
  const d = (doc ?? {}) as Record<string, unknown>;
  if (d.issuer !== iss) throw deny('Issuer discovery mismatch');
  const jwksUri = typeof d.jwks_uri === 'string' ? d.jwks_uri : '';
  if (!isValidIssuerUrl(jwksUri)) throw deny('Issuer has no usable jwks_uri');
  discoveryCache.set(iss, { jwksUri, at: now });
  return jwksUri;
}

async function claimJti(
  db: Firestore,
  iss: string,
  jti: string,
  exp: number
): Promise<void> {
  try {
    await db
      .collection(JTI_COLLECTION)
      .doc(sha256(`${iss}\n${jti}`))
      .create({
        expireAt: admin.firestore.Timestamp.fromMillis(
          (exp + CLOCK_SKEW_S) * 1000
        ),
      });
  } catch {
    // Already used, or we could not check: either way the assertion is refused.
    throw deny('Assertion was already used');
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** RFC 7523 jwt-bearer grant with the ID-JAG checks, in the order the Claude docs list them. */
export async function exchangeAssertion(
  db: Firestore,
  body: Record<string, unknown>,
  deps: ManagedAuthDeps = defaultDeps
): Promise<ManagedTokenResponse> {
  if (!(await isManagedAuthEnabled(db, deps.now()))) {
    throw new OAuthError('invalid_request', 'jwt-bearer is not enabled');
  }
  const assertion = str(body.assertion);
  const clientId = str(body.client_id);
  if (!assertion || !clientId) {
    throw new OAuthError(
      'invalid_request',
      'assertion and client_id are required'
    );
  }
  const resource = str(body.resource);
  if (resource && resource.replace(/\/+$/, '') !== resourceUrl()) {
    throw new OAuthError('invalid_target', 'Unknown resource');
  }
  const client = await verifyClientId(db, clientId);
  if (!client) throw deny('Unknown client');

  let unverified: JWTPayload;
  try {
    unverified = decodeJwt(assertion);
  } catch {
    throw deny('Malformed assertion');
  }
  const iss = str(unverified.iss);
  if (!isValidIssuerUrl(iss)) throw deny('Issuer is not trusted');

  // 1. Issuer, against the one org it resolves to, before any key fetch.
  const orgId = await resolveOrg(db, iss, unverified.aud_tenant);

  // 2-5, 8. Keys from the issuer's own discovery document, signature, typ, aud and time.
  const jwksUri = await jwksUriFor(iss, deps);
  const nowS = Math.floor(deps.now() / 1000);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(assertion, deps.keySet(jwksUri), {
      issuer: iss,
      audience: publicOrigin(),
      algorithms: ['ES256', 'RS256'],
      typ: ID_JAG_TYP,
      clockTolerance: CLOCK_SKEW_S,
      requiredClaims: ['sub', 'jti', 'exp', 'iat'],
      currentDate: new Date(deps.now()),
    }));
  } catch {
    throw deny('Assertion did not verify');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowS + CLOCK_SKEW_S) {
    throw deny('Assertion issued in the future');
  }

  // 6-7. Client and subject.
  if (payload.client_id !== clientId)
    throw deny('Assertion is for another client');
  if (!str(payload.sub)) throw deny('Assertion has no subject');

  // Claude-issued: find the user by email, only on a domain this org has verified.
  const email = str(payload.email).toLowerCase();
  const domain = email ? normalizeEmailDomain(email) : '';
  if (!domain || (await resolveOrgIdForDomain(db, domain)) !== orgId) {
    throw deny('Email is not on a verified domain of this organization');
  }
  const user = await deps.getUserByEmail(email);
  if (!user || !user.emailVerified || user.student) {
    throw deny('No SpartBoard teacher account for this email');
  }
  const eligibility = await checkEligibility(db, user.uid, email);
  if (!eligibility.ok || eligibility.orgId !== orgId) {
    throw deny('This account cannot connect Claude yet');
  }

  // 9. Replay, last, so a refused assertion never burns its jti.
  const jti = str(payload.jti);
  if (!jti || jti.length > 256 || typeof payload.exp !== 'number') {
    throw deny('Assertion has no usable jti');
  }
  await claimJti(db, iss, jti, payload.exp);

  return issueManagedGrant(db, {
    uid: user.uid,
    email,
    orgId,
    issuer: iss,
    clientName: client.clientName,
  });
}

// Schoology LTI 1.3 — inbound launch-JWT validation.
//
// Verifies the platform-signed `id_token` against Schoology's JWKS and pulls the
// LTI/Advantage claims into a typed shape. The `nonce` is returned here but matched
// against the single-use OIDC-state store by the caller (see stores.ts) — this module
// only proves the token is authentic and well-formed.

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';
import {
  LTI,
  SCHOOLOGY_ISSUER,
  SCHOOLOGY_JWKS_URI,
  MESSAGE_TYPE_RESOURCE_LINK,
  MESSAGE_TYPE_DEEP_LINKING,
} from './config';

export type LtiRole = 'student' | 'teacher' | 'unknown';

export interface AgsEndpoint {
  scope: string[];
  lineitems?: string;
  lineitem?: string;
}
export interface NrpsEndpoint {
  contextMembershipsUrl?: string;
}

export interface LtiLaunchClaims {
  payload: JWTPayload;
  sub: string;
  messageType: string;
  isResourceLink: boolean;
  isDeepLinking: boolean;
  deploymentId: string;
  roles: string[];
  role: LtiRole;
  contextId: string | null;
  contextTitle: string | null;
  resourceLinkId: string | null;
  nonce: string;
  targetLinkUri: string | null;
  ags: AgsEndpoint | null;
  nrps: NrpsEndpoint | null;
  deepLinking: Record<string, unknown> | null;
  custom: Record<string, unknown> | null;
  email: string | null;
  name: string | null;
}

// jose accepts either a key (KeyLike/Uint8Array) or a key-getter (JWTVerifyGetKey,
// e.g. a remote JWKS) as the 2nd arg to jwtVerify.
type KeyInput = KeyLike | Uint8Array | JWTVerifyGetKey;

let cachedRemoteJwks: JWTVerifyGetKey | null = null;
function remoteJwks(): JWTVerifyGetKey {
  if (!cachedRemoteJwks) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(SCHOOLOGY_JWKS_URI));
  }
  return cachedRemoteJwks;
}

export interface VerifyLaunchOpts {
  /** Our registered client_id — validated as the JWT `aud`. */
  clientId: string;
  /** If provided, the launch `deployment_id` claim must match. */
  expectedDeploymentId?: string;
  /** Defaults to the Schoology issuer constant. */
  issuer?: string;
  /** Injectable key/getter for tests; defaults to the cached remote JWKS. */
  keyInput?: KeyInput;
  /** Clock skew tolerance in seconds (default 60). */
  clockToleranceSec?: number;
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** LTI membership role URIs end in `#Instructor` / `#Learner` (+ a few variants). */
export function deriveRole(roles: string[]): LtiRole {
  const hay = roles.join(' ');
  if (
    /#Instructor\b|\/Instructor\b|\bInstructor\b|TeachingAssistant/.test(hay)
  ) {
    return 'teacher';
  }
  if (/#Learner\b|\/Learner\b|\bLearner\b|\bStudent\b/.test(hay)) {
    return 'student';
  }
  return 'unknown';
}

/**
 * Verifies a Schoology LTI launch `id_token`. Throws on any signature/claim
 * failure (jose enforces sig + iss + aud + exp/iat). Returns the parsed claims.
 */
export async function verifyLaunchJwt(
  idToken: string,
  opts: VerifyLaunchOpts
): Promise<LtiLaunchClaims> {
  const issuer = opts.issuer ?? SCHOOLOGY_ISSUER;
  const keyInput = opts.keyInput ?? remoteJwks();

  const verifyOptions = {
    issuer,
    audience: opts.clientId,
    clockTolerance: opts.clockToleranceSec ?? 60,
    // Pin the signature algorithm. Schoology signs LTI id_tokens with RS256;
    // without an explicit allowlist jose accepts whatever the resolved JWKS key
    // permits, so pinning here is defense-in-depth against algorithm
    // substitution if the key source ever changes.
    algorithms: ['RS256'],
  };
  // Branch so TS resolves the correct jwtVerify overload (key vs key-getter).
  const { payload } =
    typeof keyInput === 'function'
      ? await jwtVerify(idToken, keyInput, verifyOptions)
      : await jwtVerify(idToken, keyInput, verifyOptions);

  const version = asString(payload[LTI.VERSION]);
  if (version && version !== '1.3.0') {
    throw new Error(`Unsupported LTI version: ${version}`);
  }

  const messageType = asString(payload[LTI.MESSAGE_TYPE]) ?? '';
  const isResourceLink = messageType === MESSAGE_TYPE_RESOURCE_LINK;
  const isDeepLinking = messageType === MESSAGE_TYPE_DEEP_LINKING;
  if (!isResourceLink && !isDeepLinking) {
    throw new Error(`Unsupported LTI message_type: ${messageType || '(none)'}`);
  }

  const deploymentId = asString(payload[LTI.DEPLOYMENT_ID]) ?? '';
  if (!deploymentId) throw new Error('Missing deployment_id claim');
  if (opts.expectedDeploymentId && deploymentId !== opts.expectedDeploymentId) {
    throw new Error('deployment_id mismatch');
  }

  const nonce = asString(payload.nonce);
  if (!nonce) throw new Error('Missing nonce claim');

  const sub = asString(payload.sub);
  // Deep-linking launches still carry a sub; require it for both message types.
  if (!sub) throw new Error('Missing sub claim');

  const rolesRaw = payload[LTI.ROLES];
  const roles = Array.isArray(rolesRaw)
    ? rolesRaw.filter((r): r is string => typeof r === 'string')
    : [];

  const context = asRecord(payload[LTI.CONTEXT]);
  const resourceLink = asRecord(payload[LTI.RESOURCE_LINK]);
  const agsRaw = asRecord(payload[LTI.AGS_ENDPOINT]);
  const nrpsRaw = asRecord(payload[LTI.NRPS]);
  const dlRaw = asRecord(payload[LTI.DL_SETTINGS]);
  const customRaw = asRecord(payload[LTI.CUSTOM]);

  // Build without `undefined` fields — Firestore rejects undefined values, and a
  // deep-linking launch has no single `lineitem` yet (only `lineitems`).
  let ags: AgsEndpoint | null = null;
  if (agsRaw) {
    ags = {
      scope: Array.isArray(agsRaw.scope)
        ? agsRaw.scope.filter((s): s is string => typeof s === 'string')
        : [],
    };
    const lineitems = asString(agsRaw.lineitems);
    if (lineitems) ags.lineitems = lineitems;
    const lineitem = asString(agsRaw.lineitem);
    if (lineitem) ags.lineitem = lineitem;
  }

  let nrps: NrpsEndpoint | null = null;
  if (nrpsRaw) {
    nrps = {};
    const url = asString(nrpsRaw.context_memberships_url);
    if (url) nrps.contextMembershipsUrl = url;
  }

  return {
    payload,
    sub,
    messageType,
    isResourceLink,
    isDeepLinking,
    deploymentId,
    roles,
    role: deriveRole(roles),
    contextId: context ? asString(context.id) : null,
    contextTitle: context ? asString(context.title) : null,
    resourceLinkId: resourceLink ? asString(resourceLink.id) : null,
    nonce,
    targetLinkUri: asString(payload[LTI.TARGET_LINK_URI]),
    ags,
    nrps,
    deepLinking: dlRaw,
    custom: customRaw,
    email: asString(payload.email),
    name: asString(payload.name),
  };
}

/**
 * Where ltiLaunch sends the browser after validating: deep-linking → teacher picker,
 * Instructor resource-link → grader, Learner → runner. Pure (unit-tested).
 */
export function launchRedirectTarget(
  role: LtiRole,
  isDeepLinking: boolean
): { path: string; deeplink: boolean } {
  if (isDeepLinking) return { path: '/lti/teacher', deeplink: true };
  if (role === 'teacher') return { path: '/lti/teacher', deeplink: false };
  return { path: '/lti/student', deeplink: false };
}

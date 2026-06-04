// Schoology LTI 1.3 — tool-side JWT signing.
//
// Signs RS256 JWTs with the tool's PRIVATE key (Secret Manager: LTI_TOOL_PRIVATE_KEY),
// stamped with the kid published at /.well-known/jwks.json so Schoology can verify
// them against our JWKS. Used for:
//   • the LtiDeepLinkingResponse (attaching a resource)
//   • the OAuth2 client_credentials client_assertion (AGS/NRPS access tokens)

import { importPKCS8, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { TOOL_SIGNING_KID } from './toolJwks';

// jose's importPKCS8 returns a KeyLike; cache by PEM so we don't re-import per call.
let cached: {
  pem: string;
  key: Awaited<ReturnType<typeof importPKCS8>>;
} | null = null;

async function signingKey(pem: string) {
  if (cached && cached.pem === pem) return cached.key;
  const key = await importPKCS8(pem, 'RS256');
  cached = { pem, key };
  return key;
}

export interface SignToolJwtOptions {
  /** JWT `iss` (and, for client assertions, `sub`) — our client_id. */
  issuer: string;
  /** JWT `aud` — the platform token endpoint (assertion) or issuer (deep-link). */
  audience: string | string[];
  /** JWT `sub`. Defaults to `issuer` (the client_credentials convention). */
  subject?: string;
  /** Lifetime in seconds (default 300). */
  expiresInSec?: number;
  /** Additional top-level claims (e.g. the LTI deep-linking claims). */
  claims?: Record<string, unknown>;
}

/**
 * Signs an RS256 JWT with the tool private key. Always sets a random `jti`
 * (required for client_credentials assertions; harmless elsewhere).
 */
export async function signToolJwt(
  privatePem: string,
  opts: SignToolJwtOptions
): Promise<string> {
  const key = await signingKey(privatePem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...(opts.claims ?? {}) })
    .setProtectedHeader({ alg: 'RS256', kid: TOOL_SIGNING_KID, typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(opts.issuer)
    .setSubject(opts.subject ?? opts.issuer)
    .setAudience(opts.audience)
    .setExpirationTime(now + (opts.expiresInSec ?? 300))
    .setJti(randomBytes(16).toString('hex'))
    .sign(key);
}

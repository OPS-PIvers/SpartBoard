// Token minting and verification for the Claude connector's OAuth server (CC-D1).
import type * as admin from 'firebase-admin';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import {
  ACCESS_TOKEN_TTL_S,
  isAllowedRedirectUri,
  publicOrigin,
  resourceUrl,
} from './config';

type Firestore = admin.firestore.Firestore;

const KEY_DOC = 'mcp_oauth/keys';
const CLIENT_AUDIENCE = 'mcp-client';

let cachedKey: Uint8Array | null = null;

/** HS256 key generated on first use into a server-only doc (plan: "Signing key"). */
export async function getSigningKey(db: Firestore): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const ref = db.doc(KEY_DOC);
  const snap = await ref.get();
  let encoded = snap.exists ? (snap.get('hs256') as unknown) : undefined;
  if (typeof encoded !== 'string') {
    const fresh = randomBytes(32).toString('base64');
    try {
      await ref.create({ hs256: fresh, createdAt: Date.now() });
      encoded = fresh;
    } catch {
      // Another instance created it first.
      encoded = (await ref.get()).get('hs256') as unknown;
    }
  }
  if (typeof encoded !== 'string') throw new Error('mcp signing key missing');
  cachedKey = new Uint8Array(Buffer.from(encoded, 'base64'));
  return cachedKey;
}

/** Test hook: forget the cached key. */
export function resetSigningKeyCache(): void {
  cachedKey = null;
}

export const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString('base64url');

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) == challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(sha256(verifier), challenge);
}

export interface RegisteredClient {
  redirectUris: string[];
  clientName: string;
}

/** Stateless DCR: the client_id itself carries the (already allowlisted) redirect URIs. */
export async function signClientId(
  db: Firestore,
  client: RegisteredClient
): Promise<string> {
  return new SignJWT({ ru: client.redirectUris, cn: client.clientName })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(publicOrigin())
    .setAudience(CLIENT_AUDIENCE)
    .setIssuedAt()
    .sign(await getSigningKey(db));
}

export async function verifyClientId(
  db: Firestore,
  clientId: string
): Promise<RegisteredClient | null> {
  try {
    const { payload } = await jwtVerify(clientId, await getSigningKey(db), {
      issuer: publicOrigin(),
      audience: CLIENT_AUDIENCE,
      algorithms: ['HS256'],
    });
    const ru = Array.isArray(payload.ru)
      ? payload.ru.filter((u): u is string => typeof u === 'string')
      : [];
    if (ru.length === 0 || !ru.every(isAllowedRedirectUri)) return null;
    const cn = typeof payload.cn === 'string' ? payload.cn : 'Claude';
    return { redirectUris: ru, clientName: cn };
  } catch {
    return null;
  }
}

export interface AccessClaims {
  uid: string;
  email: string;
  grantId: string;
}

export async function signAccessToken(
  db: Firestore,
  claims: AccessClaims
): Promise<string> {
  return new SignJWT({ email: claims.email, gid: claims.grantId })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(publicOrigin())
    .setAudience(resourceUrl())
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_S}s`)
    .sign(await getSigningKey(db));
}

export async function verifyAccessToken(
  db: Firestore,
  token: string
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, await getSigningKey(db), {
      issuer: publicOrigin(),
      audience: resourceUrl(),
      algorithms: ['HS256'],
      typ: 'at+jwt',
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.gid !== 'string'
    ) {
      return null;
    }
    return { uid: payload.sub, email: payload.email, grantId: payload.gid };
  } catch {
    return null;
  }
}

/** Opaque refresh token: `<b64url(uid:gid)>.<secret>`; only sha256(secret) is stored. */
export function encodeRefreshToken(
  uid: string,
  grantId: string,
  secret: string
): string {
  return `${Buffer.from(`${uid}:${grantId}`).toString('base64url')}.${secret}`;
}

export function decodeRefreshToken(
  token: string
): { uid: string; grantId: string; secret: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const head = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  const secret = token.slice(dot + 1);
  const sep = head.lastIndexOf(':');
  if (sep <= 0 || !secret) return null;
  const uid = head.slice(0, sep);
  const grantId = head.slice(sep + 1);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(grantId)) return null;
  return { uid, grantId, secret };
}

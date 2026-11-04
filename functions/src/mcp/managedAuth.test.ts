import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey, JWK } from 'jose';
import type * as admin from '../firebaseAdmin';
import { makeStubFirestore } from '../testing/stubFirestore';
import { publicOrigin, resourceUrl } from './config';
import { resetSigningKeyCache, verifyAccessToken } from './tokens';
import {
  authorizationServerMetadata,
  handleRegister,
  handleToken,
} from './oauthEndpoints';
import { refreshGrant } from './grants';
import { isGrantActive } from './mcpEndpoint';
import { encodeRefreshToken } from './tokens';
import {
  ID_JAG_TYP,
  JWT_BEARER_GRANT,
  exchangeAssertion,
  isValidIssuerUrl,
  resetManagedAuthCache,
} from './managedAuth';
import type { ManagedAuthDeps, ManagedUser } from './managedAuth';
import { resetSwitchCache } from './switches';

type Firestore = admin.firestore.Firestore;

const ISS = 'https://identity.anthropic.com/issuers/abc123';
const TEACHER = 'teacher@orono.k12.mn.us';
const NOW = 1_790_000_000_000;

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeEach(async () => {
  resetSigningKeyCache();
  resetManagedAuthCache();
  resetSwitchCache();
  if (!privateKey) {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'k1',
      alg: 'ES256',
    };
  }
});

interface SeedOpts {
  switchOn?: boolean;
  orgs?: Record<string, { enabled: boolean; issuer: string } | undefined>;
}

function seed(opts: SeedOpts = {}) {
  const orgs = opts.orgs ?? { orono: { enabled: true, issuer: ISS } };
  const docs: Record<string, Record<string, unknown>> = {
    'organizations/orono/domains/d1': {
      domain: '@orono.k12.mn.us',
      status: 'verified',
    },
    [`organizations/orono/members/${TEACHER}`]: { status: 'active' },
    'global_permissions/claude-connector': {
      enabled: true,
      accessLevel: 'public',
    },
  };
  for (const [id, cfg] of Object.entries(orgs)) {
    docs[`organizations/${id}`] = cfg
      ? { name: id, claudeManagedAuth: cfg }
      : { name: id };
  }
  if (opts.switchOn !== false) {
    docs['admin_settings/claude_managed_auth'] = { enabled: true };
  }
  return makeStubFirestore(docs).db as unknown as Firestore;
}

function makeDeps(over: Partial<ManagedAuthDeps> = {}) {
  const users: Record<string, ManagedUser> = {
    [TEACHER]: { uid: 't1', emailVerified: true, student: false },
  };
  const fetchJson = vi.fn((url: string) =>
    Promise.resolve(
      url === `${ISS}/.well-known/openid-configuration`
        ? { issuer: ISS, jwks_uri: `${ISS}/jwks` }
        : {}
    )
  );
  const deps: ManagedAuthDeps = {
    fetchJson,
    keySet: () => createLocalJWKSet({ keys: [publicJwk] }),
    getUserByEmail: (email) => Promise.resolve(users[email] ?? null),
    now: () => NOW,
    ...over,
  };
  return { deps, fetchJson };
}

async function clientIdFor(db: Firestore): Promise<string> {
  const out = await handleRegister(db, {
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    client_name: 'Claude',
  });
  return out.json.client_id as string;
}

let jtiCounter = 0;

async function assertion(
  clientId: string,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {}
): Promise<string> {
  const iat = Math.floor(NOW / 1000);
  jtiCounter += 1;
  const payload = {
    iss: ISS,
    sub: 'opaque-sub',
    email: TEACHER,
    aud: publicOrigin(),
    client_id: clientId,
    iat,
    nbf: iat - 15,
    exp: iat + 45,
    jti: `jti-${jtiCounter}`,
    ...claims,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: ID_JAG_TYP, kid: 'k1', ...header })
    .sign(privateKey);
}

async function exchange(
  db: Firestore,
  deps: ManagedAuthDeps,
  body: Record<string, unknown>
) {
  try {
    return { ok: true as const, json: await exchangeAssertion(db, body, deps) };
  } catch (err) {
    return { ok: false as const, error: (err as { code?: string }).code };
  }
}

describe('jwt-bearer exchange', () => {
  it('signs the right teacher in with no refresh token', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const clientId = await clientIdFor(db);
    const out = await exchange(db, deps, {
      grant_type: JWT_BEARER_GRANT,
      assertion: await assertion(clientId),
      client_id: clientId,
      resource: resourceUrl(),
    });
    if (!out.ok) throw new Error(`expected success, got ${out.error}`);
    expect(out.json).not.toHaveProperty('refresh_token');
    expect(out.json.expires_in).toBe(3600);
    const claims = await verifyAccessToken(db, out.json.access_token);
    expect(claims).toMatchObject({ uid: 't1', email: TEACHER });
    const grant = await db
      .doc(`users/t1/mcp_grants/${claims?.grantId ?? ''}`)
      .get();
    expect(grant.get('managedIssuer')).toBe(ISS);
    expect(grant.get('refreshExpiresAt')).toBe(0);
  });

  it('re-uses one grant per teacher and issuer, and it never refreshes', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const clientId = await clientIdFor(db);
    const first = await exchangeAssertion(
      db,
      { assertion: await assertion(clientId), client_id: clientId },
      deps
    );
    const second = await exchangeAssertion(
      db,
      { assertion: await assertion(clientId), client_id: clientId },
      deps
    );
    const a = await verifyAccessToken(db, first.access_token);
    const b = await verifyAccessToken(db, second.access_token);
    expect(a?.grantId).toBe(b?.grantId);
    await expect(
      refreshGrant(db, encodeRefreshToken('t1', a?.grantId ?? '', 'guess'))
    ).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('never revives a grant after Disconnect, so earlier tokens stay dead', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const clientId = await clientIdFor(db);
    const exchangeOnce = async () =>
      exchangeAssertion(
        db,
        { assertion: await assertion(clientId), client_id: clientId },
        deps
      );
    const before = await verifyAccessToken(
      db,
      (await exchangeOnce()).access_token
    );
    if (!before) throw new Error('expected claims');
    await db
      .doc(`users/t1/mcp_grants/${before.grantId}`)
      .update({ revokedAt: NOW });
    const after = await verifyAccessToken(
      db,
      (await exchangeOnce()).access_token
    );
    if (!after) throw new Error('expected claims');
    expect(after.grantId).not.toBe(before.grantId);
    expect(await isGrantActive(db, before, NOW + 1)).toBe(false);
    expect(await isGrantActive(db, after, NOW + 1)).toBe(true);
    const third = await verifyAccessToken(
      db,
      (await exchangeOnce()).access_token
    );
    expect(third?.grantId).toBe(after.grantId);
  });

  it('is refused while the switch is off and not advertised', async () => {
    const db = seed({ switchOn: false });
    const { deps } = makeDeps();
    const clientId = await clientIdFor(db);
    const out = await exchange(db, deps, {
      assertion: await assertion(clientId),
      client_id: clientId,
    });
    expect(out).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(
      authorizationServerMetadata(false, false).grant_types_supported
    ).not.toContain(JWT_BEARER_GRANT);
    expect(
      authorizationServerMetadata(true, true).grant_types_supported
    ).toContain(JWT_BEARER_GRANT);
  });

  it('routes through the token endpoint', async () => {
    const db = seed();
    const clientId = await clientIdFor(db);
    const out = await handleToken(db, {
      grant_type: JWT_BEARER_GRANT,
      assertion: 'not-a-jwt',
      client_id: clientId,
    });
    expect(out).toMatchObject({
      status: 400,
      json: { error: 'invalid_grant' },
    });
  });
});

describe('cases to check before launch', () => {
  async function refused(
    db: Firestore,
    deps: ManagedAuthDeps,
    build: (clientId: string) => Promise<Record<string, unknown>>
  ) {
    const clientId = await clientIdFor(db);
    const body = await build(clientId);
    return exchange(db, deps, { client_id: clientId, ...body });
  }

  it('refuses an issuer no org registered, before fetching any keys', async () => {
    const db = seed({ orgs: { orono: { enabled: true, issuer: `${ISS}x` } } });
    const { deps, fetchJson } = makeDeps();
    const out = await refused(db, deps, async (c) => ({
      assertion: await assertion(c),
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('refuses a prefix or trailing-slash variant of the issuer', async () => {
    const db = seed();
    const { deps } = makeDeps();
    for (const iss of [
      `${ISS}/`,
      'https://identity.anthropic.com/issuers/abc',
    ]) {
      const out = await refused(db, deps, async (c) => ({
        assertion: await assertion(c, { iss }),
      }));
      expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
    }
  });

  it('refuses an org that registered the issuer but has it turned off', async () => {
    const db = seed({ orgs: { orono: { enabled: false, issuer: ISS } } });
    const out = await refused(db, makeDeps().deps, async (c) => ({
      assertion: await assertion(c),
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses aud_tenant naming an org that registered a different issuer', async () => {
    const db = seed({
      orgs: {
        orono: { enabled: true, issuer: ISS },
        other: { enabled: true, issuer: 'https://idp.example.com' },
      },
    });
    const out = await refused(db, makeDeps().deps, async (c) => ({
      assertion: await assertion(c, { aud_tenant: 'other' }),
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses an issuer two orgs registered, unless aud_tenant picks one', async () => {
    const db = seed({
      orgs: {
        orono: { enabled: true, issuer: ISS },
        other: { enabled: true, issuer: ISS },
      },
    });
    const { deps } = makeDeps();
    const ambiguous = await refused(db, deps, async (c) => ({
      assertion: await assertion(c),
    }));
    expect(ambiguous).toMatchObject({ ok: false, error: 'invalid_grant' });
    const picked = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, { aud_tenant: 'orono' }),
    }));
    expect(picked.ok).toBe(true);
  });

  it('ignores a switched-off copy of the issuer in another org', async () => {
    const db = seed({
      orgs: {
        orono: { enabled: true, issuer: ISS },
        other: { enabled: false, issuer: ISS },
      },
    });
    const out = await refused(db, makeDeps().deps, async (c) => ({
      assertion: await assertion(c),
    }));
    expect(out.ok).toBe(true);
  });

  it('refuses the same assertion a second time', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const clientId = await clientIdFor(db);
    const body = { assertion: await assertion(clientId), client_id: clientId };
    expect((await exchange(db, deps, body)).ok).toBe(true);
    expect(await exchange(db, deps, body)).toMatchObject({
      ok: false,
      error: 'invalid_grant',
    });
  });

  it("refuses an aud that isn't this authorization server", async () => {
    const db = seed();
    for (const aud of [
      resourceUrl(),
      `${publicOrigin()}/`,
      'https://other.example',
      [publicOrigin(), 'https://other.example'],
    ]) {
      const out = await refused(db, makeDeps().deps, async (c) => ({
        assertion: await assertion(c, { aud }),
      }));
      expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
    }
  });

  it('accepts aud as a one-item array naming this server', async () => {
    const db = seed();
    const out = await refused(db, makeDeps().deps, async (c) => ({
      assertion: await assertion(c, { aud: [publicOrigin()] }),
    }));
    expect(out).toMatchObject({ ok: true });
  });

  it('finds the teacher by email on a verified domain, not by sub', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const ok = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, { sub: 'some-other-opaque-sub' }),
    }));
    expect(ok.ok).toBe(true);
    const otherDomain = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, { email: 'teacher@gmail.com' }),
    }));
    expect(otherDomain).toMatchObject({ ok: false, error: 'invalid_grant' });
    const noEmail = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, { email: undefined }),
    }));
    expect(noEmail).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses an unverified, missing or student account', async () => {
    const db = seed();
    for (const user of [
      null,
      { uid: 't1', emailVerified: false, student: false },
      { uid: 't1', emailVerified: true, student: true },
    ]) {
      const { deps } = makeDeps({
        getUserByEmail: () => Promise.resolve(user),
      });
      const out = await refused(db, deps, async (c) => ({
        assertion: await assertion(c),
      }));
      expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
    }
  });

  it('refuses a verified-domain address that is not an active member', async () => {
    const db = seed();
    const { deps } = makeDeps({
      getUserByEmail: () =>
        Promise.resolve({ uid: 't2', emailVerified: true, student: false }),
    });
    const out = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, { email: 'stranger@orono.k12.mn.us' }),
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses the wrong typ, an HMAC alg and a foreign key', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const badTyp = await refused(db, deps, async (c) => ({
      assertion: await assertion(c, {}, { typ: 'JWT' }),
    }));
    expect(badTyp).toMatchObject({ ok: false, error: 'invalid_grant' });
    const hmac = await refused(db, deps, async (c) => ({
      assertion: await new SignJWT({
        iss: ISS,
        sub: 's',
        email: TEACHER,
        aud: publicOrigin(),
        client_id: c,
        jti: 'h1',
      })
        .setProtectedHeader({ alg: 'HS256', typ: ID_JAG_TYP })
        .setIssuedAt(Math.floor(NOW / 1000))
        .setExpirationTime(Math.floor(NOW / 1000) + 45)
        .sign(new Uint8Array(32)),
    }));
    expect(hmac).toMatchObject({ ok: false, error: 'invalid_grant' });
    const stranger = await generateKeyPair('ES256');
    const foreign = await refused(db, deps, async (c) => ({
      assertion: await new SignJWT({
        iss: ISS,
        sub: 's',
        email: TEACHER,
        aud: publicOrigin(),
        client_id: c,
        jti: 'f1',
      })
        .setProtectedHeader({ alg: 'ES256', typ: ID_JAG_TYP, kid: 'k1' })
        .setIssuedAt(Math.floor(NOW / 1000))
        .setExpirationTime(Math.floor(NOW / 1000) + 45)
        .sign(stranger.privateKey),
    }));
    expect(foreign).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses another client, an expired assertion and a future iat', async () => {
    const db = seed();
    const { deps } = makeDeps();
    const nowS = Math.floor(NOW / 1000);
    for (const claims of [
      { client_id: 'someone-else' },
      { exp: nowS - 61, iat: nowS - 120, nbf: nowS - 120 },
      { iat: nowS + 120, nbf: nowS + 120, exp: nowS + 180 },
      { jti: undefined },
      { sub: undefined },
      { exp: nowS + 3600 },
    ]) {
      const out = await refused(db, deps, async (c) => ({
        assertion: await assertion(c, claims),
      }));
      expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
    }
  });

  it('refuses an issuer whose discovery document names someone else', async () => {
    const db = seed();
    const { deps } = makeDeps({
      fetchJson: () =>
        Promise.resolve({
          issuer: 'https://evil.example',
          jwks_uri: `${ISS}/jwks`,
        }),
    });
    const out = await refused(db, deps, async (c) => ({
      assertion: await assertion(c),
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('refuses a resource that is not this MCP server', async () => {
    const db = seed();
    const out = await refused(db, makeDeps().deps, async (c) => ({
      assertion: await assertion(c),
      resource: 'https://other.example/mcp',
    }));
    expect(out).toMatchObject({ ok: false, error: 'invalid_target' });
  });

  it('accepts only https issuer URLs', () => {
    expect(isValidIssuerUrl(ISS)).toBe(true);
    expect(isValidIssuerUrl('http://identity.anthropic.com/x')).toBe(false);
    expect(isValidIssuerUrl('https://x.example/?a=1')).toBe(false);
    expect(isValidIssuerUrl('not a url')).toBe(false);
    for (const host of [
      'https://10.0.0.1/x',
      'https://169.254.169.254/latest',
      'https://2130706433/x',
      'https://[::1]/x',
      'https://localhost/x',
      'https://metadata/x',
      'https://idp.example.com:8443/x',
    ]) {
      expect(isValidIssuerUrl(host)).toBe(false);
    }
  });
});
